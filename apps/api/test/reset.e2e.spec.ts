import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRoomlyApplication } from '../src/bootstrap';

const directory = mkdtempSync(join(tmpdir(), 'roomly-reset-test-'));
const databasePath = join(directory, 'roomly.sqlite');
const projectRoot = resolve(__dirname, '../../..');
process.env.DATABASE_PATH = databasePath;

describe('test database reset', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    for (const command of ['db:migrate', 'db:seed']) {
      execFileSync('npm', ['run', command], {
        cwd: resolve(projectRoot, 'apps/api'),
        env: { ...process.env, DATABASE_PATH: databasePath },
        stdio: 'pipe',
      });
    }
    app = await createRoomlyApplication({ logger: false, serveStatic: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(directory, { force: true, recursive: true });
  });

  it('restores modified data and clears sessions without restarting the server', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/login').send({
      email: 'employee@northstar.local',
      password: 'EmployeePass!2026',
    }).expect(201);
    await agent.get('/api/v1/auth/me').expect(200);

    const database = new Database(databasePath);
    database.prepare("update rooms set name = 'Изменённая комната', name_key = 'изменённая комната', status = 'unavailable' where id = 'room-atlas'").run();
    database.prepare("delete from bookings where id = 'booking-future'").run();
    database.prepare("insert into equipment (code, name) values ('extra', 'Дополнительно')").run();
    database.close();

    await request(app.getHttpServer()).post('/api/v1/test/reset').expect(204);
    await agent.get('/api/v1/auth/me').expect(401);

    const restored = new Database(databasePath, { readonly: true });
    expect(restored.prepare("select name, status from rooms where id = 'room-atlas'").get())
      .toEqual({ name: 'Атлас', status: 'available' });
    expect(restored.prepare('select count(*) as count from bookings').get())
      .toEqual({ count: 4 });
    expect(restored.prepare('select count(*) as count from equipment').get())
      .toEqual({ count: 4 });
    expect(restored.prepare('select count(*) as count from sessions').get())
      .toEqual({ count: 0 });
    restored.close();

    await request(app.getHttpServer()).post('/api/v1/test/reset').expect(204);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({
      email: 'employee@northstar.local',
      password: 'EmployeePass!2026',
    }).expect(201);
  });

  it('keeps the previous data when reseeding fails', async () => {
    const database = new Database(databasePath);
    database.prepare("update rooms set name = 'Сохранить' where id = 'room-atlas'").run();
    database.exec(`
      create trigger reset_abort before insert on users
      when new.id = 'user-employee'
      begin select raise(abort, 'reset blocked'); end;
    `);
    database.close();

    await request(app.getHttpServer()).post('/api/v1/test/reset').expect(500);

    const retained = new Database(databasePath);
    expect(retained.prepare("select name from rooms where id = 'room-atlas'").get())
      .toEqual({ name: 'Сохранить' });
    retained.exec('drop trigger reset_abort');
    retained.close();

    await request(app.getHttpServer()).post('/api/v1/test/reset').expect(204);
  });
});
