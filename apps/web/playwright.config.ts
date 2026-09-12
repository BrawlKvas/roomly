import { defineConfig } from '@playwright/test';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
      : {}),
  },
  webServer: [
    {
      command: 'npm run dev --workspace @roomly/api',
      cwd: `${configDirectory}/../api`,
      reuseExistingServer: false,
      url: 'http://127.0.0.1:3000/api/v1/health',
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      cwd: configDirectory,
      reuseExistingServer: false,
      url: 'http://127.0.0.1:4173',
    },
  ],
});
