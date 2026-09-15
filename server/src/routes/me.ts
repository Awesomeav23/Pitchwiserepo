/** API_SPEC.md §5. */
import { Router } from 'express';
import { pool } from '../db/pool.ts';
import { invalid, wrap } from '../lib/errors.ts';
import type { AuthedRequest } from '../middleware/auth.ts';

export const me = Router();

async function profile(userId: string) {
  const user = await pool.query<{ id: string; email: string; display_name: string | null; created_at: Date }>(
    'SELECT id, email, display_name, created_at FROM users WHERE id = $1', [userId],
  );
  // Embedded rather than a second call: the client needs the primary instrument
  // before it can configure the audio engine at all.
  const instruments = await pool.query<{ instrument_id: string; is_primary: boolean; created_at: Date }>(
    `SELECT instrument_id, is_primary, created_at FROM user_instruments
      WHERE user_id = $1 ORDER BY is_primary DESC, created_at`, [userId],
  );
  const u = user.rows[0];
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    createdAt: u.created_at.toISOString(),
    instruments: instruments.rows.map((r) => ({
      instrumentId: r.instrument_id,
      isPrimary: r.is_primary,
      addedAt: r.created_at.toISOString(),
    })),
  };
}

me.get('/me', wrap<AuthedRequest>(async (req, res) => {
  res.json(await profile(req.user.id));
}));

me.patch('/me', wrap<AuthedRequest>(async (req, res) => {
  const displayName = (req.body as { displayName?: unknown })?.displayName;
  // Only displayName is writable. email and authProviderId are owned by the
  // provider and a write here would be overwritten on the next request (§3.1).
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    throw invalid('displayName must be a non-empty string', [
      { path: 'displayName', message: 'must be a non-empty string' },
    ]);
  }
  await pool.query('UPDATE users SET display_name = $1, updated_at = now() WHERE id = $2',
    [displayName.trim(), req.user.id]);
  res.json(await profile(req.user.id));
}));
