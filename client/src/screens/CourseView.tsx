/** Course detail — US-15. Modules, lessons in order, progress, and what is next. */
import { allProgress, courseStats, lockedLessons, nextLesson, resetAll } from '../learning/progress';
import type { Course, Lesson } from '../learning/types';

const KIND_LABEL: Record<string, string> = {
  content: 'Read', exercise: 'Sing', quiz: 'Quiz', drill: 'Practise',
};

export function CourseView({
  course, onOpenLesson, onBack,
}: {
  course: Course;
  onOpenLesson: (lesson: Lesson) => void;
  onBack: () => void;
}) {
  const progress = allProgress();
  const locked = lockedLessons(course);
  const stats = courseStats(course);
  const next = nextLesson(course);

  return (
    <div className="tuner">
      <header>
        <button className="back" onClick={onBack}>← Courses</button>
        <h1>{course.title}</h1>
      </header>

      <p className="lede">{course.summary}</p>

      <div className="progress-bar">
        <div style={{ width: `${(stats.completed / Math.max(1, stats.total)) * 100}%` }} />
      </div>
      <p className="stat">
        {stats.completed} of {stats.total} lessons complete
        {next && <> · next up: <strong>{next.title}</strong></>}
        {stats.completed > 0 && (
          <> · <button className="link" onClick={() => { resetAll(); location.reload(); }}>
            reset progress
          </button></>
        )}
      </p>

      {course.modules.map((module, mi) => (
        <section key={module.id} className="module">
          <h2 className="section-head">{mi + 1}. {module.title}</h2>
          <ol className="lesson-list">
            {module.lessons.map((lesson) => {
              const state = progress[lesson.id]?.state ?? 'not_started';
              const isLocked = locked.has(lesson.id);
              return (
                <li key={lesson.id}>
                  <button
                    className={`lesson-row ${state} ${isLocked ? 'locked' : ''}`}
                    disabled={isLocked}
                    onClick={() => onOpenLesson(lesson)}
                  >
                    <span className="tick">{state === 'complete' ? '✓' : isLocked ? '🔒' : '·'}</span>
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
        Lessons unlock in order. A completed lesson stays open, and a later worse attempt
        never un-completes one.
      </p>
    </div>
  );
}
