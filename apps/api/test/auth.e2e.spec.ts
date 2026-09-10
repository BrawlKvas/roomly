import Database from 'better-sqlite3';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'roomly-auth-test-'));
const databasePath = join(directory, 'roomly.sqlite');
process.env.DATABASE_PATH = databasePath;

import { createRoomlyApplication } from '../src/bootstrap';
import { AdminGuard, AuthGuard } from '../src/auth/auth.guard';
import { AuthModule } from '../src/auth/auth.module';
import { HttpErrorFilter } from '../src/common/http-error.filter';
import { DatabaseModule } from '../src/database/database.module';

const projectRoot = resolve(__dirname, '../../..');

@Controller('test-access')
class TestAccessController {
  @Get('admin')
  @UseGuards(AuthGuard, AdminGuard)
  getAdminOnlyData(): { internalValue: string } {
    return { internalValue: 'visible-to-admin-only' };
  }
}

@Module({
  controllers: [TestAccessController],
  imports: [DatabaseModule, AuthModule],
})
class TestAccessModule {}

describe('authentication HTTP contract', () => {
  let app: NestExpressApplication;
  let accessApp: NestExpressApplication;

  beforeAll(async () => {
    for (const command of ['db:migrate', 'db:seed']) {
      execFileSync('npm', ['run', command], {
        cwd: resolve(projectRoot, 'apps/api'),
        env: { ...process.env, DATABASE_PATH: databasePath },
        stdio: 'pipe',
      });
    }
    app = await createRoomlyApplication({ serveStatic: false });
    await app.init();
    accessApp = await NestFactory.create<NestExpressApplication>(TestAccessModule, {
      logger: false,
    });
    accessApp.setGlobalPrefix('api/v1');
    accessApp.useGlobalFilters(new HttpErrorFilter());
    await accessApp.init();
  });

  afterAll(async () => {
    await app.close();
    await accessApp.close();
    rmSync(directory, { force: true, recursive: true });
  });

  it('creates an eight-hour HttpOnly session and exposes only the profile fields', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ email: ' \u00a0EMPLOYEE@northstar.local ', password: 'EmployeePass!2026' });

    expect(login.status).toBe(201);

    expect(login.body).toMatchObject({
      expiresAt: expect.any(String),
      user: { email: 'employee@northstar.local', name: 'Анна Соколова', role: 'employee' },
    });
    expect(Date.parse(login.body.expiresAt) - Date.now()).toBeGreaterThan(7.9 * 60 * 60 * 1000);
    const sessionCookie = login.headers['set-cookie']?.[0];
    expect(sessionCookie).toMatch(/Max-Age=28800; Path=.*HttpOnly; SameSite=Lax/);

    const profile = await agent.get('/api/v1/auth/me').expect(200);
    expect(profile.body.user).toEqual({
      name: 'Анна Соколова',
      email: 'employee@northstar.local',
      role: 'employee',
    });
    expect(profile.body.user).not.toHaveProperty('passwordHash');

    const token = sessionCookie?.match(/roomly_session=([^;]+)/)?.[1];
    const database = new Database(databasePath, { readonly: true });
    const storedToken = database
      .prepare('select token_hash from sessions where user_id = ?')
      .get('user-employee') as { token_hash: string };
    database.close();
    expect(storedToken.token_hash).not.toBe(token);
  });

  it('gives identical credential errors for an unknown email and an incorrect password', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@northstar.local', password: 'anything' })
      .expect(401);
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'employee@northstar.local', password: 'wrong password' })
      .expect(401);

    expect(unknown.body.message).toBe(wrongPassword.body.message);
    expect(unknown.headers['set-cookie']).toBeUndefined();
  });

  it('rejects protected reads after exact expiry without leaking a profile', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ email: 'admin@northstar.local', password: 'AdminPass!2026' })
      .expect(201);
    const database = new Database(databasePath);
    database.prepare("update sessions set expires_at = '2000-01-01T00:00:00.000Z'").run();
    database.close();

    const expired = await agent.get('/api/v1/auth/me').expect(401);
    expect(expired.body).not.toHaveProperty('user');
    expect(expired.body.message).toBe('Требуется вход в систему');
  });

  it('logs out only the current independent session', async () => {
    const first = request.agent(app.getHttpServer());
    const second = request.agent(app.getHttpServer());
    for (const agent of [first, second]) {
      await agent
        .post('/api/v1/auth/login')
        .send({ email: 'admin@northstar.local', password: 'AdminPass!2026' })
        .expect(201);
    }
    await first.post('/api/v1/auth/logout').expect(204);
    await first.get('/api/v1/auth/me').expect(401);
    await second.get('/api/v1/auth/me').expect(200);
  });

  it('returns 401 and 403 without protected data', async () => {
    const anonymous = await request(accessApp.getHttpServer())
      .get('/api/v1/test-access/admin')
      .expect(401);
    expect(anonymous.body).not.toHaveProperty('internalValue');

    const employee = request.agent(accessApp.getHttpServer());
    await employee
      .post('/api/v1/auth/login')
      .send({ email: 'employee@northstar.local', password: 'EmployeePass!2026' })
      .expect(201);
    const forbidden = await employee.get('/api/v1/test-access/admin').expect(403);
    expect(forbidden.body).not.toHaveProperty('internalValue');

    const admin = request.agent(accessApp.getHttpServer());
    await admin
      .post('/api/v1/auth/login')
      .send({ email: 'admin@northstar.local', password: 'AdminPass!2026' })
      .expect(201);
    await admin
      .get('/api/v1/test-access/admin')
      .expect(200, { internalValue: 'visible-to-admin-only' });
  });
});
