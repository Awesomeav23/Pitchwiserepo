/**
 * Course catalog — US-14.
 *
 * The instrument chosen at onboarding leads, and everything else stays
 * browsable below it. Hiding the rest would be wrong — people take up a second
 * instrument, and a catalog that shows one course is not a catalog — but so is
 * burying someone's own course among twelve, which made the onboarding question
 * look like it changed nothing.
 */
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useMe } from '../api/useMe';
import type { CourseCard } from '../api/types';
import { Loading, Failed } from '../components/Async';

const FAMILY_ORDER = ['voice', 'woodwind', 'brass', 'strings', 'keys'] as const;
const FAMILY_LABEL: Record<string, string> = {
  voice: 'Voice', woodwind: 'Woodwind', brass: 'Brass', strings: 'Strings', keys: 'Keys',
};

export function Catalog({ onOpen }: { onOpen: (course: CourseCard) => void }) {
  const { me } = useMe();
  const courses = useApi(() => api.courses(), []);
  const instruments = useApi(() => api.instruments(), []);

  if (courses.loading || instruments.loading) return <Loading what="courses" />;
  if (courses.error) return <Failed message={courses.error} onRetry={courses.reload} />;
  if (instruments.error) return <Failed message={instruments.error} onRetry={instruments.reload} />;

  const all = courses.data ?? [];
  const mineIds = new Set(me?.instruments.map((i) => i.instrumentId) ?? []);
  const mine = all.filter((c) => mineIds.has(c.instrumentId));
  const rest = all.filter((c) => !mineIds.has(c.instrumentId));

  const familyOf = (instrumentId: string) =>
    instruments.data?.find((i) => i.id === instrumentId)?.family ?? 'keys';
  const nameOf = (instrumentId: string) =>
    instruments.data?.find((i) => i.id === instrumentId)?.displayName ?? instrumentId;

  /**
   * "Piano (melody)" → "Piano" for the heading only. The qualifier is not
   * decoration — it warns a pianist that only single notes are scored — but it
   * belongs on the card they click, not repeated a line above it. Voice types
   * keep their "Voice — soprano" form, which is a name rather than a caveat.
   */
  const headingName = (instrumentId: string) =>
    nameOf(instrumentId).replace(/\s*\([^)]*\)/g, '').trim();

  const primary = me?.instruments.find((i) => i.isPrimary)?.instrumentId;

  return (
    <div className="tuner">
      <header><h1>Pitchwise <small>courses</small></h1></header>

      {mine.length > 0 && (
        <section>
          <h2 className="section-head">
            {mine.length === 1 ? `Your course · ${headingName(mine[0].instrumentId)}` : 'Your instruments'}
          </h2>
          <div className="cards">
            {mine.map((c) => (
              <CourseCardView key={c.id} course={c} onOpen={onOpen}
                highlight={c.instrumentId === primary} />
            ))}
          </div>
        </section>
      )}

      <h2 className="section-head">
        {mine.length > 0 ? 'Every other instrument' : 'All courses'}
      </h2>
      <p className="stat catalog-note">
        You are not limited to what you chose. Opening any course here works, and adding
        the instrument to your profile moves it up to the top.
      </p>

      {FAMILY_ORDER.map((family) => {
        const inFamily = rest.filter((c) => familyOf(c.instrumentId) === family);
        if (inFamily.length === 0) return null;
        return (
          <section key={family}>
            <h3 className="section-head sub">{FAMILY_LABEL[family]}</h3>
            <div className="cards">
              {inFamily.map((c) => (
                <CourseCardView key={c.id} course={c} onOpen={onOpen} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CourseCardView({
  course, onOpen, highlight,
}: {
  course: CourseCard;
  onOpen: (c: CourseCard) => void;
  highlight?: boolean;
}) {
  const done = course.progress?.completedLessons ?? 0;
  return (
    <button className={`card ${highlight ? 'mine' : ''}`} onClick={() => onOpen(course)}>
      <div className="card-title">{course.title.replace(' — starter course', '')}</div>
      <div className="card-summary">{course.summary}</div>
      {done > 0 && (
        <div className="progress-bar card-progress">
          <div style={{ width: `${(done / course.lessonCount) * 100}%` }} />
        </div>
      )}
      <div className="card-meta">
        {done > 0
          ? `${done} of ${course.lessonCount} lessons complete`
          : `${course.lessonCount} lessons · ${course.estimatedMinutes} min`}
      </div>
    </button>
  );
}
