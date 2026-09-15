/**
 * The loading / error / data shape every screen needs now that its content
 * comes over the network.
 *
 * Deliberately minimal — no cache, no revalidation, no query library. There are
 * a handful of screens and each fetches once; a caching layer would be more
 * configuration than the problem has.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError, NetworkError } from './client';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Refetch, for use after a mutation changes what this query returns. */
  reload: () => void;
}

export function describeError(err: unknown): string {
  if (err instanceof NetworkError) return err.message;
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'unauthenticated': return 'Your session has expired. Reload the page to start a new one.';
      case 'not_found': return 'That is not here any more.';
      case 'rate_limited': return 'Too many requests. Wait a moment and try again.';
      default: return err.message;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    run()
      .then((value) => { if (!cancelled) { setData(value); setLoading(false); } })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeError(err));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [run, nonce]);

  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}
