/** API_SPEC.md §12. Unauthenticated. */
import { Router } from 'express';
import { pool } from '../db/pool.ts';

export const health = Router();

health.get('/healthz', (_req, res) => {
  // Checks the database, not just the process: on a free tier the failure that
  // matters is the app being alive while Postgres sleeps.
  pool.query('SELECT 1')
    .then(() => res.json({ status: 'ok', db: 'ok' }))
    .catch(() => res.status(503).json({ status: 'degraded', db: 'unreachable' }));
});
