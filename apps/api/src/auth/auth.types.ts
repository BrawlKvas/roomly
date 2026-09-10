export const SESSION_COOKIE_NAME = 'roomly_session';
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export type UserRole = 'employee' | 'admin';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedSession {
  expiresAt: string;
  user: AuthenticatedUser;
}
