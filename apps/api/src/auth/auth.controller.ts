import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AuthGuard, readCookie } from './auth.guard';
import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS, type AuthenticatedSession } from './auth.types';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

interface SessionResponse {
  user: Omit<AuthenticatedSession['user'], 'id'>;
  expiresAt: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Sign in with an existing Roomly account' })
  @ApiOkResponse({ description: 'The current server session has been created.' })
  async login(@Body() body: LoginBody, @Res({ passthrough: true }) response: Response): Promise<SessionResponse> {
    const result = await this.auth.login(body?.email, body?.password);
    if (result === 'invalid-fields') {
      throw new BadRequestException({
        message: ['Укажите корректный email', 'Укажите пароль'],
      });
    }
    if (result === 'invalid-credentials') {
      throw new UnauthorizedException('Неверные учётные данные');
    }
    response.cookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      maxAge: SESSION_DURATION_MS,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return { expiresAt: result.expiresAt, user: this.profile(result) };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'End only the current server session' })
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): void {
    this.auth.logout(readCookie(request, SESSION_COOKIE_NAME));
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth(SESSION_COOKIE_NAME)
  @ApiOperation({ summary: 'Read the current read-only profile and session expiry' })
  me(@Req() request: Request): SessionResponse {
    return { expiresAt: request.auth!.expiresAt, user: this.profile(request.auth!) };
  }

  private profile(session: AuthenticatedSession): SessionResponse['user'] {
    const { email, name, role } = session.user;
    return { email, name, role };
  }
}
