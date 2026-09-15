/** The error surface from API_SPEC.md §4. */
import type { NextFunction, Request, Response } from 'express';

export type ErrorCode =
  | 'malformed_json' | 'validation_failed' | 'unauthenticated' | 'forbidden'
  | 'not_found' | 'conflict' | 'payload_too_large' | 'unprocessable'
  | 'rate_limited' | 'internal_error';

const STATUS: Record<ErrorCode, number> = {
  malformed_json: 400, validation_failed: 400, unauthenticated: 401, forbidden: 403,
  not_found: 404, conflict: 409, payload_too_large: 413, unprocessable: 422,
  rate_limited: 429, internal_error: 500,
};

export interface ErrorDetail { path: string; message: string }

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: ErrorDetail[];
  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export const notFound = () => new ApiError('not_found', 'No such row, or not visible to this user');
export const invalid = (message: string, details?: ErrorDetail[]) =>
  new ApiError('validation_failed', message, details);

/** `details` is present only for validation_failed, per §4. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(STATUS[err.code]).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.code === 'validation_failed' && err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // express.json() surfaces a parse failure as a SyntaxError with a status.
  const e = err as { type?: string; status?: number; message?: string };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'malformed_json', message: 'Body is not parseable JSON' } });
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'payload_too_large', message: 'Body over 256 KB' } });
    return;
  }

  // Never echo a database message — §4.
  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'internal_error', message: 'Unhandled server error' } });
}

/** Wraps an async handler so a rejection reaches the error middleware. */
export const wrap = <T extends Request>(
  fn: (req: T, res: Response) => Promise<void>,
) => (req: Request, res: Response, next: NextFunction): void => {
  void fn(req as T, res).catch(next);
};
