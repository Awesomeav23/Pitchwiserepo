/** Configuration, read once at startup so a missing value fails loudly here
 *  rather than on the first request that needs it. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadDotEnv(): void {
  try {
    const text = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch { /* no .env — rely on the real environment */ }
}
loadDotEnv();

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable ${key}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: required('DATABASE_URL'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',

  auth: {
    jwksUrl: process.env.AUTH_JWKS_URL ?? '',
    issuer: process.env.AUTH_ISSUER ?? '',
    audience: process.env.AUTH_AUDIENCE ?? '',
    /** See middleware/auth.ts. Refuses to enable outside development. */
    devMode: process.env.AUTH_DEV_MODE === 'true',
  },

  /**
   * DATA_MODEL §5.1. Server-side rather than in the request so it can be
   * retuned without a client release. Its final value is still an open item.
   */
  coverageThreshold: Number(process.env.COVERAGE_THRESHOLD ?? 0.5),
} as const;

if (config.auth.devMode && config.nodeEnv !== 'development') {
  throw new Error('AUTH_DEV_MODE cannot be enabled outside NODE_ENV=development');
}
if (!config.auth.devMode && !config.auth.jwksUrl) {
  throw new Error('AUTH_JWKS_URL is required when AUTH_DEV_MODE is off');
}
