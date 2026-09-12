import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

export type DatabaseEnvironment = 'development' | 'test' | 'production';

export interface DatabaseConfig {
  environment: DatabaseEnvironment;
  path: string;
  busyTimeoutMs: number;
}

function findProjectRoot(start: string): string {
  let directory = start;
  while (!existsSync(resolve(directory, 'package-lock.json'))) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error('Could not locate the Roomly project root.');
    }
    directory = parent;
  }
  return directory;
}

const projectRoot = findProjectRoot(__dirname);

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
      : resolve(projectRoot, 'data/roomly.sqlite');
  const path = configuredPath === undefined
    ? defaultPath
    : resolve(projectRoot, configuredPath);

  return {
    environment,
    path,
    busyTimeoutMs: 5_000,
  };
}

export function ensureDatabaseDirectory(config: DatabaseConfig): void {
  mkdirSync(resolve(config.path, '..'), { recursive: true });
}
