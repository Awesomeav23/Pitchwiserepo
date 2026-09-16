/**
 * Where the bearer token comes from.
 *
 * Two modes, chosen by whether `VITE_CLERK_PUBLISHABLE_KEY` is set:
 *
 * - **Clerk** (ADR-016). The real thing. A component bridges Clerk's `getToken`
 *   into this module, because the API client is not a React component and
 *   cannot call a hook.
 * - **Development session.** A token the server accepts only when AUTH_DEV_MODE
 *   is on, minted per browser. Keeps the app runnable with no provider account,
 *   which is what every contributor has before they sign up for one.
 *
 * The fallback is deliberate: adding Clerk must not be able to break the working
 * state. Without a key the app behaves exactly as it did before it existed.
 */
/**
 * v2, and the bump matters. A v1 session was created silently on first load,
 * before a sign-in page existed — nobody signed into one. Treating those as
 * "already signed in" would send every existing browser straight past the form
 * with an identity its owner never chose, so they are not honoured.
 */
const KEY = 'pitchwise.devSession.v2';

export const CLERK_PUBLISHABLE_KEY: string | undefined =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export const usingClerk = (): boolean => Boolean(CLERK_PUBLISHABLE_KEY);

// ---- Clerk ------------------------------------------------------------

type TokenGetter = () => Promise<string | null>;
let clerkToken: TokenGetter | null = null;

/** Called by the bridge component once Clerk has loaded. */
export function setClerkTokenGetter(getter: TokenGetter | null): void {
  clerkToken = getter;
}

// ---- development session ----------------------------------------------

export interface DevSession { sub: string; email: string; name: string }

let cachedDev: DevSession | null | undefined;

/** The stored development identity, or null if nobody has signed in. */
export function devSession(): DevSession | null {
  if (cachedDev !== undefined) return cachedDev;
  try {
    const raw = localStorage.getItem(KEY);
    cachedDev = raw ? (JSON.parse(raw) as DevSession) : null;
  } catch {
    cachedDev = null;   // private window, or storage disabled
  }
  return cachedDev;
}

/**
 * Creates a development identity from an email.
 *
 * There is no password parameter, and that is deliberate. The placeholder
 * sign-in form has a password field so the page has the shape it will have
 * under Clerk, but nothing is checked against anything — accepting one here
 * would mean storing or comparing a credential, and a fake credential store is
 * worse than an obviously absent one.
 *
 * `sub` is generated per sign-in rather than derived from the email, so signing
 * in with a new address gives a genuinely new account on the server. That is
 * what makes this useful for testing a fresh learner.
 */
export function signInDev(email: string, name: string): DevSession {
  const existing = devSession();
  const session: DevSession = {
    sub: existing?.email === email ? existing.sub : crypto.randomUUID(),
    email,
    name: name.trim() || email.split('@')[0],
  };
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* see above */ }
  cachedDev = session;
  return session;
}

// ---- the one thing the API client calls --------------------------------

export async function getToken(): Promise<string> {
  if (clerkToken) {
    const token = await clerkToken();
    if (token) return token;
    // Signed out, or the session expired mid-request. Falling back to the dev
    // token here would silently swap identities, so fail instead.
    throw new Error('Not signed in');
  }
  const s = devSession();
  if (!s) throw new Error('Not signed in');
  return `dev:${s.sub}:${s.email}:${s.name}`;
}

/** Clears the development identity. No effect under Clerk, where signing out
 *  is Clerk's job. */
export function signOutDev(): void {
  try { localStorage.removeItem(KEY); } catch { /* see above */ }
  cachedDev = null;
}
