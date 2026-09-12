export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = 'UNKNOWN_ERROR',
    readonly requestId?: string,
    readonly fieldErrors: string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorResponse {
  code?: string;
  fieldErrors?: string[];
  message?: string;
  requestId?: string;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');

  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers,
  });

  if (!response.ok) {
    const error = await readError(response);
    throw new ApiError(
      error.message ?? 'Запрос не выполнен',
      response.status,
      error.code,
      error.requestId,
      error.fieldErrors,
    );
  }

  return (await response.json()) as T;
}

async function readError(response: Response): Promise<ErrorResponse> {
  try {
    return (await response.json()) as ErrorResponse;
  } catch {
    return {};
  }
}
