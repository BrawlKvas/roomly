import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface NestErrorBody {
  code?: string;
  error?: string;
  fieldErrors?: string[];
  message?: string | string[];
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status = this.getStatus(exception);
    const body = this.getExceptionBody(exception);
    const messages = Array.isArray(body.message)
      ? body.message
      : body.message
        ? [body.message]
        : [];
    const requestId = request.id ?? this.readRequestId(response);

    if (!(exception instanceof HttpException) || status >= 500) {
      this.logger.error(
        {
          method: request.method,
          path: request.originalUrl,
          requestId,
          status,
        },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      status,
      code: body.code ?? this.getCode(status, messages),
      message:
        status >= 500
          ? 'Внутренняя ошибка сервера'
          : (messages[0] ?? body.error ?? 'Запрос не выполнен'),
      fieldErrors: body.fieldErrors ?? messages,
      requestId,
    });
  }

  private getExceptionBody(exception: unknown): NestErrorBody {
    if (!(exception instanceof HttpException)) {
      if (this.isOriginError(exception)) {
        return { code: 'ORIGIN_MISMATCH', message: 'Origin does not match this Roomly application.' };
      }
      if (this.isPayloadTooLarge(exception)) {
        return { code: 'REQUEST_TOO_LARGE', message: 'Размер загружаемого файла превышает допустимый предел.' };
      }
      return {};
    }

    const response = exception.getResponse();
    return typeof response === 'string' ? { message: response } : response;
  }

  private getStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    if (this.isPayloadTooLarge(exception)) return HttpStatus.PAYLOAD_TOO_LARGE;
    if (this.isOriginError(exception)) return HttpStatus.FORBIDDEN;
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getCode(status: number, messages: string[]): string {
    const message = messages[0] ?? '';
    if (status === HttpStatus.BAD_REQUEST) return 'VALIDATION_ERROR';
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) return 'REQUEST_TOO_LARGE';
    if (status === HttpStatus.UNAUTHORIZED) return message === 'Требуется вход в систему' ? 'AUTHENTICATION_REQUIRED' : 'INVALID_CREDENTIALS';
    if (status === HttpStatus.FORBIDDEN) return this.isOriginMessage(message) ? 'ORIGIN_MISMATCH' : 'ACCESS_DENIED';
    if (status === HttpStatus.NOT_FOUND) {
      if (message.startsWith('Комната')) return 'ROOM_NOT_FOUND';
      if (message.startsWith('Изображение')) return 'ROOM_IMAGE_NOT_FOUND';
      if (message.startsWith('Бронирование')) return 'BOOKING_NOT_FOUND_OR_UNAVAILABLE';
      return 'RESOURCE_NOT_FOUND';
    }
    if (status === HttpStatus.CONFLICT) {
      if (message.includes('таким названием')) return 'ROOM_NAME_TAKEN';
      if (message.startsWith('Комната изменилась')) return 'ROOM_VERSION_CONFLICT';
      if (message.startsWith('Вместимость')) return 'ROOM_CAPACITY_CONFLICT';
      if (message.startsWith('Комната недоступна')) return 'ROOM_UNAVAILABLE';
      if (message.startsWith('Выбранный интервал')) return 'BOOKING_INTERVAL_CONFLICT';
      if (message.startsWith('Бронирование уже отменено')) return 'BOOKING_ALREADY_CANCELLED';
      if (message.startsWith('Бронирование изменилось')) return 'BOOKING_VERSION_CONFLICT';
      if (message.startsWith('Можно изменить')) return 'BOOKING_NOT_EDITABLE';
      if (message.startsWith('Можно отменить')) return 'BOOKING_NOT_CANCELLABLE';
      return 'STATE_CONFLICT';
    }
    return 'INTERNAL_ERROR';
  }

  private isPayloadTooLarge(exception: unknown): boolean {
    return typeof exception === 'object' && exception !== null && 'code' in exception &&
      (exception as { code?: unknown }).code === 'LIMIT_FILE_SIZE';
  }

  private isOriginError(exception: unknown): boolean {
    return typeof exception === 'object' && exception !== null && 'code' in exception &&
      (exception as { code?: unknown }).code === 'ORIGIN_MISMATCH';
  }

  private isOriginMessage(message: string): boolean {
    return message === 'Origin does not match this Roomly application.';
  }

  private readRequestId(response: Response): string {
    const header = response.getHeader('x-request-id');
    return typeof header === 'string' ? header : 'unavailable';
  }
}
