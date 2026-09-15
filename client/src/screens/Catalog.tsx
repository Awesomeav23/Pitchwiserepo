/** Course catalog — US-14. Every instrument is listed; one is published. */
import { COURSES } from '../learning/seed';
import { courseStats } from '../learning/progress';
import type { Course } from '../learning/types';

export function Catalog({ onOpen }: { onOpen: (course: Course) => void }) {
  const published = COURSES.filter((c) => c.isPublished);
  const upcoming = COURSES.filter((c) => !c.isPublished);

  return (
    <div className="tuner">
      <header>
        <h1>Pitchwise <small>courses</small></h1>
      </header>

      <p className="lede">
        Starter courses for voice and melodic instruments. Each one teaches setup, tuning,
        reading notation, and a first melody — with the exercises scored by ear.
      </p>

      <div className="cards">
        {published.map((c) => {
          const stats = courseStats(c);
          return (
            <button key={c.id} className="card" onClick={() => onOpen(c)}>
              <div className="card-title">{c.title}</div>
              <div className="card-summary">{c.summary}</div>
              <div className="card-meta">
                {stats.completed > 0
                  ? `${stats.completed} of ${stats.total} lessons complete`
                  : `${stats.total} lessons`}
              </div>
            </button>
          );
        })}
      </div>

      <h2 className="section-head">Not written yet</h2>
      <p className="stat">
        These are listed so the shape of the catalog is honest about its gaps. They cannot
        be opened, because there is nothing behind them.
      </p>
      <div className="cards">
        {upcoming.map((c) => (
          <div key={c.id} className="card disabled">
            <div className="card-title">{c.title}</div>
            <div className="card-meta">Not published</div>
          </div>
        ))}
      </div>
    </div>
  );
}
