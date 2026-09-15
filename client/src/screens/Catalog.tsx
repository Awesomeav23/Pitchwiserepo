/** Course catalog — US-14. One starter course per instrument, all written. */
import { INSTRUMENT_PROFILES } from '../audio/profiles';
import { COURSES } from '../learning/seed';
import { courseStats } from '../learning/progress';
import { lessonsOf } from '../learning/types';
import type { Course } from '../learning/types';

const FAMILY_ORDER = ['voice', 'woodwind', 'brass', 'strings', 'keys'] as const;
const FAMILY_LABEL: Record<string, string> = {
  voice: 'Voice', woodwind: 'Woodwind', brass: 'Brass', strings: 'Strings', keys: 'Keys',
};

export function Catalog({ onOpen }: { onOpen: (course: Course) => void }) {
  const published = COURSES.filter((c) => c.isPublished);

  return (
    <div className="tuner">
      <header>
        <h1>Pitchwise <small>courses</small></h1>
      </header>

      <p className="lede">
        A starter course for every instrument. Each one covers setup, tuning, reading
        notation, and a first melody — with sheet music throughout and the exercises
        scored by ear.
      </p>

      {FAMILY_ORDER.map((family) => {
        const courses = published.filter((c) => familyOf(c) === family);
        if (courses.length === 0) return null;
        return (
          <section key={family}>
            <h2 className="section-head">{FAMILY_LABEL[family]}</h2>
            <div className="cards">
              {courses.map((c) => {
                const stats = courseStats(c);
                const done = stats.completed > 0;
                return (
                  <button key={c.id} className="card" onClick={() => onOpen(c)}>
                    <div className="card-title">{c.title.replace(' — starter course', '')}</div>
                    <div className="card-summary">{c.summary}</div>
                    {done && (
                      <div className="progress-bar card-progress">
                        <div style={{ width: `${(stats.completed / stats.total) * 100}%` }} />
                      </div>
                    )}
                    <div className="card-meta">
                      {done
                        ? `${stats.completed} of ${stats.total} lessons complete`
                        : `${stats.total} lessons · ${minutesOf(c)} min`}
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

function familyOf(course: Course): string {
  return INSTRUMENT_PROFILES.find((p) => p.id === course.instrumentId)?.family ?? 'keys';
}

const minutesOf = (course: Course): number =>
  lessonsOf(course).reduce((sum, l) => sum + l.estimatedMinutes, 0);
