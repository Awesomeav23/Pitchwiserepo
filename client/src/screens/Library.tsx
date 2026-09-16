/**
 * Exercise library — US-02, the browsing half.
 *
 * Shows the authored exercises, not the transposed variants each course
 * generates. Both are exercises; only these are content someone would choose
 * between (DATA_MODEL §11.9, and the `in_library` column added for it).
 */
import { useState } from 'react';
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useMe } from '../api/useMe';
import { noteName } from '../audio/pitch';
import type { ApiExercise } from '../api/types';
import { Loading, Failed } from '../components/Async';
import { navigate } from '../lib/route';

const TYPES = [
  { id: '', label: 'All types' },
  { id: 'scale', label: 'Scales' },
  { id: 'interval', label: 'Interval drills' },
  { id: 'warmup', label: 'Warm-ups' },
  { id: 'arpeggio', label: 'Arpeggios' },
];

export function Library() {
  const { primaryInstrumentId } = useMe();
  const [type, setType] = useState('');
  const [fits, setFits] = useState(false);

  const exercises = useApi(
    () => api.exercises({
      type: type || undefined,
      // The endpoint rounds inward, so an exercise is excluded unless it fits
      // entirely — a partly playable one scores badly through no fault of the
      // player, which reads as the tool being wrong.
      fits: fits && primaryInstrumentId ? primaryInstrumentId : undefined,
    }),
    [type, fits, primaryInstrumentId],
  );

  if (exercises.loading) return <Loading what="the exercise library" />;
  if (exercises.error) return <Failed message={exercises.error} onRetry={exercises.reload} />;

  const items = exercises.data ?? [];

  return (
    <div className="tuner">
      <header><h1>Pitchwise <small>exercises</small></h1></header>

      <p className="lede">
        Exercises you can practise on their own, outside any course. Each one is scored the
        same way a lesson's is, and every take is kept in your history.
      </p>

      <section className="controls">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>

        {primaryInstrumentId && (
          <label className="checkbox">
            <input type="checkbox" checked={fits} onChange={(e) => setFits(e.target.checked)} />
            Only what fits my range
          </label>
        )}
      </section>

      {items.length === 0 ? (
        <div className="empty">
          <p>Nothing matches those filters.</p>
          <p className="stat">
            {fits
              ? 'The library is written for a middle voice, so some exercises fall outside a transposing instrument’s range. Per-instrument variants exist inside the courses.'
              : 'Try a different type.'}
          </p>
          <button className="link" onClick={() => { setType(''); setFits(false); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="cards">
          {items.map((e) => <ExerciseCard key={e.id} exercise={e} />)}
        </div>
      )}
    </div>
  );
}

function ExerciseCard({ exercise }: { exercise: ApiExercise }) {
  const seconds = exercise.durationMs ? Math.round(exercise.durationMs / 1000) : null;
  return (
    <button className="card" onClick={() => navigate({ name: 'exercise', slug: exercise.slug })}>
      <div className="card-title">{exercise.title}</div>
      <div className="card-summary">{exercise.description}</div>
      <div className="card-meta">
        {noteName(exercise.lowestMidi)}–{noteName(exercise.highestMidi)}
        {' · '}{exercise.tempoBpm} bpm
        {' · '}level {exercise.difficulty}
        {exercise.noteCount != null && <>{' · '}{exercise.noteCount} notes</>}
        {seconds != null && <>{' · '}{seconds}s</>}
      </div>
    </button>
  );
}
