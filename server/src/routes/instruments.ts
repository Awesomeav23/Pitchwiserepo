/** API_SPEC.md §6. */
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.ts';
import { ApiError, notFound, wrap } from '../lib/errors.ts';
import type { AuthedRequest } from '../middleware/auth.ts';

export const instruments = Router();

interface Row {
  id: string; display_name: string; family: string;
  f_min_hz: number; f_max_hz: number; transposition_semitones: number;
  gate_threshold: number; is_measured: boolean;
}

const toJson = (r: Row) => ({
  id: r.id,
  displayName: r.display_name,
  family: r.family,
  fMinHz: r.f_min_hz,
  fMaxHz: r.f_max_hz,
  transpositionSemitones: r.transposition_semitones,
  gateThreshold: r.gate_threshold,
  // Must reach the client. False means gateThreshold is a placeholder, and a
  // user told so will adjust rather than conclude the product is broken.
  isMeasured: r.is_measured,
});

instruments.get('/instruments', wrap(async (_req, res) => {
  const { rows } = await pool.query<Row>(
    `SELECT id, display_name, family, f_min_hz, f_max_hz, transposition_semitones,
            gate_threshold, is_measured
       FROM instruments ORDER BY sort_order`,
  );
  res.json({ items: rows.map(toJson) });
}));

instruments.put('/me/instruments/:instrumentId', wrap<AuthedRequest>(async (req, res) => {
  const instrumentId = req.params.instrumentId;
  const isPrimary = (req.body as { isPrimary?: unknown })?.isPrimary === true;

  const exists = await pool.query('SELECT 1 FROM instruments WHERE id = $1', [instrumentId]);
  if (exists.rowCount === 0) throw notFound();

  await withTransaction(async (db) => {
    // Clearing the old primary and setting the new one must be one transaction:
    // the partial unique index rejects two, and doing it in two statements
    // leaves a window where the user has none.
    if (isPrimary) {
      await db.query('UPDATE user_instruments SET is_primary = false WHERE user_id = $1', [req.user.id]);
    }
    await db.query(
      `INSERT INTO user_instruments (user_id, instrument_id, is_primary)
       VALUES ($1,$2,$3)
       ON CONFLICT (user_id, instrument_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [req.user.id, instrumentId, isPrimary],
    );
  });

  res.json({ instrumentId, isPrimary });
}));

instruments.delete('/me/instruments/:instrumentId', wrap<AuthedRequest>(async (req, res) => {
  const { rows } = await pool.query<{ n: number }>(
    'SELECT count(*)::int n FROM user_instruments WHERE user_id = $1', [req.user.id],
  );
  // The client cannot configure the engine without one, and the practice screen
  // has no sensible rendering for an empty selection.
  if (rows[0].n <= 1) {
    throw new ApiError('unprocessable', 'Cannot remove the only instrument');
  }
  const result = await pool.query(
    'DELETE FROM user_instruments WHERE user_id = $1 AND instrument_id = $2',
    [req.user.id, req.params.instrumentId],
  );
  if (result.rowCount === 0) throw notFound();
  res.status(204).end();
}));
