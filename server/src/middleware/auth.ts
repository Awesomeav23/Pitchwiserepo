/**
 * Bearer token verification and implicit user provisioning — API_SPEC.md §3.
 *
 * Provider-agnostic on purpose. ADR-006 chose "a managed provider" and
 * API_SPEC §14 leaves Clerk vs Auth0 open, so this verifies any RS256 JWT
 * against a configured JWKS URL, issuer and audience. Choosing the provider is
 * filling in three environment variables, not changing this file.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../lib/config.ts';
import { pool } from '../db/pool.ts';
import { ApiError } from '../lib/errors.ts';

export interface AuthedUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthedRequest extends Request {
  user: AuthedUser;
}

interface Claims { sub: string; email: string; name?: string }

const jwks = config.auth.jwksUrl
  ? createRemoteJWKSet(new URL(config.auth.jwksUrl))
  : null;

/**
 * Development shortcut, gated twice — on the env flag and on NODE_ENV, checked
 * in config.ts at startup. Lets the client be built against a real API before a
 * provider is chosen. Format: `Bearer dev:<sub>:<email>:<name>`.
 */
function parseDevToken(token: string): Claims | null {
  if (!config.auth.devMode || !token.startsWith('dev:')) return null;
  const [, sub, email, name] = token.split(':');
  if (!sub || !email) return null;
  return { sub, email, name: name || undefined };
}

async function verify(token: string): Promise<Claims> {
  const dev = parseDevToken(token);
  if (dev) return dev;

  if (!jwks) throw new ApiError('unauthenticated', 'No auth provider is configured');
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.auth.issuer || undefined,
      audience: config.auth.audience || undefined,
    });
    if (!payload.sub) throw new ApiError('unauthenticated', 'Token is missing a subject claim');
    if (typeof payload.email !== 'string') {
      // Clerk's default session token carries sub but not email, and §3.1 needs
      // email to provision the row. Naming the fix here rather than returning a
      // bare 401 — this is the first thing that goes wrong on a new setup, and
      // "unauthenticated" would send someone hunting through key configuration
      // instead of the one claim that is actually missing.
      throw new ApiError('unauthenticated',
        'Token has no email claim. In Clerk, edit the session token under ' +
        'Configure → Sessions and add: "email": "{{user.primary_email_address}}"');
    }
    return { sub: payload.sub, email: payload.email, name: typeof payload.name === 'string' ? payload.name : undefined };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('unauthenticated', 'Token could not be verified');
  }
}

/**
 * §3.1: on the first request from an unseen subject, insert the row from the
 * token claims. An upsert on auth_provider_id, which is UNIQUE, so concurrent
 * first requests cannot duplicate. email and display_name refresh on every
 * request so a change at the provider propagates without a sync job.
 */
async function provision(claims: Claims): Promise<AuthedUser> {
  const { rows } = await pool.query<{ id: string; email: string; display_name: string | null }>(
    `INSERT INTO users (auth_provider_id, email, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (auth_provider_id) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = COALESCE(EXCLUDED.display_name, users.display_name),
       updated_at = now()
     RETURNING id, email, display_name`,
    [claims.sub, claims.email, claims.name ?? null],
  );
  const row = rows[0];
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    next(new ApiError('unauthenticated', 'Missing bearer token'));
    return;
  }
  // Ownership is always derived from the token, never from a body or path
  // parameter — §3.
  verify(token)
    .then(provision)
    .then((user) => { (req as AuthedRequest).user = user; next(); })
    .catch(next);
}
