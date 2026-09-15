/**
 * Screen switch. Still not a router — routing is its own outstanding item, and
 * picking one belongs with the shareable course and lesson URLs it will have to
 * carry. Until then the learning path is a small state machine.
 */
import { useState } from 'react';
import { Catalog } from './screens/Catalog';
import { CourseView } from './screens/CourseView';
import { LessonView } from './screens/LessonView';
import { Practice } from './screens/Practice';
import { Tuner } from './screens/Tuner';
import type { Course, Lesson } from './learning/types';

type View =
  | { name: 'catalog' }
  | { name: 'course'; course: Course }
  | { name: 'lesson'; course: Course; lesson: Lesson }
  | { name: 'practice' }
  | { name: 'tuner' };

export default function App() {
  const [view, setView] = useState<View>({ name: 'catalog' });
  const inCourses = view.name === 'catalog' || view.name === 'course' || view.name === 'lesson';

  return (
    <>
      <nav className="nav">
        <div className="seg">
          <button className={inCourses ? 'on' : ''} onClick={() => setView({ name: 'catalog' })}>
            Learn
          </button>
          <button className={view.name === 'practice' ? 'on' : ''} onClick={() => setView({ name: 'practice' })}>
            Practice
          </button>
          <button className={view.name === 'tuner' ? 'on' : ''} onClick={() => setView({ name: 'tuner' })}>
            Tuner
          </button>
        </div>
      </nav>

      {view.name === 'catalog' &&
        <Catalog onOpen={(course) => setView({ name: 'course', course })} />}

      {view.name === 'course' &&
        <CourseView
          course={view.course}
          onOpenLesson={(lesson) => setView({ name: 'lesson', course: view.course, lesson })}
          onBack={() => setView({ name: 'catalog' })}
        />}

      {view.name === 'lesson' &&
        <LessonView
          key={view.lesson.id}
          lesson={view.lesson}
          onBack={() => setView({ name: 'course', course: view.course })}
        />}

      {/* Keyed so leaving a screen unmounts it, releasing the microphone rather
          than leaving two engines contending for it. */}
      {view.name === 'practice' && <Practice key="practice" />}
      {view.name === 'tuner' && <Tuner key="tuner" />}
    </>
  );
}
