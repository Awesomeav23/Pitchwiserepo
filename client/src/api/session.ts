/**
 * Who the user is, for as long as there is no auth provider.
 *
 * ADR-006 chose a managed provider and API_SPEC §14 leaves Clerk vs Auth0 open,
 * so there is no sign-in yet. The server accepts a development token in its
 * place (`dev:<sub>:<email>:<name>`), gated on both a flag and NODE_ENV, and
 * this mints one per browser so the app has a stable identity to accumulate
 * progress against.
 *
 * **This is scaffolding.** When the provider is chosen, `token()` returns the
 * provider's JWT instead and everything above this file is unchanged — which is
 * the reason it is a separate module rather than three lines inside the fetch
 * wrapper.
 */
const KEY = 'pitchwise.devSession.v1';

interface DevSession { sub: string; email: string; name: string }

function load(): DevSession {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DevSession;
  } catch { /* private window, or storage disabled */ }

  const sub = crypto.randomUUID();
  const session: DevSession = {
    sub,
    email: `learner-${sub.slice(0, 8)}@pitchwise.local`,
    name: 'Learner',
  };
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* see above */ }
  return session;
}

let cached: DevSession | null = null;

export function session(): DevSession {
  return (cached ??= load());
}

export function token(): string {
  const s = session();
  return `dev:${s.sub}:${s.email}:${s.name}`;
}

/** Clears the identity, so the next request provisions a fresh user. The only
 *  way back to an empty course while there is no sign-out. */
export function resetSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* see above */ }
  cached = null;
}
