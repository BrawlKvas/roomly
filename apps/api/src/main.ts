import 'reflect-metadata';

import { createRoomlyApplication } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await createRoomlyApplication();
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
