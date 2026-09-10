import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { roomlyComparisonKey, validateLoginEmail } from './email';
import {
  SESSION_DURATION_MS,
  type AuthenticatedSession,
  type AuthenticatedUser,
  type UserRole,
} from './auth.types';

interface UserRow extends AuthenticatedUser {
  password_hash: string;
}

interface SessionRow extends AuthenticatedUser {
  expires_at: string;
}

export interface LoginResult extends AuthenticatedSession {
  token: string;
}

@Injectable()
export class AuthService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async login(emailValue: unknown, password: unknown): Promise<LoginResult | 'invalid-fields' | 'invalid-credentials'> {
    const { email, valid } = validateLoginEmail(emailValue);
    if (!valid || typeof password !== 'string' || password.length === 0) {
      return 'invalid-fields';
    }

    const user = this.database.sqlite
      .prepare(
        'select id, name, email, role, password_hash from users where email_key = ?',
      )
      .get(roomlyComparisonKey(email)) as UserRow | undefined;

    // Perform a verification even for an unknown account so the observable result is uniform.
    const passwordMatches = user
      ? await argon2.verify(user.password_hash, password)
      : await argon2.verify(this.unknownPasswordHash, password);
    if (!user || !passwordMatches) return 'invalid-credentials';

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS).toISOString();
    const token = randomBytes(32).toString('base64url');
    this.deleteExpiredSessions(now);
    this.database.sqlite
      .prepare(
        'insert into sessions (id, token_hash, user_id, created_at, expires_at) values (?, ?, ?, ?, ?)',
      )
      .run(randomUUID(), this.hashToken(token), user.id, now.toISOString(), expiresAt);

    return { expiresAt, token, user: this.toAuthenticatedUser(user) };
  }

  findSession(token: string | undefined): AuthenticatedSession | undefined {
    const now = new Date();
    this.deleteExpiredSessions(now);
    if (!token) return undefined;
    const row = this.database.sqlite
      .prepare(
        `select users.id, users.name, users.email, users.role, sessions.expires_at
         from sessions join users on users.id = sessions.user_id
         where sessions.token_hash = ? and sessions.expires_at > ?`,
      )
      .get(this.hashToken(token), now.toISOString()) as SessionRow | undefined;
    return row
      ? { expiresAt: row.expires_at, user: this.toAuthenticatedUser(row) }
      : undefined;
  }

  logout(token: string | undefined): void {
    this.deleteExpiredSessions(new Date());
    if (token) {
      this.database.sqlite
        .prepare('delete from sessions where token_hash = ?')
        .run(this.hashToken(token));
    }
  }

  deleteExpiredSessions(now = new Date()): void {
    this.database.sqlite
      .prepare('delete from sessions where expires_at <= ?')
      .run(now.toISOString());
  }

  private readonly unknownPasswordHash =
    '$argon2id$v=19$m=19456,t=2,p=1$cm9vbWx5LXVua25vd24tc2FsdCE$DIOriDToJEToMliXopAVnIINsoqN26Zc6IzTvxxRpK4';

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthenticatedUser(user: AuthenticatedUser): AuthenticatedUser {
    return { id: user.id, name: user.name, email: user.email, role: user.role as UserRole };
  }
}
