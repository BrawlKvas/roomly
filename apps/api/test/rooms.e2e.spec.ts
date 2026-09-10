import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'roomly-rooms-test-'));
const databasePath = join(directory, 'roomly.sqlite');
process.env.DATABASE_PATH = databasePath;

import { createRoomlyApplication } from '../src/bootstrap';

const projectRoot = resolve(__dirname, '../../..');

function officeDate(daysFromNow: number): string {
  const date = new Date(Date.now() + 3 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function at(date: string, time: string): string {
  return new Date(`${date}T${time}:00.000+03:00`).toISOString();
}

function weekendDate(): string {
  const date = new Date(Date.now() + 3 * 60 * 60 * 1000);
  while (date.getUTCDay() !== 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function addBooking(values: { id: string; ownerId: string; date: string; start: string; end: string; cancelled?: boolean }): void {
  const database = new Database(databasePath);
  const now = new Date().toISOString();
  database.prepare(
    `insert into bookings (id, owner_id, room_id, subject, description, participants, starts_at, ends_at,
      version, created_at, updated_at, cancelled_at, cancelled_by_user_id, cancellation_type,
      cancellation_reason, cancellation_actor_name, cancellation_actor_email, cancellation_actor_role)
     values (?, ?, 'room-atlas', ?, null, 2, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    values.id, values.ownerId, `Встреча ${values.id}`, at(values.date, values.start), at(values.date, values.end), now, now,
    values.cancelled ? now : null, values.cancelled ? 'user-admin' : null, values.cancelled ? 'admin' : null,
    values.cancelled ? 'Причина отмены' : null, values.cancelled ? 'Илья Воронов' : null,
    values.cancelled ? 'admin@northstar.local' : null, values.cancelled ? 'admin' : null,
  );
  database.close();
}

describe('rooms HTTP contract', () => {
  let app: NestExpressApplication;
  const futureDate = officeDate(8);
  const pastDate = officeDate(-8);

  beforeAll(async () => {
    for (const command of ['db:migrate', 'db:seed']) {
      execFileSync('npm', ['run', command], {
        cwd: resolve(projectRoot, 'apps/api'),
        env: { ...process.env, DATABASE_PATH: databasePath },
        stdio: 'pipe',
      });
    }
    addBooking({ date: futureDate, end: '11:00', id: 'booking-own-schedule', ownerId: 'user-employee', start: '10:00' });
    addBooking({ date: futureDate, end: '13:00', id: 'booking-other-schedule', ownerId: 'user-admin', start: '12:00' });
    addBooking({ cancelled: true, date: futureDate, end: '15:00', id: 'booking-cancelled-schedule', ownerId: 'user-admin', start: '14:00' });
    addBooking({ date: pastDate, end: '11:00', id: 'booking-completed-schedule', ownerId: 'user-employee', start: '10:00' });
    const database = new Database(databasePath);
    database.prepare("update rooms set image_data = ?, image_mime_type = 'image/png' where id = 'room-atlas'").run(Buffer.from('png-test'));
    database.close();
    app = await createRoomlyApplication({ logger: false, serveStatic: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(directory, { force: true, recursive: true });
  });

  async function login(email: string, password: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/login').send({ email, password }).expect(201);
    return agent;
  }

  it('FR-ROOM-002/003 lists all rooms in normative order and handles missing room/image', async () => {
    const employee = await login('employee@northstar.local', 'EmployeePass!2026');
    const catalogue = await employee.get('/api/v1/rooms').expect(200);
    expect(catalogue.body.map((room: { id: string }) => room.id)).toEqual(['room-atlas', 'room-borey', 'room-cedar']);
    expect(catalogue.body.find((room: { id: string }) => room.id === 'room-cedar')).toMatchObject({ status: 'unavailable' });
    await employee.get('/api/v1/rooms/missing').expect(404);
    const image = await employee.get('/api/v1/rooms/room-atlas/image').expect(200);
    expect(image.headers['content-type']).toMatch(/^image\/png/);
    expect(image.body).toEqual(Buffer.from('png-test'));
    await employee.get('/api/v1/rooms/room-borey/image').expect(404);
  });

  it('FR-SEARCH-003/004 applies each filter and their combination without reserving rooms', async () => {
    const employee = await login('employee@northstar.local', 'EmployeePass!2026');
    const query = `date=${futureDate}&start=15:00&end=16:00`;
    const ids = async (suffix: string) => (await employee.get(`/api/v1/rooms/search?${query}${suffix}`).expect(200)).body.map((room: { id: string }) => room.id);
    await expect(ids('')).resolves.toEqual(['room-atlas', 'room-borey']);
    await expect(ids('&minimumCapacity=8')).resolves.toEqual(['room-atlas']);
    await expect(ids('&floor=3')).resolves.toEqual(['room-borey']);
    await expect(ids('&equipment=tv')).resolves.toEqual(['room-atlas']);
    await expect(ids('&minimumCapacity=8&floor=2&equipment=tv')).resolves.toEqual(['room-atlas']);
    await expect(ids('&equipment=projector')).resolves.toEqual(['room-borey']);
    const occupied = await employee.get(`/api/v1/rooms/search?date=${futureDate}&start=10:00&end=11:00`).expect(200);
    expect(occupied.body.map((room: { id: string }) => room.id)).toEqual(['room-borey']);
  });

  it('FR-SEARCH-002 rejects invalid time boundaries and returns successful empty results', async () => {
    const employee = await login('employee@northstar.local', 'EmployeePass!2026');
    await employee.get(`/api/v1/rooms/search?date=${futureDate}&start=10:10&end=11:00`).expect(400);
    await employee.get('/api/v1/rooms/search?date=2000-01-03&start=10:00&end=11:00').expect(400);
    await employee.get(`/api/v1/rooms/search?date=${weekendDate()}&start=10:00&end=11:00`).expect(400);
    await employee.get(`/api/v1/rooms/search?date=${futureDate}&start=08:00&end=12:15`).expect(400);
    const empty = await employee.get(`/api/v1/rooms/search?date=${futureDate}&start=15:00&end=16:00&floor=99`).expect(200);
    expect(empty.body).toEqual([]);
  });

  it('FR-SCHEDULE-002/003 returns own full entries, foreign busy intervals, no cancellations and completed history', async () => {
    const employee = await login('employee@northstar.local', 'EmployeePass!2026');
    const schedule = await employee.get(`/api/v1/rooms/room-atlas/schedule?date=${futureDate}`).expect(200);
    expect(schedule.body.entries).toHaveLength(2);
    expect(schedule.body.entries.find((entry: { id?: string }) => entry.id === 'booking-own-schedule')).toMatchObject({ subject: 'Встреча booking-own-schedule', startsAt: '10:00' });
    const foreign = schedule.body.entries.find((entry: { startsAt: string }) => entry.startsAt === '12:00');
    expect(foreign).toEqual({ endsAt: '13:00', startsAt: '12:00' });
    expect(JSON.stringify(schedule.body)).not.toContain('booking-cancelled-schedule');
    const completed = await employee.get(`/api/v1/rooms/room-atlas/schedule?date=${pastDate}`).expect(200);
    expect(completed.body.entries.find((entry: { id?: string }) => entry.id === 'booking-completed-schedule')).toMatchObject({ status: 'completed' });
    const admin = await login('admin@northstar.local', 'AdminPass!2026');
    const adminSchedule = await admin.get(`/api/v1/rooms/room-atlas/schedule?date=${futureDate}`).expect(200);
    expect(adminSchedule.body.entries.find((entry: { id?: string }) => entry.id === 'booking-own-schedule')).toMatchObject({ subject: 'Встреча booking-own-schedule' });
  });
});
