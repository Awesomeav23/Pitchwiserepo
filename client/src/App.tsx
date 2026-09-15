import { Catalog } from './screens/Catalog';
import { CourseView } from './screens/CourseView';
import { LessonView } from './screens/LessonView';
import { Practice } from './screens/Practice';
import { Tuner } from './screens/Tuner';
import { navigate, useRoute } from './lib/route';

export default function App() {
  const route = useRoute();
  const inCourses = route.name === 'catalog' || route.name === 'course' || route.name === 'lesson';

  return (
    <>
      <nav className="nav">
        <div className="seg">
          <button className={inCourses ? 'on' : ''} onClick={() => navigate({ name: 'catalog' })}>
            Learn
          </button>
          <button className={route.name === 'practice' ? 'on' : ''}
            onClick={() => navigate({ name: 'practice' })}>
            Practice
          </button>
          <button className={route.name === 'tuner' ? 'on' : ''}
            onClick={() => navigate({ name: 'tuner' })}>
            Tuner
          </button>
        </div>
      </nav>

      {route.name === 'catalog' &&
        <Catalog onOpen={(course) => navigate({ name: 'course', slug: course.slug })} />}

      {route.name === 'course' &&
        <CourseView
          key={route.slug}
          slug={route.slug}
          onOpenLesson={(lesson) => navigate({ name: 'lesson', id: lesson.id })}
          onBack={() => navigate({ name: 'catalog' })}
        />}

      {route.name === 'lesson' &&
        <LessonView key={route.id} lessonId={route.id} onBack={() => history.back()} />}

      {/* Keyed so leaving a screen unmounts it, releasing the microphone rather
          than leaving two engines contending for it. */}
      {route.name === 'practice' && <Practice key="practice" />}
      {route.name === 'tuner' && <Tuner key="tuner" />}
    </>
  );
}
