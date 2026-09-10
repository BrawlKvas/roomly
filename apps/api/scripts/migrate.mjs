import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { resolve } from 'node:path';

import { openDatabase } from './database.mjs';

const sqlite = openDatabase();

try {
  migrate(drizzle(sqlite), {
    migrationsFolder: resolve(import.meta.dirname, '../drizzle'),
  });
  console.info('Database migrations are up to date.');
} finally {
  sqlite.close();
}
