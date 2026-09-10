import 'reflect-metadata';

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createOpenApiDocument,
  createRoomlyApplication,
} from '../bootstrap';

async function generateOpenApi(): Promise<void> {
  const app = await createRoomlyApplication({
    logger: false,
    serveStatic: false,
  });

  try {
    await app.init();
    const document = createOpenApiDocument(app);
    const outputPath = resolve(
      process.cwd(),
      '../../packages/api-client/openapi.json',
    );

    await mkdir(resolve(outputPath, '..'), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.info(`OpenAPI document written to ${outputPath}`);
  } finally {
    await app.close();
  }
}

void generateOpenApi();
