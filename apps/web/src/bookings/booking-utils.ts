import type { ApiError } from '../api/api-client';

export function isUnknownResult(error: unknown): boolean {
  return !(error instanceof Error && 'status' in error && typeof (error as ApiError).status === 'number' && (error as ApiError).status < 500);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Операция не выполнена, изменения не сохранены.';
}
