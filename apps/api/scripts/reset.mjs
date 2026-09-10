import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { projectRoot, resolveDatabasePath } from './database.mjs';

const dataDirectory = resolve(projectRoot, 'data');
const databasePath = resolveDatabasePath();
const permittedPath = resolve(dataDirectory, 'roomly.sqlite');

if (process.env.NODE_ENV === 'production' || databasePath !== permittedPath) {
  throw new Error(
    'db:reset may only remove the local data/roomly.sqlite development database.',
  );
}

for (const suffix of ['', '-wal', '-shm']) {
  const path = `${databasePath}${suffix}`;
  if (existsSync(path)) {
    rmSync(path);
  }
}

for (const command of ['db:migrate', 'db:seed']) {
  const result = spawnSync('npm', ['run', command], {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_PATH: databasePath },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
