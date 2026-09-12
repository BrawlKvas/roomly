import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRoomlyApplication } from '../src/bootstrap';

describe('application HTTP contract', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createRoomlyApplication({
      logger: false,
      serveStatic: false,
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes the public health endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers).toMatchObject({
      'content-security-policy': expect.stringContaining("default-src 'self'"),
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    });
  });

  it('returns the shared error envelope with a request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/missing')
      .expect(404);

    expect(response.body).toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
      fieldErrors: ['Cannot GET /api/v1/missing'],
      requestId: expect.any(String),
      status: 404,
    });
  });

  it('publishes health in the OpenAPI document', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/openapi.json')
      .expect(200);

    expect(response.body.paths).toHaveProperty('/api/v1/health');
    expect(response.body.paths['/api/v1/bookings'].post.requestBody).toBeDefined();
    expect(response.body.paths['/api/v1/rooms/{id}/image'].post.requestBody).toBeDefined();
    expect(response.body.components.schemas.ErrorResponseDto.required).toEqual(
      expect.arrayContaining(['status', 'code', 'message', 'fieldErrors', 'requestId']),
    );
  });

  it('rejects a cross-origin cookie-authenticated mutation with a stable code', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('origin', 'https://untrusted.example')
      .expect(403);

    expect(response.body).toMatchObject({
      code: 'ORIGIN_MISMATCH',
      fieldErrors: ['Origin does not match this Roomly application.'],
      requestId: expect.any(String),
      status: 403,
    });
  });
});
