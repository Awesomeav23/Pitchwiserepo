import pg from 'pg';
import { config } from '../lib/config.ts';

/**
 * numeric comes back from pg as a string by default, because it can exceed
 * IEEE 754. Every numeric column in this schema is small and bounded — gate
 * thresholds, frequencies, cents — so returning strings would push the parsing
 * into every route instead. Parsed here, once.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
