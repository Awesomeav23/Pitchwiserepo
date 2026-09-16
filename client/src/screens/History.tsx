/**
 * Attempt history — US-07.
 *
 * The product's premise is that improvement is visible over weeks rather than
 * guessed at, and this is the screen that premise lives or dies on. Everything
 * else shows you one moment; this shows the shape.
 *
 * Paginated rather than fetched whole: attempts accumulate for as long as
 * someone practises, and a list that loads all of them gets slower the more
 * someone uses the app, which is exactly backwards.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { describeError, useApi } from '../api/useApi';
import type { Attempt } from '../api/types';
import { Loading, Failed } from '../components/Async';
import { navigate } from '../lib/route';

const PAGE = 20;

export function History() {
  // Fetched once and joined client-side. An attempt carries an exerciseId, not
  // a title — the same reason the catalog fetches instruments alongside courses.
  const exercises = useApi(() => api.exercises(), []);
  const instruments = useApi(() => api.instruments(), []);

  const [filter, setFilter] = useState<string>('');
  const [items, setItems] = useState<Attempt[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((exerciseId: string, after?: string) => {
    const first = after === undefined;
    if (first) setLoading(true); else setLoadingMore(true);
    setError(null);
    api.attempts({ exerciseId: exerciseId || undefined, cursor: after, limit: PAGE })
      .then((page) => {
        setItems((prev) => (first ? page.items : [...prev, ...page.items]));
        setCursor(page.nextCursor);
      })
      .catch((err: unknown) => setError(describeError(err)))
      .finally(() => { setLoading(false); setLoadingMore(false); });
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const remove = (id: string) => {
    // Optimistic: the row goes immediately and comes back if the server refuses.
    // A take is the user's own record and deleting one should not feel like a
    // request being considered.
    const before = items;
    setItems((prev) => prev.filter((a) => a.id !== id));
    api.deleteAttempt(id).catch((err: unknown) => {
      setItems(before);
      setError(describeError(err));
    });
  };

  if (exercises.loading || instruments.loading || loading) return <Loading what="your history" />;
  if (exercises.error) return <Failed message={exercises.error} onRetry={exercises.reload} />;

  const titleOf = (id: string) => exercises.data?.find((e) => e.id === id)?.title ?? 'Unknown exercise';
  const instrumentOf = (id: string) =>
    instruments.data?.find((i) => i.id === id)?.displayName ?? id;

  return (
    <div className="tuner history">
      <header>
        <h1>Pitchwise <small>history</small></h1>
      </header>

      <p className="lede">
        Every take you have recorded, newest first. The point of keeping them is the trend:
        one score says little, twenty on the same exercise say whether you are improving.
      </p>

      {error && <p className="alert error">{error}</p>}

      <section className="controls">
        <label>
          Exercise
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All exercises</option>
            {exercises.data?.map((e) => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
        </label>
      </section>

      {items.length === 0 ? (
        <EmptyState filtered={filter !== ''} onClear={() => setFilter('')} />
      ) : (
        <>
          <ol className="attempt-list">
            {items.map((a) => (
              <li key={a.id}>
                <button className="attempt-row" onClick={() => navigate({ name: 'attempt', id: a.id })}>
                  <span className="attempt-score" style={{ color: scoreColor(a.overallScore) }}>
                    {a.overallScore}
                  </span>
                  <span className="attempt-main">
                    <span className="attempt-title">{titleOf(a.exerciseId)}</span>
                    <span className="attempt-sub">
                      {instrumentOf(a.instrumentId)} · {a.notesOnPitch} of {a.notesTotal} on pitch
                      {a.meanAbsCents != null && <> · {a.meanAbsCents.toFixed(1)}¢ average</>}
                    </span>
                  </span>
                  <span className="attempt-when">{when(a.createdAt)}</span>
                </button>
                <button
                  className="attempt-delete"
                  title="Delete this take"
                  onClick={() => remove(a.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>

          {cursor && (
            <button className="load-more" disabled={loadingMore} onClick={() => load(filter, cursor)}>
              {loadingMore ? 'Loading…' : 'Show older takes'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  // An empty history is the normal state for a new user, so it should read as a
  // starting point rather than as something having gone wrong.
  return (
    <div className="empty">
      {filtered ? (
        <>
          <p>No takes recorded for that exercise yet.</p>
          <button className="link" onClick={onClear}>Show all exercises</button>
        </>
      ) : (
        <>
          <p>You have not recorded a take yet.</p>
          <p className="stat">
            Takes are saved automatically when you finish an exercise — in a lesson, or on
            the practice screen.
          </p>
          <button className="primary" onClick={() => navigate({ name: 'practice' })}>
            Go to practice
          </button>
        </>
      )}
    </div>
  );
}

/** Relative for anything recent, absolute once "3 days ago" stops being useful. */
function when(iso: string): string {
  const then = new Date(iso);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / 1440)}d ago`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const scoreColor = (score: number) =>
  score >= 80 ? '#3ddc84' : score >= 50 ? '#f2c14e' : '#ff5d6c';
