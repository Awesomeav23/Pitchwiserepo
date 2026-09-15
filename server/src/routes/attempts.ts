/** API_SPEC.md §8. The only write of consequence in the API. */
import { Router } from 'express';
import { pool, withTransaction } from '../db/pool.ts';
import { invalid, notFound, wrap } from '../lib/errors.ts';
import { decodeCursor, encodeCursor, parseLimit } from '../lib/pagination.ts';
import { summarise } from '../lib/scoring.ts';
import { parseAttempt, validateResults } from '../lib/validate.ts';
import type { TargetNote } from '../lib/validate.ts';
import { applyLessonEvidence } from './progress-rules.ts';
import type { AuthedRequest } from '../middleware/auth.ts';

export const attempts = Router();

interface AttemptRow {
  id: string; exercise_id: string; instrument_id: string; started_at: Date;
  duration_ms: number; overall_score: number; mean_abs_cents: number | null;
  notes_on_pitch: number; notes_attempted: number; notes_total: number;
  rhythm_scored: boolean; engine_version: string; input_source: string;
  note_results?: unknown; created_at: Date;
}

const toJson = (r: AttemptRow, withResults: boolean) => ({
  id: r.id,
  exerciseId: r.exercise_id,
  instrumentId: r.instrument_id,
  startedAt: r.started_at.toISOString(),
  durationMs: r.duration_ms,
  overallScore: r.overall_score,
  meanAbsCents: r.mean_abs_cents,
  notesOnPitch: r.notes_on_pitch,
  notesAttempted: r.notes_attempted,
  notesTotal: r.notes_total,
  rhythmScored: r.rhythm_scored,
  engineVersion: r.engine_version,
  inputSource: r.input_source,
  ...(withResults ? { noteResults: r.note_results } : {}),
  createdAt: r.created_at.toISOString(),
});

attempts.post('/attempts', wrap<AuthedRequest>(async (req, res) => {
  const body = parseAttempt(req.body);

  // Idempotent replay: the client generates the id before sending, so a retry
  // after a timeout returns the existing row rather than duplicating a take the
  // user physically performed once (§8).
  const existing = await pool.query<AttemptRow>(
    'SELECT * FROM attempts WHERE id = $1 AND user_id = $2', [body.id, req.user.id],
  );
  if (existing.rowCount && existing.rowCount > 0) {
    res.status(200).json(toJson(existing.rows[0], true));
    return;
  }

  const exercise = await pool.query<{ note_sequence: { notes: TargetNote[] } }>(
    'SELECT note_sequence FROM exercises WHERE id = $1', [body.exerciseId],
  );
  if (exercise.rowCount === 0) throw invalid('exerciseId does not exist');

  const instrument = await pool.query('SELECT 1 FROM instruments WHERE id = $1', [body.instrumentId]);
  if (instrument.rowCount === 0) throw invalid('instrumentId does not exist');

  const notes = exercise.rows[0].note_sequence.notes;
  validateResults(body.noteResults.results, notes, body.rhythmScored);

  // The client does not send scores. A client cannot be the authority on its own
  // score, and the denormalized columns are what every history list reads.
  const score = summarise(body.noteResults.results, notes.length);

  const result = await withTransaction(async (db) => {
    const { rows } = await db.query<AttemptRow>(
      `INSERT INTO attempts
         (id, user_id, exercise_id, instrument_id, started_at, duration_ms,
          overall_score, mean_abs_cents, notes_on_pitch, notes_attempted, notes_total,
          rhythm_scored, note_results, engine_version, input_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [body.id, req.user.id, body.exerciseId, body.instrumentId, body.startedAt,
       body.durationMs, score.overallScore, score.meanAbsCents, score.notesOnPitch,
       score.notesAttempted, score.notesTotal, body.rhythmScored,
       JSON.stringify(body.noteResults), body.engineVersion, body.inputSource],
    );

    const lessonProgress = body.lessonId
      ? await applyLessonEvidence(db, req.user.id, body.lessonId, {
          attemptId: body.id, attemptScore: score.overallScore, exerciseId: body.exerciseId,
        })
      : null;

    return { attempt: rows[0], lessonProgress };
  });

  res.status(201).json({
    ...toJson(result.attempt, true),
    ...(result.lessonProgress ? { lessonProgress: result.lessonProgress } : {}),
  });
}));

attempts.get('/attempts', wrap<AuthedRequest>(async (req, res) => {
  const limit = parseLimit(req.query.limit, 20, 100);
  const cursor = decodeCursor(req.query.cursor);

  // Always scoped to the authenticated user; there is no parameter to request
  // another user's attempts.
  const params: unknown[] = [req.user.id];
  const where = ['user_id = $1'];
  if (req.query.exerciseId) {
    params.push(req.query.exerciseId);
    where.push(`exercise_id = $${params.length}`);
  }
  if (cursor) {
    params.push(cursor.c, cursor.i);
    where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(limit + 1);

  // Summary only — no note_results. A history list shows score and date.
  const { rows } = await pool.query<AttemptRow>(
    `SELECT id, exercise_id, instrument_id, started_at, duration_ms, overall_score,
            mean_abs_cents, notes_on_pitch, notes_attempted, notes_total,
            rhythm_scored, engine_version, input_source, created_at
       FROM attempts WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  res.json({
    items: page.map((r) => toJson(r, false)),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  });
}));

attempts.get('/attempts/:id', wrap<AuthedRequest>(async (req, res) => {
  const { rows } = await pool.query<AttemptRow>(
    // 404 rather than 403 when it belongs to someone else: a 403 confirms the
    // row exists, which leaks the existence of other users' data (§4).
    'SELECT * FROM attempts WHERE id = $1 AND user_id = $2',
    [String(req.params.id), req.user.id],
  );
  if (rows.length === 0) throw notFound();
  res.json(toJson(rows[0], true));
}));

attempts.delete('/attempts/:id', wrap<AuthedRequest>(async (req, res) => {
  const result = await pool.query('DELETE FROM attempts WHERE id = $1 AND user_id = $2',
    [String(req.params.id), req.user.id]);
  if (result.rowCount === 0) throw notFound();
  res.status(204).end();
}));
