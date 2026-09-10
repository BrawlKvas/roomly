import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'roomly-bookings-test-'));
const databasePath = join(directory, 'roomly.sqlite');
process.env.DATABASE_PATH = databasePath;

import { createRoomlyApplication } from '../src/bootstrap';
import { intervalsOverlap, normalizeText, validateBookingInterval } from '../src/bookings/booking-domain';

const projectRoot = resolve(__dirname, '../../..');

function officeDate(days = 8): string {
  const date = new Date(Date.now() + 3 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() + days);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function body(date = officeDate(), overrides: Record<string, unknown> = {}) {
  return { roomId: 'room-atlas', subject: 'Планирование', description: '  Обсудить план  ', participants: 2, date, start: '10:00', end: '11:00', ...overrides };
}

describe('booking HTTP contract', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    for (const command of ['db:migrate', 'db:seed']) execFileSync('npm', ['run', command], { cwd: resolve(projectRoot, 'apps/api'), env: { ...process.env, DATABASE_PATH: databasePath }, stdio: 'pipe' });
    app = await createRoomlyApplication({ logger: false, serveStatic: false });
    await app.init();
  });
  afterAll(async () => { await app.close(); rmSync(directory, { force: true, recursive: true }); });
  async function employee() { const agent = request.agent(app.getHttpServer()); await agent.post('/api/v1/auth/login').send({ email: 'employee@northstar.local', password: 'EmployeePass!2026' }).expect(201); return agent; }
  async function admin() { const agent = request.agent(app.getHttpServer()); await agent.post('/api/v1/auth/login').send({ email: 'admin@northstar.local', password: 'AdminPass!2026' }).expect(201); return agent; }

  it('FR-BOOKING-003/005 creates one normalized booking and preserves form-level validation failures', async () => {
    const agent = await employee();
    const created = await agent.post('/api/v1/bookings').send(body()).expect(201);
    expect(created.body).toMatchObject({ subject: 'Планирование', description: 'Обсудить план', date: officeDate(), start: '10:00', end: '11:00', status: 'scheduled', owner: { email: 'employee@northstar.local' }, version: 1 });
    await agent.post('/api/v1/bookings').send(body(officeDate(), { participants: 99, start: '11:00', end: '12:00' })).expect(400);
    await agent.post('/api/v1/bookings').send(body(officeDate(), { roomId: 'room-cedar', start: '11:00', end: '12:00' })).expect(409);
  });

  it('FR-MY-001/006 lists only owner records and keeps foreign records neutral for an employee', async () => {
    const owner = await employee(); const other = await admin();
    const own = await owner.post('/api/v1/bookings').send(body(officeDate(9), { start: '12:00', end: '13:00' })).expect(201);
    const foreign = await other.post('/api/v1/bookings').send(body(officeDate(10), { roomId: 'room-borey', start: '12:00', end: '13:00' })).expect(201);
    const listed = await owner.get('/api/v1/bookings/my?view=all&status=all').expect(200);
    expect(listed.body.some((item: { id: string }) => item.id === own.body.id)).toBe(true);
    await owner.get(`/api/v1/bookings/${foreign.body.id}`).expect(404);
    await owner.get('/api/v1/bookings/not-real').expect(404);
  });

  it('FR-EDIT-004/005 changes atomically and rejects stale versions without freeing the old interval', async () => {
    const agent = await employee(); const date = officeDate(11);
    const created = await agent.post('/api/v1/bookings').send(body(date, { start: '14:00', end: '15:00' })).expect(201);
    await agent.post('/api/v1/bookings').send(body(date, { start: '15:00', end: '16:00' })).expect(201);
    const stale = await agent.patch(`/api/v1/bookings/${created.body.id}`).send({ ...body(date, { start: '15:00', end: '16:00' }), version: created.body.version }).expect(409);
    const oldInterval = await agent.post('/api/v1/bookings').send(body(date, { start: '14:00', end: '15:00' })).expect(409);
    expect(stale.body.message).toContain('занят'); expect(oldInterval.body.message).toContain('занят');
  });

  it('FR-CANCEL-005/007 retains cancellation history, releases time and prioritizes repeated cancellation', async () => {
    const agent = await employee(); const date = officeDate(12);
    const created = await agent.post('/api/v1/bookings').send(body(date, { start: '16:00', end: '17:00' })).expect(201);
    const cancelled = await agent.delete(`/api/v1/bookings/${created.body.id}`).send({ version: created.body.version }).expect(200);
    expect(cancelled.body).toMatchObject({ status: 'cancelled', cancellation: { type: 'owner', reason: null, actor: { email: 'employee@northstar.local' } } });
    await agent.delete(`/api/v1/bookings/${created.body.id}`).send({ version: 1, reason: 123 }).expect(409);
    await agent.post('/api/v1/bookings').send(body(date, { start: '16:00', end: '17:00' })).expect(201);
  });

  it('BR-CONCURRENT-001/002/004 accepts only one conflicting create, transfer or cancellation outcome', async () => {
    const first = await employee(); const second = await admin(); const date = officeDate(13);
    const [one, two] = await Promise.all([first.post('/api/v1/bookings').send(body(date, { start: '08:00', end: '09:00' })), second.post('/api/v1/bookings').send(body(date, { start: '08:00', end: '09:00' }))]);
    expect([one.status, two.status].sort()).toEqual([201, 409]);
    const schedule = await second.get(`/api/v1/rooms/room-atlas/schedule?date=${date}`).expect(200);
    expect(schedule.body.entries.filter((entry: { startsAt: string; endsAt: string }) => entry.startsAt === '08:00' && entry.endsAt === '09:00')).toHaveLength(1);
    const movable = await first.post('/api/v1/bookings').send(body(date, { roomId: 'room-borey', start: '10:00', end: '11:00' })).expect(201);
    const [competingCreation, transferred] = await Promise.all([
      second.post('/api/v1/bookings').send(body(date, { roomId: 'room-borey', start: '12:00', end: '13:00' })),
      first.patch(`/api/v1/bookings/${movable.body.id}`).send({ ...body(date, { roomId: 'room-borey', start: '12:00', end: '13:00' }), version: movable.body.version }),
    ]);
    expect([competingCreation.status, transferred.status].sort()).toEqual([201, 409]);
    const created = await first.post('/api/v1/bookings').send(body(date, { start: '10:00', end: '11:00' })).expect(201);
    const update = first.patch(`/api/v1/bookings/${created.body.id}`).send({ ...body(date, { start: '11:00', end: '12:00' }), version: created.body.version });
    const cancel = first.delete(`/api/v1/bookings/${created.body.id}`).send({ version: created.body.version });
    const outcomes = await Promise.all([update, cancel]);
    expect(outcomes.map((result) => result.status).sort()).toEqual([200, 409]);
    const repeated = await first.post('/api/v1/bookings').send(body(date, { roomId: 'room-borey', start: '13:00', end: '14:00' })).expect(201);
    const cancellations = await Promise.all([
      first.delete(`/api/v1/bookings/${repeated.body.id}`).send({ version: repeated.body.version }),
      first.delete(`/api/v1/bookings/${repeated.body.id}`).send({ version: repeated.body.version }),
    ]);
    expect(cancellations.map((result) => result.status).sort()).toEqual([200, 409]);
  });
});

describe('booking domain rules', () => {
  it('normalizes text and uses exact half-open interval overlap', () => {
    expect(normalizeText('\u00a0  Тема  \u00a0', { singleLine: true })).toBe('Тема');
    expect(normalizeText('Тема\nещё', { singleLine: true })).toBeUndefined();
    expect(intervalsOverlap({ startsAt: '2026-01-01T07:00:00.000Z', endsAt: '2026-01-01T08:00:00.000Z' }, { startsAt: '2026-01-01T08:00:00.000Z', endsAt: '2026-01-01T09:00:00.000Z' })).toBe(false);
  });
  it('validates exact working-time boundaries', () => {
    const date = officeDate(20);
    expect(validateBookingInterval({ date, start: '08:00', end: '12:00' }).errors).toEqual([]);
    expect(validateBookingInterval({ date, start: '19:45', end: '20:00' }).errors).toEqual([]);
    expect(validateBookingInterval({ date, start: '08:00', end: '12:15' }).errors).not.toEqual([]);
  });
});
