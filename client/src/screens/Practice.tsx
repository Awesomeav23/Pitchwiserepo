/**
 * Practice take — US-04 (count-in and metronome) and US-05 (live trace against
 * the target). The scorecard proper is US-06 and a separate screen; what this
 * shows when a take ends is a summary, not that screen.
 *
 * Rendering follows the tuner: frames land in a ref and a requestAnimationFrame
 * loop paints the canvas directly. React state holds only what changes at human
 * speed — the selected exercise, the phase, errors.
 *
 * Phase transitions are driven by the audio clock rather than by setTimeout. The
 * metronome is scheduled ahead on that clock, so a timer that drifts against it
 * would put the recording window and the clicks in different places.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MicrophoneError, PitchEngine } from '../audio/engine';
import { Metronome } from '../audio/metronome';
import type { ClickPlan } from '../audio/metronome';
import { assertContinuousPitch, onPitchFrames } from '../audio/note-source';
import { hzToMidi, midiToHz, noteName } from '../audio/pitch';
import { INSTRUMENT_PROFILES, profileById } from '../audio/profiles';
import { DEFAULT_CONFIG } from '../audio/types';
import type { AnalysedFrame, InstrumentProfile } from '../audio/types';
import type { ApiExercise } from '../api/types';
import { api } from '../api/client';
import { describeError, useApi } from '../api/useApi';
import type { Attempt } from '../api/types';
import { Loading, Failed } from '../components/Async';
import { MicTrouble } from '../components/MicTrouble';
import { useMe } from '../api/useMe';
import { durationOf } from '../exercises/types';
import type { Exercise } from '../exercises/types';
import { reduceToNoteResults } from '../practice/take';
import type { NoteResult } from '../practice/take';
import { scoreAttempt } from '../practice/scoring';
import type { AttemptSummary } from '../practice/scoring';

type Phase = 'idle' | 'arming' | 'countIn' | 'recording' | 'done';

const BAND_COLOR: Record<string, string> = {
  green: '#3ddc84', amber: '#f2c14e', red: '#ff5d6c', missed: '#55556a',
};
/** Semitones of headroom above and below the exercise, so notes are not on the edge. */
const PITCH_PADDING = 3;
/** Recording continues this long past the last note, to catch a late release. */
const TAIL_MS = 400;

interface TakeResult {
  results: NoteResult[];
  summary: AttemptSummary;
}

export interface PracticeProps {
  /** Supplied when a lesson hosts the take. The exercise picker is then hidden
   *  — a lesson teaches one exercise and letting the learner swap it mid-lesson
   *  would make the lesson's completion rule meaningless. */
  exercise?: Exercise;
  /** When present, the attempt is submitted against this lesson and the server
   *  decides whether it completes it. */
  lessonId?: string;
  /** Called with the summary each time a take completes, and with the stored
   *  attempt once the server has accepted it. */
  onResult?: (summary: AttemptSummary, attempt?: Attempt) => void;
  /** Drop the heading, for use inside a lesson that has its own. */
  embedded?: boolean;
}

/**
 * Standalone entry point. Resolves which exercise to practise — from the
 * library when nobody supplied one — and hands a settled exercise to the take
 * itself. The split exists because the take's hooks all depend on having an
 * exercise, and a hook cannot wait for a fetch.
 */
export function Practice(props: PracticeProps & { initialSlug?: string } = {}) {
  const [slug, setSlug] = useState<string | null>(props.initialSlug ?? null);

  // Only fetched in standalone mode; inside a lesson the exercise arrives with
  // the lesson, which is why that response embeds it.
  const library = useApi(
    () => (props.exercise ? Promise.resolve([]) : api.exercises()),
    [props.exercise],
  );

  if (props.exercise) return <PracticeTake {...props} exercise={props.exercise} library={[]} />;
  if (library.loading) return <Loading what="the exercise library" />;
  if (library.error || !library.data?.length) {
    return <Failed message={library.error ?? 'No exercises found.'} onRetry={library.reload} />;
  }

  const chosen = library.data.find((e) => e.slug === slug) ?? library.data[0];
  return (
    <PracticeTake
      {...props}
      exercise={fromApi(chosen)}
      library={library.data}
      onSelectSlug={setSlug}
    />
  );
}

