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

interface DevAccount extends DevSession { salt: string; hash: string }

const ACCOUNTS_KEY = 'pitchwise.devAccounts.v1';

/**
 * Accounts live in this browser's localStorage, which is the whole of their
 * scope: there is no server-side credential store, and there is not meant to be
 * one. Clerk owns that job the moment a publishable key is configured
 * (ADR-016), and the server refuses these tokens outside development.
 *
 * Passwords are salted and hashed rather than kept as text. A single SHA-256
 * pass is not a password KDF and would be the wrong choice for anything real —
 * but storing what someone typed, in plain text, in a place any script on the
 * page can read, is a bad habit to leave lying around even in a placeholder.
 */
async function hash(password: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readAccounts(): Record<string, DevAccount> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DevAccount>) : {};
  } catch {
    return {};   // private window, or storage disabled
  }
}

function writeAccounts(accounts: Record<string, DevAccount>): void {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)); } catch { /* see above */ }
}

export const accountExists = (email: string): boolean =>
  Object.hasOwn(readAccounts(), email.trim().toLowerCase());

export const accountCount = (): number => Object.keys(readAccounts()).length;

export type AuthResult = { ok: true } | { ok: false; reason: string };

/**
 * Creates an account. Fails if the address is already taken, as a real one
 * would.
 *
 * Deliberately does **not** sign the new account in. Creating an account and
 * proving you hold its password are two different things, and collapsing them
 * means the sign-in path is never exercised by the person who just set the
 * password — which is exactly when a typo in it is cheapest to discover.
 */
export async function createDevAccount(
  email: string, password: string, name: string,
): Promise<AuthResult> {
  const key = email.trim().toLowerCase();
  const accounts = readAccounts();
  if (accounts[key]) return { ok: false, reason: 'An account already exists for that email. Sign in instead.' };
  if (password.length < 6) return { ok: false, reason: 'Password must be at least 6 characters.' };

  const salt = crypto.randomUUID();
  const account: DevAccount = {
    // Generated once and kept, so the server sees the same subject on every
    // later sign-in and the account keeps its progress.
    sub: crypto.randomUUID(),
    email: key,
    name: name.trim() || key.split('@')[0],
    salt,
    hash: await hash(password, salt),
  };
  accounts[key] = account;
  writeAccounts(accounts);
  return { ok: true };
}

/** Verifies a password against the stored hash. */
export async function signInDev(email: string, password: string): Promise<AuthResult> {
  const key = email.trim().toLowerCase();
  const account = readAccounts()[key];
  // Same message for an unknown address and a wrong password, so the form
  // cannot be used to discover which addresses have accounts.
  const rejected = { ok: false as const, reason: 'Email or password is incorrect.' };
  if (!account) return rejected;
  if (await hash(password, account.salt) !== account.hash) return rejected;
  setSession(account);
  return { ok: true };
}

/** Changes the password on an existing account. */
export async function changeDevPassword(
  email: string, current: string, next: string,
): Promise<AuthResult> {
  const key = email.trim().toLowerCase();
  const accounts = readAccounts();
  const account = accounts[key];
  if (!account) return { ok: false, reason: 'No such account.' };
  if (await hash(current, account.salt) !== account.hash) {
    return { ok: false, reason: 'Current password is incorrect.' };
  }
  if (next.length < 6) return { ok: false, reason: 'Password must be at least 6 characters.' };
  account.salt = crypto.randomUUID();
  account.hash = await hash(next, account.salt);
  writeAccounts(accounts);
  return { ok: true };
}

// ---- the signed-in session --------------------------------------------

let cachedDev: DevSession | null | undefined;

function setSession(account: DevAccount): void {
  const session: DevSession = { sub: account.sub, email: account.email, name: account.name };
  try { localStorage.setItem(KEY, JSON.stringify(session)); } catch { /* see above */ }
  cachedDev = session;
}

/** The signed-in development identity, or null if nobody is signed in. */
export function devSession(): DevSession | null {
  if (cachedDev !== undefined) return cachedDev;
  try {
    const raw = localStorage.getItem(KEY);
    cachedDev = raw ? (JSON.parse(raw) as DevSession) : null;
  } catch {
    cachedDev = null;
  }
  return cachedDev;
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
