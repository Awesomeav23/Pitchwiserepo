/** API_SPEC.md §7. Read-only — the library is seeded (ADR-011). */
import { Router } from 'express';
import { pool } from '../db/pool.ts';
import { invalid, notFound, wrap } from '../lib/errors.ts';
import { decodeCursor, encodeCursor, parseLimit } from '../lib/pagination.ts';

export const exercises = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string; slug: string; title: string; description: string | null; type_id: string;
  difficulty: number; tempo_bpm: number; time_signature: string;
  lowest_midi: number; highest_midi: number; note_sequence: { notes: unknown[] };
  created_at: Date;
}

const summary = (r: Row) => {
  const notes = r.note_sequence.notes as Array<{ startMs: number; durationMs: number }>;
  const last = notes[notes.length - 1];
  return {
    id: r.id, slug: r.slug, title: r.title, description: r.description,
    typeId: r.type_id, difficulty: r.difficulty, tempoBpm: r.tempo_bpm,
    timeSignature: r.time_signature, lowestMidi: r.lowest_midi, highestMidi: r.highest_midi,
    // The list returns length, not every note — sequences are the largest field
    // in the table and a library view renders none of them.
    noteCount: notes.length,
    durationMs: last.startMs + last.durationMs,
  };
};

/** Hz → MIDI, rounded *inward* so an exercise is excluded unless it fits
 *  entirely. A partially playable exercise scores badly through no fault of the
 *  player, which reads as the tool being wrong. */
const hzToMidi = (hz: number) => 69 + 12 * Math.log2(hz / 440);

exercises.get('/exercises', wrap(async (req, res) => {
  const limit = parseLimit(req.query.limit, 50, 100);
  const cursor = decodeCursor(req.query.cursor);

  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => { params.push(value); where.push(clause.replace('?', `$${params.length}`)); };

  if (req.query.type) add('type_id = ?', req.query.type);
  if (req.query.difficulty) {
    const d = Number(req.query.difficulty);
    if (!Number.isInteger(d) || d < 1 || d > 5) throw invalid('difficulty must be 1–5');
    add('difficulty = ?', d);
  }
  if (req.query.fits) {
    const { rows } = await pool.query<{ f_min_hz: number; f_max_hz: number }>(
      'SELECT f_min_hz, f_max_hz FROM instruments WHERE id = $1', [req.query.fits],
    );
    if (rows.length === 0) throw invalid('fits must be a known instrument id');
    add('lowest_midi >= ?', Math.ceil(hzToMidi(rows[0].f_min_hz)));
    add('highest_midi <= ?', Math.floor(hzToMidi(rows[0].f_max_hz)));
  }
  if (cursor) {
    params.push(cursor.c, cursor.i);
    where.push(`(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }

  params.push(limit + 1);
  const { rows } = await pool.query<Row>(
    `SELECT * FROM exercises
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  res.json({
    items: page.map(summary),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  });
}));

exercises.get('/exercises/:idOrSlug', wrap(async (req, res) => {
  const key = String(req.params.idOrSlug);
  const { rows } = await pool.query<Row>(
    // Accepts either, since slug is UNIQUE and slugs are what appear in URLs.
    `SELECT * FROM exercises WHERE ${UUID.test(key) ? 'id = $1' : 'slug = $1'}`, [key],
  );
  if (rows.length === 0) throw notFound();
  res.json({ ...summary(rows[0]), noteSequence: rows[0].note_sequence });
}));
