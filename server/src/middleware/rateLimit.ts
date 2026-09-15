/**
 * API_SPEC.md §11. A fixed window per user per bucket, held in memory.
 *
 * In memory means it does not survive a restart and does not hold across more
 * than one instance. That is the right trade for a single free-tier process —
 * the limit is a floor under abuse, not a billing control. It becomes wrong the
 * moment the API runs more than one instance, and the fix then is Redis or the
 * platform's own limiter, not a cleverer version of this.
 */
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/errors.ts';
import type { AuthedRequest } from './auth.ts';

interface Window { count: number; resetAt: number }
const windows = new Map<string, Window>();

// Bounded so an unbounded key space cannot grow the map forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}, 60_000).unref();

export function rateLimit(bucket: string, perMinute: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userId = (req as AuthedRequest).user?.id ?? req.ip ?? 'anonymous';
    const key = `${bucket}:${userId}`;
    const now = Date.now();
    const existing = windows.get(key);

    if (!existing || existing.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + 60_000 });
      next();
      return;
    }
    if (existing.count >= perMinute) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      _res.setHeader('Retry-After', String(retryAfter));
      next(new ApiError('rate_limited', `Rate limit exceeded; retry in ${retryAfter}s`));
      return;
    }
    existing.count++;
    next();
  };
}
