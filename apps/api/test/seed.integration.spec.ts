import argon2 from 'argon2';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = resolve(__dirname, '../../..');
const temporaryDirectories: string[] = [];

function runDatabaseCommand(command: 'db:migrate' | 'db:seed', path: string): void {
  execFileSync('npm', ['run', command], {
    cwd: resolve(projectRoot, 'apps/api'),
    env: { ...process.env, DATABASE_PATH: path },
    stdio: 'pipe',
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('reference data seed', () => {
  it('is idempotent and supplies both roles, varied rooms and booking states', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'roomly-seed-test-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'roomly.sqlite');

    runDatabaseCommand('db:migrate', path);
    runDatabaseCommand('db:seed', path);
    runDatabaseCommand('db:seed', path);

    const database = new Database(path, { readonly: true });
    const users = database
      .prepare('select id, password_hash, role from users order by id')
      .all() as Array<{ id: string; password_hash: string; role: string }>;
    const rooms = database
      .prepare('select floor, capacity, status, image_data, image_mime_type from rooms order by id')
      .all() as Array<{ floor: number; capacity: number; status: string; image_data: Buffer | null; image_mime_type: string | null }>;
    const equipmentCount = database
      .prepare('select count(*) as count from equipment')
      .get() as { count: number };
    const bookings = database
      .prepare(
        'select id, starts_at, ends_at, cancelled_at from bookings order by id',
      )
      .all() as Array<{
      id: string;
      starts_at: string;
      ends_at: string;
      cancelled_at: string | null;
    }>;
    database.close();

    expect(users.map((user) => user.role)).toEqual(['admin', 'employee', 'employee']);
    await expect(argon2.verify(users[0]!.password_hash, 'AdminPass!2026')).resolves.toBe(true);
    await expect(argon2.verify(users[1]!.password_hash, 'EmployeePass!2026')).resolves.toBe(true);
    await expect(argon2.verify(users[2]!.password_hash, 'EmployeePass!2026')).resolves.toBe(true);
    expect(rooms.map((room) => room.floor)).toEqual([2, 3, 5]);
    expect(rooms.map((room) => room.capacity)).toEqual([10, 4, 16]);
    expect(rooms.map((room) => room.status)).toEqual(['available', 'available', 'unavailable']);
    expect(rooms.every((room) => room.image_data && room.image_mime_type === 'image/png')).toBe(true);
    expect(equipmentCount.count).toBe(4);
    expect(bookings).toHaveLength(4);
    expect(
      Date.parse(bookings.find((booking) => booking.id === 'booking-ongoing')!.starts_at),
    ).toBeLessThan(Date.now());
    expect(
      Date.parse(bookings.find((booking) => booking.id === 'booking-ongoing')!.ends_at),
    ).toBeGreaterThan(Date.now());
    expect(
      Date.parse(bookings.find((booking) => booking.id === 'booking-completed')!.ends_at),
    ).toBeLessThan(Date.now());
    expect(bookings.find((booking) => booking.id === 'booking-cancelled')!.cancelled_at).not.toBeNull();
  });
});
