import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME, type AuthenticatedSession } from './auth.types';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthenticatedSession;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const session = this.auth.findSession(readCookie(request, SESSION_COOKIE_NAME));
    if (!session) throw new UnauthorizedException('Требуется вход в систему');
    request.auth = session;
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.auth?.user.role !== 'admin') {
      throw new ForbiddenException('Недостаточно прав для выполнения операции');
    }
    return true;
  }
}
