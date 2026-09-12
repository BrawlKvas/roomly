import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { HealthController } from './health/health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { RoomsModule } from './rooms/rooms.module';
import { BookingsModule } from './bookings/bookings.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RoomsModule,
    BookingsModule,
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        genReqId: (_request, response) => {
          const requestId = randomUUID();
          response.setHeader('x-request-id', requestId);
          return requestId;
        },
        level: process.env.LOG_LEVEL ?? 'info',
        redact: {
          censor: '[REDACTED]',
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.image',
            'req.body.imageData',
            'req.file.buffer',
            'req.files.*.buffer',
            'req.raw.headers.authorization',
            'req.raw.headers.cookie',
            'res.headers.set-cookie',
          ],
          remove: true,
        },
      },
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
