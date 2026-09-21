/**
 * Exercise detail — US-02: "see each one's notes before attempting it".
 *
 * The notation is the screen, not an illustration on it. Being able to read and
 * hear an exercise before committing to a take is the difference between
 * practising and guessing.
 */
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { useMe } from '../api/useMe';
import { midiToHz, noteName } from '../audio/pitch';
import { Loading, Failed } from '../components/Async';
import { Score } from '../notation/Score';
import { navigate } from '../lib/route';

export function ExerciseDetail({ slug }: { slug: string }) {
  const { primaryInstrumentId } = useMe();
  const exercise = useApi(() => api.exercise(slug), [slug]);
  const instruments = useApi(() => api.instruments(), []);
  const attempts = useApi(() => api.attempts({ limit: 5 }), []);

  if (exercise.loading || instruments.loading) return <Loading what="the exercise" />;
  if (exercise.error || !exercise.data) {
    return <Failed message={exercise.error ?? 'Not found'} onRetry={exercise.reload} />;
  }

  const e = exercise.data;
  const profile = instruments.data?.find((i) => i.id === primaryInstrumentId);

  // Engraved at written pitch: a clarinettist reads a tone above what sounds.
  // Display only, never applied to a detected frequency (ADR-010).
  const notationShift = profile?.transpositionSemitones ?? 0;
  const written = notationShift === 0
    ? e.noteSequence
    : { version: 1 as const, notes: e.noteSequence.notes.map((n) => ({ ...n, midi: n.midi + notationShift })) };

  const outOfRange = profile
    && (midiToHz(e.lowestMidi) < profile.fMinHz || midiToHz(e.highestMidi) > profile.fMaxHz);

  const mine = (attempts.data?.items ?? []).filter((a) => a.exerciseId === e.id);

  return (
    <div className="tuner">
      <header>
        <button className="back" onClick={() => navigate({ name: 'exercises' })}>← Exercises</button>
        <h1>{e.title}</h1>
      </header>

      <p className="lede">{e.description}</p>

      <p className="stat">
        {noteName(e.lowestMidi)}–{noteName(e.highestMidi)} · {e.tempoBpm} bpm ·{' '}
        {e.timeSignature} · level {e.difficulty} · {e.noteSequence.notes.length} notes
      </p>

      <Score
        sequence={written}
        bpm={e.tempoBpm}
        timeSignature={e.timeSignature}
        instrument={primaryInstrumentId ?? undefined}
        caption={notationShift === 0
          ? 'Press ▶ to hear it'
          : `Written for ${profile?.displayName} — sounds a ${Math.abs(notationShift)} semitone${Math.abs(notationShift) === 1 ? '' : 's'} ${notationShift > 0 ? 'lower' : 'higher'} than it reads`}
      />

      {outOfRange && (
        <p className="alert warn">
          This exercise spans {noteName(e.lowestMidi)}–{noteName(e.highestMidi)}, outside{' '}
          {profile?.displayName}’s range. The library is written for a middle voice;
          per-instrument variants live inside the courses.
        </p>
      )}

      <div className="detail-actions">
        {/* Handed off through the URL rather than through state, so a practice
            session on a specific exercise is a link someone can return to. */}
        <button className="primary" onClick={() => navigate({ name: 'practice', slug: e.slug })}>
          Practise this
        </button>
      </div>

      {mine.length > 0 && (
        <>
          <h2 className="section-head">Your recent takes</h2>
          <ol className="attempt-list">
            {mine.map((a) => (
              <li key={a.id}>
                <button className="attempt-row" onClick={() => navigate({ name: 'attempt', id: a.id })}>
                  <span className="attempt-score" style={{ color: a.overallScore >= 80 ? '#3ddc84' : a.overallScore >= 50 ? '#f2c14e' : '#ff5d6c' }}>
                    {a.overallScore}
                  </span>
                  <span className="attempt-main">
                    <span className="attempt-sub">
                      {a.notesOnPitch} of {a.notesTotal} on pitch
                      {a.meanAbsCents != null && <> · {a.meanAbsCents.toFixed(1)}¢ average</>}
                    </span>
                  </span>
                  <span className="attempt-when">{new Date(a.createdAt).toLocaleDateString()}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

