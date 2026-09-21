/**
 * Client-side shapes for the learning layer. Mirrors DATA_MODEL.md §11 and the
 * block shapes in LEARNING_PLATFORM.md §5, so that when the server exists these
 * become the API's response types rather than a parallel model.
 */
import type { NoteSequence } from '../exercises/types';

export type CalloutTone = 'note' | 'warning' | 'limitation';

export type Block =
  | { kind: 'prose'; md: string }
  /** Sheet music. Authored as the compact note string of ADR-011 and engraved
   *  by VexFlow, so one source produces both the notation and the audio. */
  | { kind: 'score'; spec: string; bpm: number; clef?: 'treble' | 'bass';
      timeSignature?: string; caption?: string; playable?: boolean;
      /** Which instrument's voice to play it back with. */
      instrumentId?: string }
  | { kind: 'diagram'; id: string; caption: string }
  | { kind: 'callout'; tone: CalloutTone; md: string };

export type CompletionRule =
  | { kind: 'read' }
  | { kind: 'self_report' }
  | { kind: 'attempt_any' }
  | { kind: 'attempt_score'; minScore: number }
  | { kind: 'quiz_pass'; minFraction: number };

export interface QuizQuestion {
  id: string;
  prompt: string;
  /** Optional engraved example the question is about. */
  score?: { spec: string; bpm: number; clef?: 'treble' | 'bass' };
  choices: string[];
  /** Stripped from the API response until submission — API_SPEC §15.4. Present
   *  here only because there is no server yet to strip it. */
  answerIndex: number;
  explain: string;
}

export interface Quiz {
  version: 1;
  passFraction: number;
  questions: QuizQuestion[];
}

export type LessonKind = 'content' | 'exercise' | 'quiz' | 'drill';

export interface Lesson {
  id: string;
  title: string;
  kind: LessonKind;
  estimatedMinutes: number;
  completionRule: CompletionRule;
  blocks?: Block[];
  quiz?: Quiz;
  /** For kind 'exercise'. Slug of a seed exercise, or an inline one. */
  exerciseSlug?: string;
  /** A transposed variant emitted alongside the course (DATA_MODEL §11.9).
   *  Carries a type and difficulty because it becomes an `exercises` row. */
  inlineExercise?: {
    slug: string;
    title: string;
    bpm: number;
    typeId: 'scale' | 'interval' | 'warmup' | 'arpeggio';
    difficulty: number;
    sequence: NoteSequence;
  };
}

export interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  summary: string;
  instrumentId: string;
  level: number;
  /** False courses appear in the catalog but cannot be opened — the tranche
   *  mechanism from DATA_MODEL §11.1, not a placeholder. */
  isPublished: boolean;
  modules: Module[];
}

export const lessonsOf = (course: Course): Lesson[] =>
  course.modules.flatMap((m) => m.lessons);
