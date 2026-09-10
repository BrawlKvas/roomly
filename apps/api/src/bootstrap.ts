import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
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
