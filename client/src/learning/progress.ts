/**
 * Lesson progress.
 *
 * LEARNING_PLATFORM.md §7 is explicit that progress is **server-evaluated**,
 * because a client that can declare its own completion makes the whole model
 * advisory. There is no server yet, so this evaluates locally and stores in
 * localStorage.
 *
 * That is a stand-in, not the design. When the server exists, `evaluate` moves
 * to it and this file becomes a cache of what the server said. The rules are
 * written here in one function precisely so there is a single thing to move.
 */
import type { CompletionRule, Course, Lesson } from './types';
import { lessonsOf } from './types';

const KEY = 'pitchwise.progress.v1';

export type LessonState = 'not_started' | 'in_progress' | 'complete';

export interface LessonProgress {
  state: LessonState;
  completedAt?: string;
  bestScore?: number;
  quizFraction?: number;
}

type Store = Record<string, LessonProgress>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    // A private window, or storage disabled. Progress is then per-session, which
    // is worse than persisted but better than a blank page.
    return {};
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch { /* see read() */ }
}

export function progressFor(lessonId: string): LessonProgress {
  return read()[lessonId] ?? { state: 'not_started' };
}

export function allProgress(): Store {
  return read();
}

/** Evidence a lesson produced, handed to the completion rule. */
export interface Evidence {
  opened?: boolean;
  selfReported?: boolean;
  attemptScore?: number;
  quizFraction?: number;
}

/**
 * The one place completion is decided. Mirrors DATA_MODEL §11.6.
 * Completion is **sticky**: a later, worse attempt never un-completes a lesson.
 */
export function evaluate(rule: CompletionRule, evidence: Evidence, existing: LessonProgress): LessonProgress {
  const next: LessonProgress = { ...existing };

  if (evidence.attemptScore != null) {
    next.bestScore = Math.max(existing.bestScore ?? 0, evidence.attemptScore);
  }
  if (evidence.quizFraction != null) {
    next.quizFraction = Math.max(existing.quizFraction ?? 0, evidence.quizFraction);
  }
  if (existing.state === 'complete') return next;

  let complete = false;
  switch (rule.kind) {
    case 'read':          complete = evidence.opened === true; break;
    case 'self_report':   complete = evidence.selfReported === true; break;
    case 'attempt_any':   complete = evidence.attemptScore != null; break;
    case 'attempt_score': complete = (next.bestScore ?? -1) >= rule.minScore; break;
    case 'quiz_pass':     complete = (next.quizFraction ?? -1) >= rule.minFraction; break;
  }

  if (complete) {
    next.state = 'complete';
    next.completedAt = new Date().toISOString();
  } else if (next.state === 'not_started') {
    next.state = 'in_progress';
  }
  return next;
}

export function record(lesson: Lesson, evidence: Evidence): LessonProgress {
  const store = read();
  const updated = evaluate(lesson.completionRule, evidence, store[lesson.id] ?? { state: 'not_started' });
  store[lesson.id] = updated;
  write(store);
  return updated;
}

/**
 * Lessons unlock in order. Sequencing is the reason this layer exists; free
 * navigation would make a course a list again. Unlocking is forward-only — a
 * completed lesson never re-locks.
 */
export function lockedLessons(course: Course): Set<string> {
  const store = read();
  const locked = new Set<string>();
  let blocked = false;
  for (const lesson of lessonsOf(course)) {
    if (blocked) locked.add(lesson.id);
    if ((store[lesson.id]?.state ?? 'not_started') !== 'complete') blocked = true;
  }
  return locked;
}

export function nextLesson(course: Course): Lesson | undefined {
  const store = read();
  return lessonsOf(course).find((l) => (store[l.id]?.state ?? 'not_started') !== 'complete');
}

export function courseStats(course: Course): { completed: number; total: number } {
  const store = read();
  const lessons = lessonsOf(course);
  return {
    completed: lessons.filter((l) => store[l.id]?.state === 'complete').length,
    total: lessons.length,
  };
}

/** Clears all progress. Wired to a control in the course view, because a
 *  learner testing the app needs a way back to the start. */
export function resetAll(): void {
  try { localStorage.removeItem(KEY); } catch { /* see read() */ }
}
