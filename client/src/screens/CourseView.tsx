/** Course detail — US-15. Modules, lessons in order, progress, what is next. */
import { useEffect } from 'react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import type { CourseOutlineLesson } from '../api/types';
import { Loading, Failed } from '../components/Async';

const KIND_LABEL: Record<string, string> = {
  content: 'Read', exercise: 'Play', quiz: 'Quiz', drill: 'Practise',
};

export function CourseView({
  slug, onOpenLesson, onBack,
}: {
  slug: string;
  onOpenLesson: (lesson: CourseOutlineLesson) => void;
  onBack: () => void;
}) {
  const course = useApi(() => api.course(slug), [slug]);
  const courseId = course.data?.id;
  const enrolled = course.data?.enrolled;

  // Enrolment is idempotent and does not reset progress, so opening a course is
  // a safe place to record that someone started it.
  useEffect(() => {
    if (courseId && enrolled === false) void api.enroll(courseId).catch(() => { /* not worth blocking the page */ });
  }, [courseId, enrolled]);

  if (course.loading) return <Loading what="the course" />;
  if (course.error || !course.data) return <Failed message={course.error ?? 'Not found'} onRetry={course.reload} />;

  const c = course.data;
  const lessons = c.modules.flatMap((m) => m.lessons);
  const completed = lessons.filter((l) => l.progress?.state === 'complete').length;
  const next = lessons.find((l) => l.id === c.nextLessonId);

  return (
    <div className="tuner">
      <header>
        <button className="back" onClick={onBack}>← Courses</button>
        <h1>{c.title}</h1>
      </header>

      <p className="lede">{c.summary}</p>

      <div className="progress-bar">
        <div style={{ width: `${(completed / Math.max(1, lessons.length)) * 100}%` }} />
      </div>
      <p className="stat">
        {completed} of {lessons.length} lessons complete
        {next && <> · next up: <strong>{next.title}</strong></>}
      </p>

      {c.modules.map((module, mi) => (
        <section key={module.id} className="module">
          <h2 className="section-head">{mi + 1}. {module.title}</h2>
          <ol className="lesson-list">
            {module.lessons.map((lesson) => {
              const state = lesson.progress?.state ?? 'not_started';
              return (
                <li key={lesson.id}>
                  <button
                    className={`lesson-row ${state} ${lesson.locked ? 'locked' : ''}`}
                    disabled={lesson.locked}
                    onClick={() => onOpenLesson(lesson)}
                  >
                    <span className="tick">
                      {state === 'complete' ? '✓' : lesson.locked ? '🔒' : '·'}
                    </span>
                    <span className="lesson-title">{lesson.title}</span>
                    <span className="lesson-kind">{KIND_LABEL[lesson.kind]}</span>
                    <span className="lesson-mins">{lesson.estimatedMinutes} min</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <p className="stat">
        Lessons unlock in order, and the server decides — a completed lesson stays open,
        and a later worse attempt never un-completes one.
      </p>
    </div>
  );
}
