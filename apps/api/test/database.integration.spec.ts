import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabaseConfig } from '../src/database/database.config';

const projectRoot = resolve(__dirname, '../../..');
const temporaryDirectories: string[] = [];

function createMigratedDatabase(): { database: Database.Database; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'roomly-schema-test-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'roomly.sqlite');

  execFileSync('node', ['scripts/migrate.mjs'], {
    cwd: resolve(projectRoot, 'apps/api'),
    env: { ...process.env, DATABASE_PATH: path },
    stdio: 'pipe',
  });

  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  return { database, path };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('database schema', () => {
  it('resolves configured relative paths from the repository root', () => {
    expect(getDatabaseConfig('data/roomly.sqlite').path).toBe(join(projectRoot, 'data', 'roomly.sqlite'));
  });

  it('creates the complete initial schema and applies its migration only once', () => {
    const { database, path } = createMigratedDatabase();
    database.close();

    execFileSync('node', ['scripts/migrate.mjs'], {
      cwd: resolve(projectRoot, 'apps/api'),
      env: { ...process.env, DATABASE_PATH: path },
      stdio: 'pipe',
    });

    const migrated = new Database(path, { readonly: true });
    const tables = migrated
      .prepare("select name from sqlite_master where type = 'table' order by name")
      .all()
      .map((row) => (row as { name: string }).name);
    const migrationCount = migrated
      .prepare('select count(*) as count from __drizzle_migrations')
      .get() as { count: number };
    migrated.close();

    expect(tables).toEqual(
      expect.arrayContaining([
        '__drizzle_migrations',
        'bookings',
        'equipment',
        'room_equipment',
        'rooms',
        'sessions',
        'users',
      ]),
    );
    expect(migrationCount.count).toBe(1);
  });

  it('enforces role, uniqueness and foreign-key constraints and exposes required indexes', () => {
    const { database } = createMigratedDatabase();
    database
      .prepare(
        'insert into users (id, name, email, email_key, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?, ?)',
      )
      .run('user-1', 'User One', 'one@example.test', 'one@example.test', 'hash', 'employee', 'now');

    expect(() =>
      database
        .prepare(
          'insert into users (id, name, email, email_key, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?, ?)',
        )
        .run('user-2', 'User Two', 'two@example.test', 'one@example.test', 'hash', 'employee', 'now'),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          'insert into users (id, name, email, email_key, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?, ?)',
        )
        .run('user-3', 'User Three', 'three@example.test', 'three@example.test', 'hash', 'manager', 'now'),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          'insert into sessions (id, token_hash, user_id, created_at, expires_at) values (?, ?, ?, ?, ?)',
        )
        .run('session-1', 'token-hash', 'missing-user', 'now', 'later'),
    ).toThrow();

    const sessionIndexes = database
      .prepare("pragma index_list('sessions')")
      .all()
      .map((row) => (row as { name: string }).name);
    const bookingIndexes = database
      .prepare("pragma index_list('bookings')")
      .all()
      .map((row) => (row as { name: string }).name);
    database.close();

    expect(sessionIndexes).toEqual(
      expect.arrayContaining(['sessions_expires_at_idx', 'sessions_user_expires_idx']),
    );
    expect(bookingIndexes).toEqual(
      expect.arrayContaining([
        'bookings_room_interval_idx',
        'bookings_owner_start_idx',
        'bookings_admin_room_start_idx',
      ]),
    );
  });
});