const fromApi = (e: ApiExercise): Exercise => ({
  id: e.id, slug: e.slug, title: e.title, description: e.description ?? '',
  typeId: e.typeId as Exercise['typeId'], difficulty: e.difficulty, tempoBpm: e.tempoBpm,
  timeSignature: e.timeSignature, lowestMidi: e.lowestMidi, highestMidi: e.highestMidi,
  noteSequence: e.noteSequence,
});

function PracticeTake({
  exercise, lessonId, onResult, embedded, library, onSelectSlug,
}: PracticeProps & {
  exercise: Exercise;
  library: ApiExercise[];
  onSelectSlug?: (slug: string) => void;
}) {
  const { primaryInstrumentId } = useMe();
  // Defaults to what the user told onboarding they play, rather than to a voice
  // type they may not be.
  const [profileId, setProfileId] = useState(primaryInstrumentId ?? 'voice_tenor');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [micError, setMicError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TakeResult | null>(null);
  const [countLabel, setCountLabel] = useState('');

  const fixedExercise = lessonId !== undefined || library.length === 0 ? exercise : undefined;
  const profile = profileById(profileId);
  const durationMs = durationOf(exercise.noteSequence);

  const engineRef = useRef<PitchEngine | null>(null);
  const metronomeRef = useRef<Metronome | null>(null);
  const framesRef = useRef<AnalysedFrame[]>([]);
  const planRef = useRef<ClickPlan | null>(null);
  const takeZeroMsRef = useRef<number>(0);
  const phaseRef = useRef<Phase>('idle');
  const resultsRef = useRef<NoteResult[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  if (engineRef.current === null) engineRef.current = new PitchEngine(profile);
  const engine = engineRef.current;

  useEffect(() => {
    assertContinuousPitch(engine);
    const unsubscribe = onPitchFrames(engine, (f) => framesRef.current.push(f));
    return () => {
      unsubscribe();
      metronomeRef.current?.dispose();
      metronomeRef.current = null;
      void engine.stop();
    };
  }, [engine]);

  useEffect(() => { engine.setProfile(profile); }, [engine, profile]);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const finish = useCallback(() => {
    const hopMs = (DEFAULT_CONFIG.hopSize / (engine.sampleRate ?? 48000)) * 1000;
    const { results } = reduceToNoteResults(framesRef.current, exercise.noteSequence, {
      takeZeroMs: takeZeroMsRef.current,
      hopMs,
    });
    const summary = scoreAttempt(results);
    resultsRef.current = results;
    setResult({ results, summary });
    setPhaseBoth('done');
    metronomeRef.current?.stop();
    void engine.stop();

    // The client computes a summary to render immediately, but the server
    // recomputes it from noteResults and its answer is the one that is stored
    // (API_SPEC §8). The id is generated here so a retry after a timeout cannot
    // duplicate a take the user performed once.
    if (!exercise.id) { onResult?.(summary); return; }
    setSaving(true);
    setSaveError(null);
    api.postAttempt({
      id: crypto.randomUUID(),
      exerciseId: exercise.id,
      instrumentId: profileId,
      startedAt: new Date(Date.now() - durationMs).toISOString(),
      durationMs: Math.round(durationMs),
      engineVersion: engine.version,
      inputSource: engine.inputSource,
      rhythmScored: false,
      ...(lessonId ? { lessonId } : {}),
      noteResults: { version: 1, results },
    })
      .then((attempt) => { setSavedId(attempt.id); onResult?.(summary, attempt); })
      .catch((err: unknown) => { setSaveError(describeError(err)); onResult?.(summary); })
      .finally(() => setSaving(false));
  }, [engine, exercise, setPhaseBoth, onResult, profileId, durationMs, lessonId]);

  const abort = useCallback(() => {
    metronomeRef.current?.stop();
    void engine.stop();
    planRef.current = null;
    setCountLabel('');
    setPhaseBoth('idle');
  }, [engine, setPhaseBoth]);

  const begin = useCallback(async () => {
    setError(null);
    setMicError(null);
    setResult(null);
    resultsRef.current = null;
    framesRef.current = [];
    setSavedId(null);
    setPhaseBoth('arming');

    try {
      engine.setInput('mic');
      await engine.start();

      const ctx = engine.context;
      if (!ctx) throw new Error('The audio context did not open.');

      // The capture clock and the context clock share an origin but not a zero:
      // frame.timestamp counts from capture start, ctx.currentTime from context
      // creation. One frame gives the offset between them, which is what lets a
      // click scheduled in context time be compared against a frame timestamp.
      const first = await waitForFrame(framesRef, 2000);
      const captureOriginSec = first.captureTime - first.timestamp / 1000;

      const metronome = metronomeRef.current ?? new Metronome(ctx);
      metronomeRef.current = metronome;
      const plan = metronome.schedule({
        bpm: exercise.tempoBpm,
        beatsPerBar: beatsPerBar(exercise.timeSignature),
        takeDurationMs: durationMs,
      });
      planRef.current = plan;
      takeZeroMsRef.current = (plan.takeZeroTime - captureOriginSec) * 1000;

      setPhaseBoth('countIn');
    } catch (err) {
      // A microphone failure gets the dedicated panel; anything else is a line
      // of text, because only the microphone has actions worth spelling out.
      if (err instanceof MicrophoneError) setMicError(err);
      else setError(String(err));
      void engine.stop();
      setPhaseBoth('idle');
    }
  }, [engine, exercise, durationMs, setPhaseBoth]);

  // ---- clock + draw loop ------------------------------------------------
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ctx = engine.context;
      const plan = planRef.current;
      const current = phaseRef.current;

      let takeMs: number | null = null;

      if (ctx && plan && (current === 'countIn' || current === 'recording')) {
        const now = ctx.currentTime;
        takeMs = (now - plan.takeZeroTime) * 1000;

        if (current === 'countIn') {
          if (takeMs >= 0) {
            setPhaseBoth('recording');
            setCountLabel('');
          } else {
            const remaining = Math.ceil(-takeMs / 1000 / plan.beatSec);
            setCountLabel(String(Math.min(plan.countInBeats, Math.max(1, remaining))));
          }
        } else if (takeMs > durationMs + TAIL_MS) {
          finish();
          takeMs = durationMs;
        }
      }

      paint(canvasRef.current, {
        exercise,
        frames: framesRef.current,
        takeZeroMs: takeZeroMsRef.current,
        takeMs,
        durationMs,
        results: resultsRef.current,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, exercise, durationMs, finish, setPhaseBoth]);

  const busy = phase === 'arming' || phase === 'countIn' || phase === 'recording';
  const outOfRange = exerciseOutOfRange(exercise, profile);

  return (
    <div className={embedded ? 'practice embedded' : 'tuner practice'}>
      {!embedded && (
        <header>
          <h1>Pitchwise <small>practice</small></h1>
            <span className={`pill ${busy ? 'ok' : ''}`}>{saving ? 'saving…' : phaseLabel(phase)}</span>
        </header>
      )}

      <section className="controls">
        {!fixedExercise && onSelectSlug && (
          <label>
            Exercise
            <select value={exercise.slug} onChange={(e) => onSelectSlug(e.target.value)} disabled={busy}>
              {library.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.title} · {e.tempoBpm} bpm · level {e.difficulty}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Instrument
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={busy}>
            {INSTRUMENT_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>{p.displayName} ({p.nominalRange})</option>
            ))}
          </select>
        </label>

        {busy
          ? <button className="primary" onClick={abort}>Stop</button>
          : <button className="primary" onClick={() => void begin()}>
              {phase === 'done' ? 'Again' : 'Start take'}
            </button>}
        {embedded && <span className="stat inline">{saving ? 'saving…' : phaseLabel(phase)}</span>}
      </section>

      {!embedded && <p className="stat">{exercise.description}</p>}

      {micError != null && <MicTrouble error={micError} onRetry={() => void begin()} />}
      {error && <p className="alert error">{error}</p>}
      {saveError && (
        <p className="alert warn">
          Scored, but not saved: {saveError} This take will not appear in your history.
        </p>
      )}

      {!profile.isMeasured && (
        <p className="alert warn">
          <strong>{profile.displayName}</strong>’s amplitude gate is a placeholder, not a
          measured value. Notes may read as missed because the gate cut them, not because
          you did not sing them.
        </p>
      )}

      {outOfRange && (
        <p className="alert warn">
          This exercise spans {noteName(exercise.lowestMidi)}–{noteName(exercise.highestMidi)},
          which falls outside {profile.displayName}’s range. Transposed variants are not built
          yet, so notes outside the range will be clamped away and score as missed.
        </p>
      )}

      <div className="stage">
        <canvas ref={canvasRef} className="roll" />
        {phase === 'countIn' && <div className="countin">{countLabel}</div>}
      </div>

      {result && <Summary result={result} exercise={exercise} />}

      {savedId && (
        <p className="alert ok-alert">
          Saved. <a className="link" href={`#/attempt/${savedId}`}>See the full scorecard</a>
        </p>
      )}

      {phase === 'done' && (
        <p className="alert warn">
          Timing is not scored. Rhythm scoring is position 2 on the cut list, so
          <code> msOff </code> is null on every note and this take is pitch only.
        </p>
      )}
    </div>
  );
}

function Summary({ result, exercise }: { result: TakeResult; exercise: Exercise }) {
  const { summary, results } = result;
  return (
    <section className="summary">
      <div className="score">
        <strong>{summary.overallScore}</strong><span>/ 100</span>
      </div>
      <div className="score-detail">
        <div>{summary.notesOnPitch} of {summary.notesTotal} notes within 10 cents</div>
        <div>
          {summary.notesAttempted} attempted
          {summary.meanAbsCents != null &&
            <> · mean {summary.meanAbsCents.toFixed(1)}¢ off</>}
        </div>
      </div>
      <table className="notes">
        <thead>
          <tr><th>#</th><th>Target</th><th>Cents</th><th>Coverage</th></tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.index}>
              <td>{r.index + 1}</td>
              <td>{noteName(exercise.noteSequence.notes[r.index].midi)}</td>
              <td style={{ color: BAND_COLOR[r.band] }}>
                {r.centsOff == null
                  ? 'missed'
                  : `${r.centsOff >= 0 ? '+' : ''}${r.centsOff.toFixed(1)}`}
              </td>
              <td>{Math.round(r.coverage * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---- helpers -----------------------------------------------------------

function phaseLabel(p: Phase): string {
  return { idle: 'ready', arming: 'opening microphone', countIn: 'count-in', recording: 'recording', done: 'take complete' }[p];
}

function beatsPerBar(timeSignature: string): number {
  const n = Number(timeSignature.split('/')[0]);
  return Number.isFinite(n) && n > 0 ? n : 4;
}

function exerciseOutOfRange(exercise: Exercise, profile: InstrumentProfile): boolean {
  return midiToHz(exercise.lowestMidi) < profile.fMinHz
      || midiToHz(exercise.highestMidi) > profile.fMaxHz;
}

/** Resolve on the first frame after start, so the capture clock has an origin. */
function waitForFrame(
  framesRef: React.RefObject<AnalysedFrame[]>,
  timeoutMs: number,
): Promise<AnalysedFrame> {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + timeoutMs;
    const poll = () => {
      const f = framesRef.current[0];
      if (f) { resolve(f); return; }
      if (performance.now() > deadline) {
        reject(new Error('No audio frames arrived. Is the microphone producing signal?'));
        return;
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}

interface PaintArgs {
  exercise: Exercise;
  frames: AnalysedFrame[];
  takeZeroMs: number;
  /** Take-relative ms, or null when no take is running. */
  takeMs: number | null;
  durationMs: number;
  results: NoteResult[] | null;
}

/** Piano roll: the whole take is on screen at once with a moving playhead.
 *  An exercise is under ten seconds, so scrolling would hide the shape of it
 *  for no benefit. Y is linear in semitones, i.e. logarithmic in Hz. */
function paint(canvas: HTMLCanvasElement | null, a: PaintArgs): void {
  if (!canvas) return;
  const g = canvas.getContext('2d');
  if (!g) return;

  const dpr = devicePixelRatio || 1;
  const W = canvas.clientWidth * dpr;
  const H = canvas.clientHeight * dpr;
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  g.clearRect(0, 0, W, H);
  if (W === 0 || H === 0) return;

  const lo = a.exercise.lowestMidi - PITCH_PADDING;
  const hi = a.exercise.highestMidi + PITCH_PADDING;
  const semitone = H / (hi - lo + 1);
  const x = (ms: number) => (ms / a.durationMs) * W;
  const y = (midi: number) => H - (midi - lo + 0.5) * semitone;

  // Semitone lanes, with C naturals labelled.
  g.font = `${10 * dpr}px ui-monospace, monospace`;
  for (let m = Math.ceil(lo); m <= hi; m++) {
    const yy = Math.round(y(m) + semitone / 2) + 0.5;
    g.strokeStyle = m % 12 === 0 ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)';
    g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke();
    if (m % 12 === 0) {
      g.fillStyle = '#55556a';
      g.fillText(noteName(m), 6 * dpr, yy - 4 * dpr);
    }
  }

  // Target notes. Once a take is scored they take the colour of their band, so
  // the roll and the table say the same thing.
  a.exercise.noteSequence.notes.forEach((n, i) => {
    const band = a.results?.[i]?.band;
    const left = x(n.startMs);
    const width = Math.max(2 * dpr, x(n.startMs + n.durationMs) - left);
    g.fillStyle = band
      ? hexAlpha(BAND_COLOR[band], band === 'missed' ? 0.22 : 0.3)
      : 'rgba(124,92,255,.22)';
    g.strokeStyle = band ? BAND_COLOR[band] : 'rgba(124,92,255,.55)';
    g.lineWidth = 1 * dpr;
    roundRect(g, left + 1, y(n.midi) - semitone / 2 + 1, width - 2, semitone - 2, 3 * dpr);
    g.fill();
    g.stroke();
  });

  // Detected trace. Runs break at rests and at gaps in the frame stream: a
  // continuous line across a rest would draw pitch that was never sung.
  const maxGap = (DEFAULT_CONFIG.hopSize / 48000) * 1000 * 2.5;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.lineWidth = 2.5 * dpr;
  g.strokeStyle = '#e8e8f0';
  let drawing = false;
  let prevT: number | null = null;
  g.beginPath();
  for (const f of a.frames) {
    const t = f.timestamp - a.takeZeroMs;
    if (t < 0 || t > a.durationMs) continue;
    if (f.filteredHz == null) { drawing = false; prevT = null; continue; }
    if (prevT != null && t - prevT > maxGap) drawing = false;
    const px = x(t);
    const py = y(hzToMidi(f.filteredHz));
    if (drawing) g.lineTo(px, py); else g.moveTo(px, py);
    drawing = true;
    prevT = t;
  }
  g.stroke();

  if (a.takeMs != null && a.takeMs >= 0 && a.takeMs <= a.durationMs) {
    const px = Math.round(x(a.takeMs)) + 0.5;
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 1 * dpr;
    g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.stroke();
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
