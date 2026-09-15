/** Course catalog — US-14. Served by the API. */
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import type { CourseCard } from '../api/types';
import { Loading, Failed } from '../components/Async';

const FAMILY_ORDER = ['voice', 'woodwind', 'brass', 'strings', 'keys'] as const;
const FAMILY_LABEL: Record<string, string> = {
  voice: 'Voice', woodwind: 'Woodwind', brass: 'Brass', strings: 'Strings', keys: 'Keys',
};

export function Catalog({ onOpen }: { onOpen: (course: CourseCard) => void }) {
  // Two requests rather than one: the catalog groups by instrument family, and
  // a course card carries an instrument id, not a family. Joining here keeps
  // the family out of the course payload, where it would be duplicated on
  // every row.
  const courses = useApi(() => api.courses(), []);
  const instruments = useApi(() => api.instruments(), []);

  if (courses.loading || instruments.loading) return <Loading what="courses" />;
  if (courses.error) return <Failed message={courses.error} onRetry={courses.reload} />;
  if (instruments.error) return <Failed message={instruments.error} onRetry={instruments.reload} />;

  const familyOf = (instrumentId: string) =>
    instruments.data?.find((i) => i.id === instrumentId)?.family ?? 'keys';

  return (
    <div className="tuner">
      <header><h1>Pitchwise <small>courses</small></h1></header>

      <p className="lede">
        A starter course for every instrument. Each one covers setup, tuning, reading
        notation, and a first melody — with sheet music throughout and the exercises
        scored by ear.
      </p>

      {FAMILY_ORDER.map((family) => {
        const inFamily = (courses.data ?? []).filter((c) => familyOf(c.instrumentId) === family);
        if (inFamily.length === 0) return null;
        return (
          <section key={family}>
            <h2 className="section-head">{FAMILY_LABEL[family]}</h2>
            <div className="cards">
              {inFamily.map((c) => {
                const done = c.progress?.completedLessons ?? 0;
                return (
                  <button key={c.id} className="card" onClick={() => onOpen(c)}>
                    <div className="card-title">{c.title.replace(' — starter course', '')}</div>
                    <div className="card-summary">{c.summary}</div>
                    {done > 0 && (
                      <div className="progress-bar card-progress">
                        <div style={{ width: `${(done / c.lessonCount) * 100}%` }} />
                      </div>
                    )}
                    <div className="card-meta">
                      {done > 0
                        ? `${done} of ${c.lessonCount} lessons complete`
                        : `${c.lessonCount} lessons · ${c.estimatedMinutes} min`}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
