/**
 * Scorecard — US-06. One attempt, in full.
 *
 * The practice screen shows a compact result the moment a take ends; this is
 * the durable version, addressable by URL and fetched from the server. The
 * numbers here are the server's, recomputed from noteResults — so what this
 * shows and what the history list shows cannot disagree (API_SPEC §8).
 *
 * The deviation chart is the point of the screen. A table of numbers tells you
 * that note 6 was 23 cents flat; a chart tells you that everything after note 4
 * drifted flat together, which is a different problem with a different fix.
 */
import { api } from '../api/client';
import { useApi } from '../api/useApi';
import { noteName } from '../audio/pitch';
import { Loading, Failed } from '../components/Async';

interface NoteResult {
  index: number;
  targetMidi: number;
  detectedHz: number | null;
  centsOff: number | null;
  msOff: number | null;
  coverage: number;
  band: 'green' | 'amber' | 'red' | 'missed';
}

const BAND_COLOR: Record<string, string> = {
  green: '#3ddc84', amber: '#f2c14e', red: '#ff5d6c', missed: '#55556a',
};
/** The chart clamps here. Beyond half a semitone the reading is a wrong note,
 *  not a tuning error, and letting the axis stretch would flatten everything else. */
const CENTS_LIMIT = 50;

export function Scorecard({ attemptId, onBack }: { attemptId: string; onBack: () => void }) {
  const attempt = useApi(() => api.attempt(attemptId), [attemptId]);

  if (attempt.loading) return <Loading what="the scorecard" />;
  if (attempt.error || !attempt.data) {
    return <Failed message={attempt.error ?? 'Not found'} onRetry={attempt.reload} />;
  }

  const a = attempt.data;
  const results = (a.noteResults?.results ?? []) as NoteResult[];
  const missed = results.filter((r) => r.band === 'missed').length;

  return (
    <div className="tuner scorecard">
      <header>
        <button className="back" onClick={onBack}>← Back</button>
        <h1>Scorecard</h1>
        <span className="pill">{new Date(a.createdAt).toLocaleString()}</span>
      </header>

      <section className="score-head">
        <div className="score">
          <strong style={{ color: scoreColor(a.overallScore) }}>{a.overallScore}</strong>
          <span>/ 100</span>
        </div>
        <dl className="score-stats">
          <div><dt>On pitch</dt><dd>{a.notesOnPitch} of {a.notesTotal}</dd></div>
          <div><dt>Attempted</dt><dd>{a.notesAttempted} of {a.notesTotal}</dd></div>
          <div>
            <dt>Average error</dt>
            <dd>{a.meanAbsCents != null ? `${a.meanAbsCents.toFixed(1)}¢` : '—'}</dd>
          </div>
        </dl>
      </section>

      {missed > 0 && (
        <p className="alert warn">
          {missed === 1 ? 'One note was' : `${missed} notes were`} not sounded long enough to
          score. Those count against the total — skipping a note has to lower the score, or
          the highest score in the app belongs to whoever sings one note and stops.
        </p>
      )}

      <h2 className="section-head">Note by note</h2>
      <DeviationChart results={results} />

      <table className="notes">
        <thead>
          <tr><th>#</th><th>Target</th><th>Heard</th><th>Cents</th><th>Coverage</th></tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.index}>
              <td>{r.index + 1}</td>
              <td>{noteName(r.targetMidi)}</td>
              <td>{r.detectedHz != null ? `${r.detectedHz.toFixed(1)} Hz` : '—'}</td>
              <td style={{ color: BAND_COLOR[r.band] }}>
                {r.centsOff == null ? 'missed' : `${r.centsOff >= 0 ? '+' : ''}${r.centsOff.toFixed(1)}`}
              </td>
              <td>{Math.round(r.coverage * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="stat">
        Green is within 10 cents, amber to 25, red beyond. Coverage is how much of the
        note you actually held — a note 40 cents off at 95% was sung wrong, and one at 8%
        was not sung at all. Those are different problems.
      </p>

      <p className="stat">
        Engine <code>{a.engineVersion}</code> · input <code>{a.inputSource}</code>
        {!a.rhythmScored && ' · timing not scored'}
      </p>
    </div>
  );
}

/** Signed cents per note, so a systematic drift is visible as a shape rather
 *  than as a column of numbers. */
function DeviationChart({ results }: { results: NoteResult[] }) {
  const W = 100;                      // viewBox units; the SVG scales to its box
  const H = 46;
  const mid = H / 2;
  const step = W / Math.max(1, results.length);
  const y = (cents: number) => mid - (Math.max(-CENTS_LIMIT, Math.min(CENTS_LIMIT, cents)) / CENTS_LIMIT) * (mid - 3);

  return (
    <figure className="deviation">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
           aria-label="Cents deviation for each note">
        {/* The ±10 cent band — anything inside it counts as on pitch. */}
        <rect x="0" y={y(10)} width={W} height={y(-10) - y(10)} fill="rgba(61,220,132,.10)" />
        <line x1="0" y1={mid} x2={W} y2={mid} stroke="rgba(255,255,255,.25)" strokeWidth="0.3" />

        {results.map((r, i) => {
          const cx = i * step + step / 2;
          if (r.centsOff == null) {
            return <circle key={r.index} cx={cx} cy={mid} r="1.1" fill={BAND_COLOR.missed} />;
          }
          const top = Math.min(mid, y(r.centsOff));
          return (
            <g key={r.index}>
              <rect x={cx - step * 0.28} y={top} width={step * 0.56}
                    height={Math.max(0.6, Math.abs(mid - y(r.centsOff)))}
                    fill={BAND_COLOR[r.band]} opacity="0.85" rx="0.4" />
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span>sharp ↑</span>
        <span>±10¢ on pitch</span>
        <span>↓ flat</span>
      </figcaption>
    </figure>
  );
}

const scoreColor = (score: number) =>
  score >= 80 ? '#3ddc84' : score >= 50 ? '#f2c14e' : '#ff5d6c';
