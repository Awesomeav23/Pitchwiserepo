/** Response shapes from the API. Mirrors docs/API_SPEC.md. */
import type { Block, Quiz } from '../learning/types';
import type { NoteSequence } from '../exercises/types';

export interface Me {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  instruments: Array<{ instrumentId: string; isPrimary: boolean; addedAt: string }>;
}

export interface ApiInstrument {
  id: string;
  displayName: string;
  family: 'voice' | 'woodwind' | 'brass' | 'strings' | 'keys';
  fMinHz: number;
  fMaxHz: number;
  transpositionSemitones: number;
  gateThreshold: number;
  /** False means gateThreshold is a placeholder, not a measurement. Surfaced. */
  isMeasured: boolean;
}

/**
 * What `GET /exercises` returns. **No `noteSequence`** — the list omits it by
 * design (API_SPEC §7), because sequences are the largest field in the table
 * and a picker renders none of them.
 *
 * Split from the full record deliberately. These were one type, with
 * `noteSequence` marked required, which let a summary be used where a full
 * record was needed and crashed at runtime instead of at compile time. The
 * separation is the whole point: a screen that needs the notes cannot now be
 * handed something that does not have them.
 */
export interface ApiExerciseSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  typeId: string;
  difficulty: number;
  tempoBpm: number;
  timeSignature: string;
  lowestMidi: number;
  highestMidi: number;
  noteCount: number;
  durationMs: number;
  /** False for the transposed variants a course generates. */
  inLibrary?: boolean;
}

/** What `GET /exercises/:idOrSlug` returns, and what a take needs. */
export interface ApiExercise extends ApiExerciseSummary {
  noteSequence: NoteSequence;
}

export type LessonKind = 'content' | 'exercise' | 'quiz' | 'drill';

export type CompletionRule =
  | { kind: 'read' } | { kind: 'self_report' } | { kind: 'attempt_any' }
  | { kind: 'attempt_score'; minScore: number }
  | { kind: 'quiz_pass'; minFraction: number };

export interface LessonProgress {
  state: 'in_progress' | 'complete';
  completedAt: string | null;
  quizFraction?: number | null;
  bestAttemptId?: string | null;
}

export interface CourseCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  instrumentId: string;
  level: number;
  lessonCount: number;
  estimatedMinutes: number;
  progress: { completedLessons: number; state: string } | null;
}

export interface CourseOutlineLesson {
  id: string;
  slug: string;
  title: string;
  kind: LessonKind;
  exerciseId: string | null;
  completionRule: CompletionRule;
  estimatedMinutes: number;
  /** Computed by the server: true when an earlier lesson is incomplete. */
  locked: boolean;
  progress: LessonProgress | null;
}

export interface CourseOutline {
  id: string;
  slug: string;
  title: string;
  summary: string;
  instrumentId: string;
  level: number;
  enrolled: boolean;
  nextLessonId: string | null;
  modules: Array<{ id: string; title: string; lessons: CourseOutlineLesson[] }>;
}

/** Quiz as it reaches the client: answers and explanations are stripped
 *  until submission (API_SPEC §15.4). */
export type QuizForClient = Omit<Quiz, 'questions'> & {
  questions: Array<Omit<Quiz['questions'][number], 'answerIndex' | 'explain'>>;
};

export interface LessonDetail {
  id: string;
  slug: string;
  title: string;
  kind: LessonKind;
  estimatedMinutes: number;
  completionRule: CompletionRule;
  blocks: Block[] | null;
  quiz: QuizForClient | null;
  exercise: ApiExercise | null;
  progress: LessonProgress | null;
}

export interface QuizResult {
  fraction: number;
  passed: boolean;
  results: Array<{ questionId: string; correct: boolean; answerIndex: number; explain: string }>;
  progress: LessonProgress;
}

export interface Attempt {
  id: string;
  exerciseId: string;
  instrumentId: string;
  startedAt: string;
  durationMs: number;
  overallScore: number;
  meanAbsCents: number | null;
  notesOnPitch: number;
  notesAttempted: number;
  notesTotal: number;
  rhythmScored: boolean;
  engineVersion: string;
  inputSource: 'audio' | 'midi';
  noteResults?: { version: 1; results: unknown[] };
  createdAt: string;
  lessonProgress?: LessonProgress;
}

export interface Page<T> { items: T[]; nextCursor: string | null }
