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
  error?: string;
  message?: string | string[];
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
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
      code: this.getCode(status),
      message:
        status >= 500
          ? 'Внутренняя ошибка сервера'
          : (messages[0] ?? body.error ?? 'Запрос не выполнен'),
      fieldErrors: messages,
      requestId,
    });
  }

  private getExceptionBody(exception: unknown): NestErrorBody {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const response = exception.getResponse();
    return typeof response === 'string' ? { message: response } : response;
  }

  private getCode(status: number): string {
    return `HTTP_${status}`;
  }

  private readRequestId(response: Response): string {
    const header = response.getHeader('x-request-id');
    return typeof header === 'string' ? header : 'unavailable';
  }
}
