/** API_SPEC.md §15 — courses, lessons and progress. */
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.ts';
import { ApiError, invalid, notFound, wrap } from '../lib/errors.ts';
import { applyLessonEvidence } from './progress-rules.ts';
import type { CompletionRule } from './progress-rules.ts';
import type { AuthedRequest } from '../middleware/auth.ts';

export const learning = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface QuizQuestion {
  id: string; prompt: string; choices: string[];
  answerIndex: number; explain: string;
  score?: { spec: string; bpm: number; clef?: string };
}

/**
 * Questions reach the client without `answerIndex` or `explain` — §15.4.
 * Shipping the key alongside the question would make the quiz decorative.
 * This is the one place a response is a deliberate subset of stored JSONB.
 */
const stripAnswers = (quiz: { passFraction: number; questions: QuizQuestion[] }) => ({
  version: 1,
  passFraction: quiz.passFraction,
  questions: quiz.questions.map(({ answerIndex: _a, explain: _e, ...rest }) => rest),
});

// ---- §15.1 catalog ------------------------------------------------------

learning.get('/courses', wrap<AuthedRequest>(async (req, res) => {
  const params: unknown[] = [req.user.id];
  const where = ['c.is_published'];
  if (req.query.instrument) {
    params.push(req.query.instrument);
    where.push(`c.instrument_id = $${params.length}`);
  }
  if (req.query.mine === 'true') {
    where.push('c.instrument_id IN (SELECT instrument_id FROM user_instruments WHERE user_id = $1)');
  }

  // lessonCount and estimatedMinutes are aggregated per request rather than
  // denormalized. Twelve courses of nine lessons is not a query worth a summary
  // column; revisit past a few hundred lessons, not before.
  const { rows } = await pool.query(`
    SELECT c.id, c.slug, c.title, c.summary, c.instrument_id, c.level,
           count(l.id)::int                                    AS lesson_count,
           COALESCE(sum(l.estimated_minutes), 0)::int          AS estimated_minutes,
           count(p.lesson_id) FILTER (WHERE p.state = 'complete')::int AS completed
      FROM courses c
      JOIN modules m ON m.course_id = c.id
      JOIN lessons l ON l.module_id = m.id
      LEFT JOIN user_lesson_progress p ON p.lesson_id = l.id AND p.user_id = $1
     WHERE ${where.join(' AND ')}
     GROUP BY c.id
     ORDER BY c.sort_order`, params);

  res.json({
    items: rows.map((r) => ({
      id: r.id, slug: r.slug, title: r.title, summary: r.summary,
      instrumentId: r.instrument_id, level: r.level,
      lessonCount: r.lesson_count, estimatedMinutes: r.estimated_minutes,
      progress: r.completed > 0
        ? { completedLessons: r.completed, state: r.completed >= r.lesson_count ? 'complete' : 'in_progress' }
        : null,
    })),
    nextCursor: null,
  });
}));

// ---- §15.2 course detail ------------------------------------------------

