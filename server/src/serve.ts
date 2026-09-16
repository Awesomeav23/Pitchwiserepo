/**
 * Development entry point: listens on a port.
 *
 * The deployed build does not use this file — it imports the app directly and
 * lets the platform handle the listening.
 */
import { config } from './lib/config.ts';
import { pool } from './db/pool.ts';
import app from './app.ts';

const server = app.listen(config.port, () => {
  console.log(`Pitchwise API on http://localhost:${config.port}/api/v1`);
  if (config.auth.devMode) {
    console.log('AUTH_DEV_MODE is on — Authorization: Bearer dev:<sub>:<email>:<name>');
  }
});

// Finish in-flight requests before exiting, so a restart does not drop a take a
// user just performed and cannot repeat.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => { void pool.end().then(() => process.exit(0)); });
  });
}
