/**
 * Seeds the reference data: instruments, exercise types, exercises, and the
 * twelve courses with their modules and lessons.
 *
 * Content is imported from the client rather than restated here. The exercise
 * parser (ADR-011) and the course generator (DATA_MODEL §11.9) are the single
 * source for both, and a second copy in the server would drift on the first
 * correction nobody propagated.
 *
 * That import crosses a package boundary, which is a wart: the server should not
 * reach into the client's source tree. The fix is a shared workspace holding the
 * content modules, which both sides import. Deferred rather than done, because
 * moving them now would touch every client import in the same commit that
 * introduces the server.
 *
 * Idempotent — every insert is an upsert on a natural key, so re-running after a
 * content change updates in place rather than duplicating.
 */
import { INSTRUMENT_PROFILES } from '../../../client/src/audio/profiles.ts';
import { EXERCISES } from '../../../client/src/exercises/seed.ts';
import { COURSES } from '../../../client/src/learning/seed.ts';
import { lessonsOf } from '../../../client/src/learning/types.ts';
import type { Lesson } from '../../../client/src/learning/types.ts';
import type { NoteSequence } from '../../../client/src/exercises/types.ts';
import { pool, withTransaction } from './pool.ts';

const EXERCISE_TYPES: Array<[string, string, string]> = [
  ['scale', 'Scale', 'Stepwise movement through a key.'],
  ['interval', 'Interval drill', 'Alternating steps and skips.'],
  ['warmup', 'Vocal warm-up', 'Gentle, usually descending.'],
  ['arpeggio', 'Arpeggio', 'The notes of a chord, one at a time.'],
];

const range = (seq: NoteSequence) => {
  const midis = seq.notes.map((n) => n.midi);
  return { lowest: Math.min(...midis), highest: Math.max(...midis) };
};

