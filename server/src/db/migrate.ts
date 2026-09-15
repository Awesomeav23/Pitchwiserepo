/**
 * Applies every .sql file in migrations/ in filename order, once each.
 *
 * No migration library. There are two files, they run in order, and a table of
 * what has been applied is the whole feature — a dependency here would be more
 * configuration than code.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from './pool.ts';

const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../migrations');

async function main(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations'))
      .rows.map((r) => r.filename),
  );

  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    // Each migration is one transaction: a file that fails halfway leaves no
    // half-built schema behind to reason about.
    await withTransaction(async (client) => {
      await client.query(readFileSync(join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    });
    console.log(`  apply ${file}`);
    count++;
  }

  console.log(count === 0 ? 'Schema already up to date.' : `Applied ${count} migration(s).`);
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
  void pool.end();
});
