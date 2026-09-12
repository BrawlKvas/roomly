import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { HttpErrorFilter } from './common/http-error.filter';

export interface CreateApplicationOptions {
  logger?: boolean;
  serveStatic?: boolean;
}

export async function createRoomlyApplication(
  options: CreateApplicationOptions = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: options.logger !== false,
    ...(options.logger === false ? { logger: false } : {}),
  });

  if (options.logger !== false) {
    app.useLogger(app.get(Logger));
  }

  app.setGlobalPrefix('api/v1');
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: false, limit: '1mb' });
  configureHttpSecurity(app);
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());

  const openApiDocument = createOpenApiDocument(app);

  SwaggerModule.setup('api/docs', app, openApiDocument, {
    jsonDocumentUrl: 'api/openapi.json',
    useGlobalPrefix: false,
  });

  if (options.serveStatic !== false) {
    configureStaticFrontend(app);
  }

  app.enableShutdownHooks();
  return app;
}

function configureHttpSecurity(app: NestExpressApplication): void {
  const server = app.getHttpAdapter().getInstance();
  server.disable('x-powered-by');
  server.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('content-security-policy', "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'");
    response.setHeader('permissions-policy', 'camera=(), geolocation=(), microphone=()');
    response.setHeader('referrer-policy', 'same-origin');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('x-frame-options', 'DENY');
    if (process.env.NODE_ENV === 'production') {
      response.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  server.use((request: Request, _response: Response, next: NextFunction) => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return next();
    const origin = request.headers.origin;
    if (!origin) return next();
    const expectedOrigin = process.env.APP_ORIGIN ?? `${request.protocol}://${request.get('host')}`;
    if (origin === expectedOrigin || isTrustedDevelopmentOrigin(origin, request)) return next();
    const error = new Error('Origin does not match this Roomly application.') as Error & { code: string; status: number };
    error.code = 'ORIGIN_MISMATCH';
    error.status = 403;
    next(error);
  });
}

function isTrustedDevelopmentOrigin(origin: string, request: Request): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    const requestHost = request.get('host')?.replace(/^\[|\]$/g, '').split(':')[0];
    return url.protocol === 'http:' && url.hostname === requestHost &&
      (url.port === '5173' || url.port === '4173');
  } catch {
    return false;
  }
}

function configureStaticFrontend(app: NestExpressApplication): void {
  const webDistPath = resolve(__dirname, '../../web/dist');
  const indexPath = resolve(webDistPath, 'index.html');

  if (!existsSync(indexPath)) {
    return;
  }

  const server = app.getHttpAdapter().getInstance();
  server.use(express.static(webDistPath));
  server.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
    response.sendFile(indexPath);
  });
}

export function createOpenApiDocument(app: NestExpressApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Roomly API')
    .setDescription('HTTP API for the Roomly meeting room booking service')
    .setVersion('1.0')
    .build();

  return SwaggerModule.createDocument(app, swaggerConfig);
}
