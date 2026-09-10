import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

export type DatabaseEnvironment = 'development' | 'test' | 'production';

export interface DatabaseConfig {
  environment: DatabaseEnvironment;
  path: string;
  busyTimeoutMs: number;
}

function databaseEnvironment(value = process.env.NODE_ENV): DatabaseEnvironment {
  if (value === 'production' || value === 'test') {
    return value;
  }

  return 'development';
}

export function getDatabaseConfig(databasePath?: string): DatabaseConfig {
  const environment = databaseEnvironment();
  const configuredPath = databasePath ?? process.env.DATABASE_PATH;
  if (environment === 'production' && configuredPath === undefined) {
    throw new Error('DATABASE_PATH must be set in production.');
  }
  const defaultPath =
    environment === 'test'
      ? resolve(
          tmpdir(),
          `roomly-test-${process.pid}-${process.env.VITEST_POOL_ID ?? 'main'}.sqlite`,
        )
      : resolve(process.cwd(), 'data/roomly.sqlite');
  const path = resolve(process.cwd(), configuredPath ?? defaultPath);

  return {
    environment,
    path,
    busyTimeoutMs: 5_000,
  };
}

export function ensureDatabaseDirectory(config: DatabaseConfig): void {
  mkdirSync(resolve(config.path, '..'), { recursive: true });
}
