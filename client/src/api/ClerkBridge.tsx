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

  useEffect(() => {
    setClerkTokenGetter(() => getToken());
    return () => setClerkTokenGetter(null);
  }, [getToken]);

  // Nothing renders until the getter is installed, or the first request would
  // go out with the development token and provision a second user.
  if (!isLoaded) return null;
  return <>{children}</>;
}
