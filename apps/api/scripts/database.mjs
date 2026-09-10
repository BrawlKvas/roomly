import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const projectRoot = resolve(import.meta.dirname, '../../..');

export function resolveDatabasePath() {
  return resolve(projectRoot, process.env.DATABASE_PATH ?? 'data/roomly.sqlite');
}

export function openDatabase(databasePath = resolveDatabasePath()) {
  mkdirSync(dirname(databasePath), { recursive: true });

  const sqlite = new Database(databasePath);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  return sqlite;
}