learning.get('/courses/:idOrSlug', wrap<AuthedRequest>(async (req, res) => {
  const key = String(req.params.idOrSlug);
  const course = await pool.query(
    `SELECT id, slug, title, summary, instrument_id, level FROM courses
      WHERE is_published AND ${UUID.test(key) ? 'id = $1' : 'slug = $1'}`, [key],
  );
  if (course.rowCount === 0) throw notFound();
  const c = course.rows[0];

  const { rows } = await pool.query(`
    SELECT m.id AS module_id, m.title AS module_title, m.sort_order AS module_order,
           l.id, l.slug, l.title, l.kind, l.sort_order, l.exercise_id,
           l.completion_rule, l.estimated_minutes,
           p.state, p.completed_at
      FROM modules m
      JOIN lessons l ON l.module_id = m.id
      LEFT JOIN user_lesson_progress p ON p.lesson_id = l.id AND p.user_id = $2
     WHERE m.course_id = $1
     ORDER BY m.sort_order, l.sort_order`, [c.id, req.user.id]);

  // locked is computed, not stored: a lesson is locked when any earlier lesson
  // in the course is incomplete. nextLessonId is the first incomplete one,
  // derived the same way — which is why enrollment stores no pointer.
  let blocked = false;
  let nextLessonId: string | null = null;
  const lessons = rows.map((r) => {
    const locked = blocked;
    if (r.state !== 'complete') {
      if (!nextLessonId && !locked) nextLessonId = r.id;
      blocked = true;
    }
    return { row: r, locked };
  });

  const modules: Array<{ id: string; title: string; lessons: unknown[] }> = [];
  for (const { row: r, locked } of lessons) {
    let module = modules.find((m) => m.id === r.module_id);
    if (!module) { module = { id: r.module_id, title: r.module_title, lessons: [] }; modules.push(module); }
    module.lessons.push({
      id: r.id, slug: r.slug, title: r.title, kind: r.kind,
      exerciseId: r.exercise_id, completionRule: r.completion_rule,
      estimatedMinutes: r.estimated_minutes, locked,
      progress: r.state ? { state: r.state, completedAt: r.completed_at?.toISOString() ?? null } : null,
    });
  }

  const enrolled = await pool.query(
    'SELECT 1 FROM user_course_enrollment WHERE user_id = $1 AND course_id = $2',
    [req.user.id, c.id],
  );

  // Lesson bodies are omitted — blocks and quiz questions are the largest
  // fields and the outline screen renders none of them.
  res.json({
    id: c.id, slug: c.slug, title: c.title, summary: c.summary,
    instrumentId: c.instrument_id, level: c.level,
    enrolled: (enrolled.rowCount ?? 0) > 0,
    nextLessonId,
    modules,
  });
}));

// ---- §15.3 one lesson ---------------------------------------------------

learning.get('/lessons/:idOrSlug', wrap<AuthedRequest>(async (req, res) => {
  const key = String(req.params.idOrSlug);
  const { rows } = await pool.query(`
    SELECT l.*, m.course_id FROM lessons l
      JOIN modules m ON m.id = l.module_id
     WHERE ${UUID.test(key) ? 'l.id = $1' : 'l.slug = $1'}`, [key]);
  if (rows.length === 0) throw notFound();
  const l = rows[0];

  const earlier = await pool.query<{ n: number }>(`
    SELECT count(*)::int n FROM lessons l2
      JOIN modules m2 ON m2.id = l2.module_id
      LEFT JOIN user_lesson_progress p ON p.lesson_id = l2.id AND p.user_id = $2
     WHERE m2.course_id = $1
       AND (m2.sort_order, l2.sort_order) < (
             SELECT m3.sort_order, l3.sort_order FROM lessons l3
               JOIN modules m3 ON m3.id = l3.module_id WHERE l3.id = $3)
       AND COALESCE(p.state, 'not_started') <> 'complete'`,
    [l.course_id, req.user.id, l.id]);
  if (earlier.rows[0].n > 0) {
    throw new ApiError('forbidden', 'lesson_locked: an earlier lesson in this course is incomplete');
  }

  let exercise = null;
  if (l.exercise_id) {
    // Embedded so the practice screen needs no second request.
    const e = await pool.query('SELECT * FROM exercises WHERE id = $1', [l.exercise_id]);
    const row = e.rows[0];
    exercise = {
      id: row.id, slug: row.slug, title: row.title, description: row.description,
      typeId: row.type_id, difficulty: row.difficulty, tempoBpm: row.tempo_bpm,
      timeSignature: row.time_signature, lowestMidi: row.lowest_midi,
      highestMidi: row.highest_midi, noteSequence: row.note_sequence,
    };
  }

  const progress = await pool.query(
    `SELECT state, completed_at, quiz_fraction FROM user_lesson_progress
      WHERE user_id = $1 AND lesson_id = $2`, [req.user.id, l.id]);

  res.json({
    id: l.id, slug: l.slug, title: l.title, kind: l.kind,
    estimatedMinutes: l.estimated_minutes, completionRule: l.completion_rule,
    blocks: l.body, quiz: l.quiz ? stripAnswers(l.quiz) : null, exercise,
    progress: progress.rows[0]
      ? {
          state: progress.rows[0].state,
          completedAt: progress.rows[0].completed_at?.toISOString() ?? null,
          quizFraction: progress.rows[0].quiz_fraction,
        }
      : null,
  });
}));

