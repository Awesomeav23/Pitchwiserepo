/**
 * The one place lesson completion is decided — LEARNING_PLATFORM.md §7 and
 * DATA_MODEL.md §11.6.
 *
 * Server-side, always. The client posts an attempt or a quiz submission; it
 * never posts a completion. A client able to declare its own completion makes
 * the whole progress model advisory.
 */
import type { PoolClient } from 'pg';
import { ApiError, notFound } from '../lib/errors.ts';

export type CompletionRule =
  | { kind: 'read' }
  | { kind: 'self_report' }
  | { kind: 'attempt_any' }
  | { kind: 'attempt_score'; minScore: number }
  | { kind: 'quiz_pass'; minFraction: number };

export interface Evidence {
  opened?: boolean;
  selfReported?: boolean;
  attemptId?: string;
  attemptScore?: number;
  /** Present when the evidence is an attempt — checked against the lesson. */
  exerciseId?: string;
  quizFraction?: number;
}

export interface LessonProgress {
  state: 'in_progress' | 'complete';
  completedAt: string | null;
  bestAttemptId: string | null;
  quizFraction: number | null;
}

interface LessonRow {
  id: string;
  completion_rule: CompletionRule;
  exercise_id: string | null;
}

export async function applyLessonEvidence(
  db: PoolClient,
  userId: string,
  lessonId: string,
  evidence: Evidence,
): Promise<LessonProgress> {
  const lesson = await db.query<LessonRow>(
    'SELECT id, completion_rule, exercise_id FROM lessons WHERE id = $1', [lessonId],
  );
  if (lesson.rowCount === 0) throw notFound();
  const { completion_rule: rule, exercise_id: lessonExerciseId } = lesson.rows[0];

  // A mismatch means the client sent a take from a different exercise than the
  // lesson it claims. Rejected rather than silently ignored (API_SPEC §15.8).
  if (evidence.exerciseId && lessonExerciseId && evidence.exerciseId !== lessonExerciseId) {
    throw new ApiError('unprocessable', 'lesson_exercise_mismatch: this attempt is for a different exercise');
  }

  const current = await db.query<{
    state: 'in_progress' | 'complete'; completed_at: Date | null;
    best_attempt_id: string | null; quiz_fraction: number | null;
  }>(
    `SELECT state, completed_at, best_attempt_id, quiz_fraction
       FROM user_lesson_progress WHERE user_id = $1 AND lesson_id = $2`,
    [userId, lessonId],
  );
  const existing = current.rows[0];

  const wasComplete = existing?.state === 'complete';
  let bestAttemptId = existing?.best_attempt_id ?? null;
  let quizFraction = existing?.quiz_fraction ?? null;

  // Best-so-far, never last: a worse later attempt must not lower a record or
  // un-complete a lesson. Completion is sticky.
  let bestScore = -1;
  if (evidence.attemptScore !== undefined) {
    const prior = await db.query<{ best: number | null }>(
      `SELECT max(overall_score) best FROM attempts
        WHERE user_id = $1 AND exercise_id = $2`,
      [userId, lessonExerciseId ?? evidence.exerciseId],
    );
    // Runs inside the same transaction as the INSERT, so the attempt just
    // submitted is already included in the max.
    bestScore = prior.rows[0]?.best ?? evidence.attemptScore;
  }
  if (evidence.quizFraction !== undefined) {
    quizFraction = Math.max(quizFraction ?? 0, evidence.quizFraction);
  }

  let complete = wasComplete;
  if (!wasComplete) {
    switch (rule.kind) {
      case 'read':          complete = evidence.opened === true; break;
      case 'self_report':   complete = evidence.selfReported === true; break;
      case 'attempt_any':   complete = evidence.attemptScore !== undefined; break;
      case 'attempt_score': complete = bestScore >= rule.minScore; break;
      case 'quiz_pass':     complete = (quizFraction ?? -1) >= rule.minFraction; break;
    }
    // The attempt that satisfied the rule is the one recorded.
    if (complete && evidence.attemptId) bestAttemptId = evidence.attemptId;
  }

  const state = complete ? 'complete' : 'in_progress';
  const { rows } = await db.query<{
    state: 'in_progress' | 'complete'; completed_at: Date | null;
    best_attempt_id: string | null; quiz_fraction: number | null;
  }>(
    `INSERT INTO user_lesson_progress
       (user_id, lesson_id, state, best_attempt_id, quiz_fraction, completed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5, CASE WHEN $3 = 'complete' THEN now() ELSE NULL END, now())
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       state = CASE WHEN user_lesson_progress.state = 'complete' THEN 'complete' ELSE EXCLUDED.state END,
       best_attempt_id = COALESCE(EXCLUDED.best_attempt_id, user_lesson_progress.best_attempt_id),
       quiz_fraction = GREATEST(COALESCE(EXCLUDED.quiz_fraction, 0), COALESCE(user_lesson_progress.quiz_fraction, 0)),
       completed_at = COALESCE(user_lesson_progress.completed_at,
                               CASE WHEN EXCLUDED.state = 'complete' THEN now() ELSE NULL END),
       updated_at = now()
     RETURNING state, completed_at, best_attempt_id, quiz_fraction`,
    [userId, lessonId, state, bestAttemptId, quizFraction],
  );

  const r = rows[0];
  return {
    state: r.state,
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    bestAttemptId: r.best_attempt_id,
    quizFraction: r.quiz_fraction,
  };
}
