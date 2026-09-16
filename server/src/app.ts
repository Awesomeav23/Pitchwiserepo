/**
 * The Express application — the contract is docs/API_SPEC.md.
 *
 * An ordinary CRUD service by design (ADR-001): audio never reaches it, so
 * there is no streaming, no upload path and no heavy work on any request.
 *
 * Exported rather than started here, because it runs two ways: `serve.ts`
 * listens on a port in development, and the deployed build hands this same app
 * to a serverless function. Nothing about the routes differs between them.
 */
import express from 'express';
import { config } from './lib/config.ts';
import { errorHandler } from './lib/errors.ts';
import { authenticate } from './middleware/auth.ts';
import { rateLimit } from './middleware/rateLimit.ts';
import { health } from './routes/health.ts';
import { me } from './routes/me.ts';
import { instruments } from './routes/instruments.ts';
import { exercises } from './routes/exercises.ts';
import { attempts } from './routes/attempts.ts';
import { learning } from './routes/learning.ts';

const app = express();
app.disable('x-powered-by');

// Credentials are not required: the token is a bearer header, not a cookie.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === config.clientOrigin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  next();
});

// A 60-note attempt is a few kB; the cap is a floor under abuse (§11).
app.use(express.json({ limit: '256kb' }));

const v1 = express.Router();
v1.use(health);                                    // unauthenticated (§12)
v1.use(authenticate);                              // everything below requires a token
v1.use(rateLimit('read', 120));
v1.use(me);
v1.use(instruments);
v1.use(exercises);
v1.use(learning);
v1.use('/attempts', rateLimit('write', 30));       // §11: 30/min on attempt writes
v1.use(attempts);

app.use('/api/v1', v1);

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint' } });
});
app.use(errorHandler);

export default app;