// ---- §15.5 quiz submission ----------------------------------------------

learning.post('/lessons/:id/quiz', wrap<AuthedRequest>(async (req, res) => {
  const lessonId = String(req.params.id);
  const { rows } = await pool.query('SELECT id, quiz FROM lessons WHERE id = $1', [lessonId]);
  if (rows.length === 0 || !rows[0].quiz) throw notFound();
  const quiz = rows[0].quiz as { passFraction: number; questions: QuizQuestion[] };

  const answers = (req.body as { answers?: Array<{ questionId: string; choiceIndex: number }> })?.answers;
  if (!Array.isArray(answers)) throw invalid('answers must be an array');

  const chosen = new Map(answers.map((a) => [a.questionId, a.choiceIndex]));
  // Unanswered questions are graded incorrect rather than rejected: a partial
  // submission is a failed attempt, not a validation error.
  const results = quiz.questions.map((q) => ({
    questionId: q.id,
    correct: chosen.get(q.id) === q.answerIndex,
    answerIndex: q.answerIndex,
    explain: q.explain,
  }));
  const fraction = results.filter((r) => r.correct).length / quiz.questions.length;

  const progress = await withTransaction((db) =>
    applyLessonEvidence(db, req.user.id, lessonId, { quizFraction: fraction }));

  res.json({
    fraction: Math.round(fraction * 1000) / 1000,
    passed: fraction >= quiz.passFraction,
    results,
    progress,
  });
}));

// ---- §15.6 self-reported completion -------------------------------------

learning.post('/lessons/:id/complete', wrap<AuthedRequest>(async (req, res) => {
  const lessonId = String(req.params.id);
  const { rows } = await pool.query<{ completion_rule: CompletionRule }>(
    'SELECT completion_rule FROM lessons WHERE id = $1', [lessonId]);
  if (rows.length === 0) throw notFound();
  const rule = rows[0].completion_rule;

  // The narrow, deliberate exception to server-evaluated progress: there is no
  // signal for "the user read this" other than the user saying so.
  if (rule.kind !== 'read' && rule.kind !== 'self_report') {
    throw new ApiError('unprocessable',
      'completion_not_self_reportable: this lesson completes from an attempt or a quiz');
  }

  const progress = await withTransaction((db) =>
    applyLessonEvidence(db, req.user.id, lessonId, { opened: true, selfReported: true }));
  res.json(progress);   // Idempotent — an already-complete lesson returns unchanged.
}));

// ---- §15.7 enrolment ----------------------------------------------------

learning.post('/courses/:id/enroll', wrap<AuthedRequest>(async (req, res) => {
  const courseId = String(req.params.id);
  const exists = await pool.query('SELECT 1 FROM courses WHERE id = $1 AND is_published', [courseId]);
  if (exists.rowCount === 0) throw notFound();

  // Idempotent — re-enrolling returns the existing row and does not reset
  // progress. There is no unenrol in v1.
  const { rows } = await pool.query(
    `INSERT INTO user_course_enrollment (user_id, course_id) VALUES ($1,$2)
     ON CONFLICT (user_id, course_id) DO UPDATE SET last_active_at = now()
     RETURNING started_at, last_active_at`,
    [req.user.id, courseId]);

  res.json({
    courseId,
    startedAt: rows[0].started_at.toISOString(),
    lastActiveAt: rows[0].last_active_at.toISOString(),
  });
}));
