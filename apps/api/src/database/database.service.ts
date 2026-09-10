import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import { ensureDatabaseDirectory, getDatabaseConfig } from './database.config';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly sqlite: Database.Database;
  readonly db: BetterSQLite3Database<typeof schema>;

  constructor() {
    const config = getDatabaseConfig();
    ensureDatabaseDirectory(config);

    this.sqlite = new Database(config.path);
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma(`busy_timeout = ${config.busyTimeoutMs}`);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('synchronous = NORMAL');
    this.db = drizzle(this.sqlite, { schema });
  }

  onModuleDestroy(): void {
    this.sqlite.close();
  }
}