await withTransaction(async (db) => {
  // ---- instruments (AUDIO_PIPELINE §6) --------------------------------
  for (const [i, p] of INSTRUMENT_PROFILES.entries()) {
    await db.query(
      `INSERT INTO instruments
         (id, display_name, family, f_min_hz, f_max_hz,
          transposition_semitones, gate_threshold, is_measured, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         display_name = EXCLUDED.display_name, family = EXCLUDED.family,
         f_min_hz = EXCLUDED.f_min_hz, f_max_hz = EXCLUDED.f_max_hz,
         transposition_semitones = EXCLUDED.transposition_semitones,
         sort_order = EXCLUDED.sort_order`,
      [p.id, p.displayName, p.family, p.fMinHz, p.fMaxHz,
       p.transpositionSemitones, p.gateThreshold, p.isMeasured, i],
    );
  }
  // gate_threshold and is_measured are deliberately NOT overwritten on
  // conflict. Once an instrument has been measured on real hardware, re-running
  // the seed must not put the placeholder back (DATA_MODEL §3.2).

  for (const [id, name, description] of EXERCISE_TYPES) {
    await db.query(
      `INSERT INTO exercise_types (id, display_name, description) VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name,
                                      description = EXCLUDED.description`,
      [id, name, description],
    );
  }

  // ---- exercises: the five seeds, then each course's transposed variants ----
  const exerciseIdBySlug = new Map<string, string>();

  const upsertExercise = async (e: {
    slug: string; title: string; description: string; typeId: string;
    difficulty: number; tempoBpm: number; timeSignature: string; sequence: NoteSequence;
    inLibrary: boolean;
  }) => {
    const { lowest, highest } = range(e.sequence);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO exercises
         (slug, title, description, type_id, difficulty, tempo_bpm, time_signature,
          lowest_midi, highest_midi, note_sequence, in_library)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, description = EXCLUDED.description,
         type_id = EXCLUDED.type_id, difficulty = EXCLUDED.difficulty,
         tempo_bpm = EXCLUDED.tempo_bpm, lowest_midi = EXCLUDED.lowest_midi,
         highest_midi = EXCLUDED.highest_midi, note_sequence = EXCLUDED.note_sequence,
         in_library = EXCLUDED.in_library
       RETURNING id`,
      [e.slug, e.title, e.description, e.typeId, e.difficulty, e.tempoBpm,
       e.timeSignature, lowest, highest, JSON.stringify(e.sequence), e.inLibrary],
    );
    exerciseIdBySlug.set(e.slug, rows[0].id);
  };

  for (const e of EXERCISES) {
    await upsertExercise({
      slug: e.slug, title: e.title, description: e.description ?? '', typeId: e.typeId,
      difficulty: e.difficulty, tempoBpm: e.tempoBpm, timeSignature: e.timeSignature,
      sequence: e.noteSequence,
      inLibrary: true,   // the five authored exercises are the library
    });
  }

  for (const course of COURSES) {
    for (const lesson of lessonsOf(course)) {
      const inline = lesson.inlineExercise;
      if (!inline) continue;
      await upsertExercise({
        slug: inline.slug, title: inline.title,
        description: `Transposed for ${course.title.replace(' — starter course', '')}.`,
        typeId: inline.typeId, difficulty: inline.difficulty, tempoBpm: inline.bpm,
        timeSignature: '4/4', sequence: inline.sequence,
        inLibrary: false,   // a course's transposed variant, not browsable content
      });
    }
  }

  // ---- courses, modules, lessons --------------------------------------
  let lessonCount = 0;

  for (const [ci, course] of COURSES.entries()) {
    const { rows: [{ id: courseId }] } = await db.query<{ id: string }>(
      `INSERT INTO courses (slug, title, summary, instrument_id, level, is_published, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title, summary = EXCLUDED.summary, level = EXCLUDED.level,
         is_published = EXCLUDED.is_published, sort_order = EXCLUDED.sort_order
       RETURNING id`,
      [course.slug, course.title, course.summary, course.instrumentId,
       course.level, course.isPublished, ci],
    );

    // Replace the outline wholesale rather than diffing it. Lessons cascade from
    // modules, and progress rows cascade from lessons — so a reseed after a
    // content change would silently wipe a learner's progress in production.
    // Acceptable while there are no learners; called out here because it stops
    // being acceptable the moment there are.
    await db.query('DELETE FROM modules WHERE course_id = $1', [courseId]);

    for (const [mi, module] of course.modules.entries()) {
      const { rows: [{ id: moduleId }] } = await db.query<{ id: string }>(
        `INSERT INTO modules (course_id, title, sort_order) VALUES ($1,$2,$3) RETURNING id`,
        [courseId, module.title, mi],
      );

      for (const [li, lesson] of module.lessons.entries()) {
        await db.query(
          `INSERT INTO lessons
             (module_id, slug, title, kind, sort_order, body, quiz, exercise_id,
              completion_rule, estimated_minutes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [moduleId, `${course.slug}-${lesson.id}`, lesson.title, lesson.kind, li,
           lesson.blocks ? JSON.stringify(lesson.blocks) : null,
           lesson.quiz ? JSON.stringify(lesson.quiz) : null,
           exerciseIdFor(lesson, exerciseIdBySlug),
           JSON.stringify(lesson.completionRule), lesson.estimatedMinutes],
        );
        lessonCount++;
      }
    }
  }

  const counts = await db.query<{ t: string; n: number }>(`
    SELECT 'instruments' t, count(*) n FROM instruments
    UNION ALL SELECT 'exercise_types', count(*) FROM exercise_types
    UNION ALL SELECT 'exercises', count(*) FROM exercises
    UNION ALL SELECT 'courses', count(*) FROM courses
    UNION ALL SELECT 'modules', count(*) FROM modules
    UNION ALL SELECT 'lessons', count(*) FROM lessons
  `);
  for (const row of counts.rows) console.log(`  ${row.t.padEnd(15)} ${row.n}`);
  console.log(`\nSeeded ${COURSES.length} courses, ${lessonCount} lessons.`);
});

function exerciseIdFor(lesson: Lesson, ids: Map<string, string>): string | null {
  const slug = lesson.inlineExercise?.slug ?? lesson.exerciseSlug;
  if (!slug) return null;
  const id = ids.get(slug);
  if (!id) throw new Error(`Lesson "${lesson.title}" references unknown exercise "${slug}"`);
  return id;
}

await pool.end();
