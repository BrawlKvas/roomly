import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const directory = mkdtempSync(join(tmpdir(), 'roomly-admin-test-'));
const databasePath = join(directory, 'roomly.sqlite');
process.env.DATABASE_PATH = databasePath;
import { createRoomlyApplication } from '../src/bootstrap';

const projectRoot = resolve(__dirname, '../../..');
function crc32(data: Buffer): number { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, value: Buffer): Buffer { const size = Buffer.alloc(4); size.writeUInt32BE(value.length); const name = Buffer.from(type); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, value]))); return Buffer.concat([size, name, value, crc]); }
const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
function officeDate(days = 8): string { const date = new Date(Date.now() + 3 * 60 * 60 * 1000); date.setUTCDate(date.getUTCDate() + days); while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }
function room(name: string, changes: Record<string, unknown> = {}) { return { name, floor: 7, location: 'Крыло A', capacity: 8, description: '  Описание  ', equipment: ['tv'], status: 'available', ...changes }; }

describe('FR-ADMIN room and booking HTTP contract', () => {
  let app: NestExpressApplication;
  beforeAll(async () => { for (const command of ['db:migrate', 'db:seed']) execFileSync('npm', ['run', command], { cwd: resolve(projectRoot, 'apps/api'), env: { ...process.env, DATABASE_PATH: databasePath }, stdio: 'pipe' }); app = await createRoomlyApplication({ logger: false, serveStatic: false }); await app.init(); });
  afterAll(async () => { await app.close(); rmSync(directory, { force: true, recursive: true }); });
  async function login(email: string, password: string) { const agent = request.agent(app.getHttpServer()); await agent.post('/api/v1/auth/login').send({ email, password }).expect(201); return agent; }

  it('FR-ADMIN-ROOM-001–004 restricts creation, normalizes names and applies room updates atomically', async () => {
    const employee = await login('employee@northstar.local', 'EmployeePass!2026'); const admin = await login('admin@northstar.local', 'AdminPass!2026');
    await employee.post('/api/v1/rooms').send(room('Нельзя')).expect(403);
    const created = await admin.post('/api/v1/rooms').send(room('  Новая\u00a0\u00a0комната ')).expect(201);
    expect(created.body).toMatchObject({ name: 'Новая комната', description: 'Описание', version: 1 });
    await admin.post('/api/v1/rooms').send(room('новая комната')).expect(409);
    const [first, second] = await Promise.all([admin.post('/api/v1/rooms').send(room('Конкурентное имя')), admin.post('/api/v1/rooms').send(room('конкурентное имя'))]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
    await admin.patch(`/api/v1/rooms/${created.body.id}`).send({ ...room('Переименована', { capacity: 2 }), version: created.body.version }).expect(200);
    const stale = await admin.patch(`/api/v1/rooms/${created.body.id}`).send({ ...room('Не сохранится'), version: created.body.version }).expect(409);
    expect(stale.body.message).toContain('изменилась');
    expect((await admin.get(`/api/v1/rooms/${created.body.id}`).expect(200)).body.name).toBe('Переименована');
  });

  it('BR-ROOM-009 accepts complete PNG only and leaves the former image untouched on failure', async () => {
    const admin = await login('admin@northstar.local', 'AdminPass!2026'); const current = await admin.get('/api/v1/rooms/room-borey').expect(200);
    const uploaded = await admin.post('/api/v1/rooms/room-borey/image').field('version', String(current.body.version)).attach('image', png, 'room.png').expect(201);
    await admin.get('/api/v1/rooms/room-borey/image').expect('content-type', /image\/png/).expect(200);
    await admin.post('/api/v1/rooms/room-borey/image').field('version', String(uploaded.body.version)).attach('image', Buffer.concat([png, Buffer.from([1])]), 'room.png').expect(400);
    await admin.get('/api/v1/rooms/room-borey/image').expect(200);
    const tooLarge = await admin.post('/api/v1/rooms/room-borey/image').field('version', String(uploaded.body.version)).attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png').expect(413);
    expect(tooLarge.body.code).toBe('REQUEST_TOO_LARGE');
  });

  it('FR-ADMIN-BOOKING and FR-CANCEL-002 list, cancel with a reason and preserve its actor', async () => {
    const employee = await login('employee@northstar.local', 'EmployeePass!2026'); const admin = await login('admin@northstar.local', 'AdminPass!2026'); const date = officeDate(12);
    const booking = await employee.post('/api/v1/bookings').send({ roomId: 'room-atlas', subject: 'Чужая встреча', participants: 2, date, start: '14:00', end: '15:00' }).expect(201);
    await employee.get('/api/v1/bookings/admin/all').expect(403);
    const all = await admin.get('/api/v1/bookings/admin/all?status=scheduled').expect(200); expect(all.body.some((item: { id: string }) => item.id === booking.body.id)).toBe(true);
    await admin.delete(`/api/v1/bookings/${booking.body.id}`).send({ version: booking.body.version }).expect(400);
    const cancelled = await admin.delete(`/api/v1/bookings/${booking.body.id}`).send({ version: booking.body.version, reason: '  Ремонт  ' }).expect(200);
    expect(cancelled.body.cancellation).toMatchObject({ type: 'admin', reason: 'Ремонт', actor: { email: 'admin@northstar.local', role: 'admin' } });
    await admin.patch(`/api/v1/bookings/${booking.body.id}`).send({ version: cancelled.body.version }).expect(403);
  });

  it('BR-ROOM-011/014 preserves active bookings while rejecting unsafe capacity reductions', async () => {
    const employee = await login('employee@northstar.local', 'EmployeePass!2026'); const admin = await login('admin@northstar.local', 'AdminPass!2026'); const date = officeDate(15);
    const booking = await employee.post('/api/v1/bookings').send({ roomId: 'room-borey', subject: 'Вместимость', participants: 4, date, start: '10:00', end: '11:00' }).expect(201);
    const roomBefore = await admin.get('/api/v1/rooms/room-borey').expect(200);
    await admin.patch('/api/v1/rooms/room-borey').send({ name: roomBefore.body.name, floor: roomBefore.body.floor, location: roomBefore.body.location, capacity: 3, description: roomBefore.body.description, equipment: roomBefore.body.equipment, status: roomBefore.body.status, version: roomBefore.body.version }).expect(409);
    const unavailable = await admin.patch('/api/v1/rooms/room-borey').send({ name: roomBefore.body.name, floor: roomBefore.body.floor, location: roomBefore.body.location, capacity: roomBefore.body.capacity, description: roomBefore.body.description, equipment: roomBefore.body.equipment, status: 'unavailable', version: roomBefore.body.version }).expect(200);
    expect((await admin.get(`/api/v1/bookings/${booking.body.id}`).expect(200)).body.status).toBe('scheduled');
    await employee.post('/api/v1/bookings').send({ roomId: 'room-borey', subject: 'Новая', participants: 1, date, start: '12:00', end: '13:00' }).expect(409);
    expect(unavailable.body.status).toBe('unavailable');
  });

  it('BR-CONCURRENT-005 serializes a room status change and a booking operation', async () => {
    const employee = await login('employee@northstar.local', 'EmployeePass!2026'); const admin = await login('admin@northstar.local', 'AdminPass!2026'); const date = officeDate(18);
    const current = await admin.get('/api/v1/rooms/room-atlas').expect(200);
    const statusChange = admin.patch('/api/v1/rooms/room-atlas').send({ name: current.body.name, floor: current.body.floor, location: current.body.location, capacity: current.body.capacity, description: current.body.description, equipment: current.body.equipment, status: 'unavailable', version: current.body.version });
    const creation = employee.post('/api/v1/bookings').send({ roomId: 'room-atlas', subject: 'Одновременно', participants: 1, date, start: '16:00', end: '17:00' });
    const [roomResult, bookingResult] = await Promise.all([statusChange, creation]);
    expect(roomResult.status).toBe(200); expect([201, 409]).toContain(bookingResult.status);
    const finalRoom = await admin.get('/api/v1/rooms/room-atlas').expect(200); expect(finalRoom.body.status).toBe('unavailable');
    if (bookingResult.status === 201) expect((await admin.get(`/api/v1/bookings/${bookingResult.body.id}`).expect(200)).body.status).toBe('scheduled');
  });
});
