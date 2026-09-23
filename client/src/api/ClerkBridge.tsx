/**
 * Hands Clerk's token getter to the API client.
 *
 * `useAuth` is a hook and `api/client.ts` is not a component, so something has
 * to cross that boundary. One component doing it once is cheaper than making
 * every call site a hook, and it keeps Clerk out of every other file.
 */
import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setClerkTokenGetter } from './session';

export function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded } = useAuth();

  // Installed during render rather than in an effect, which is the whole point
  // of this line. React runs effects child-first, so an effect here runs
  // *after* the children's — and the children fetch from theirs. Whenever
  // Clerk was already loaded on the first render, which is the normal case
  // arriving from its own redirect or on a warm session, the first request
  // went out before any getter existed. getToken() then fell back to the
  // development token, production refuses that, and the screen reported "Your
  // session has expired". Reloading appeared to fix it only because Clerk
  // reported isLoaded: false first and the children were held back long enough.
  //
  // Assigning a function reference is idempotent and cheap, so doing it on
  // every render costs nothing and cannot be raced.
  setClerkTokenGetter(() => getToken());

  useEffect(() => () => setClerkTokenGetter(null), []);

  // Still gated on isLoaded: before Clerk has resolved, getToken() answers null
  // and the getter above would throw rather than return a usable token.
  if (!isLoaded) return null;
  return <>{children}</>;
}
