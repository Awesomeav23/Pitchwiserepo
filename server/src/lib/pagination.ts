/**
 * Cursor pagination on (created_at, id) — API_SPEC.md §10.
 *
 * Offset pagination is wrong here: attempts are inserted at the head of the same
 * list a user is scrolling, so OFFSET 20 after a new attempt re-shows a row from
 * page one. The tiebreak on id keeps the ordering total when two attempts share
 * a timestamp.
 */
import { invalid } from './errors.ts';

export interface Cursor { c: string; i: string }

export const encodeCursor = (createdAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64url');

export function decodeCursor(raw: unknown): Cursor | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw invalid('cursor must be a string');
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (typeof parsed.c !== 'string' || typeof parsed.i !== 'string') throw new Error();
    if (!Number.isFinite(Date.parse(parsed.c))) throw new Error();
    return parsed;
  } catch {
    // Opaque to clients, so a malformed one is a client bug rather than a user
    // typing something — reject instead of silently starting from the top.
    throw invalid('cursor is not a valid pagination cursor');
  }
}

export function parseLimit(raw: unknown, fallback: number, max: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw invalid(`limit must be an integer between 1 and ${max}`);
  }
  return n;
}
