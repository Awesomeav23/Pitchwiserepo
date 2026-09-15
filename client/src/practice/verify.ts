/**
 * Headless checks on the take reduction and the scoring formula.
 * Run with `npm run verify`. Same idea as spike/verify.mjs: no test framework,
 * no browser, just assertions against synthesized frames.
 *
 * These exist because opening the page does not exercise this code in any way
 * you can check by eye. A take that scores 84 looks exactly as plausible as one
 * that should have scored 78, and the difference is a denominator.
 */
import { midiToHz } from '../audio/pitch';
import type { AnalysedFrame } from '../audio/types';
import { EXERCISES } from '../exercises/seed';
import { reduceToNoteResults } from './take';
import { scoreAttempt } from './scoring';
import { DEFAULT_CONFIG } from '../audio/types';

const SAMPLE_RATE = 48000;
const hopMs = (DEFAULT_CONFIG.hopSize / SAMPLE_RATE) * 1000;
/** Deliberately not zero, so an origin mistake cannot pass by cancelling out. */
const TAKE_ZERO = 1234.5;

const exercise = EXERCISES[0];   // c-major-five-note, 9 notes

interface SynthOptions {
  centsOff?: number;
  silentIndices?: number[];
  /** Sing only this fraction of each note's window. */
  coverageFrac?: number;
}

function synth(o: SynthOptions = {}): AnalysedFrame[] {
  const { centsOff = 0, silentIndices = [], coverageFrac = 1 } = o;
  const notes = exercise.noteSequence.notes;
  const last = notes[notes.length - 1];
  const total = last.startMs + last.durationMs;
  const frames: AnalysedFrame[] = [];

  for (let t = 0; t <= total + 500; t += hopMs) {
    const i = notes.findIndex((n) => t >= n.startMs && t < n.startMs + n.durationMs);
    let hz: number | null = null;
    if (i >= 0 && !silentIndices.includes(i)) {
      const n = notes[i];
      if ((t - n.startMs) / n.durationMs <= coverageFrac) {
        hz = midiToHz(n.midi) * Math.pow(2, centsOff / 1200);
      }
    }
    frames.push({
      timestamp: TAKE_ZERO + t, captureTime: 0,
      voiced: hz !== null, hz, clarity: hz ? 0.99 : 0, rms: hz ? 0.05 : 0.001, reason: 0,
      filteredHz: hz, midi: null, noteName: null, centsOff: null,
    });
  }
  return frames;
}

const run = (o: SynthOptions = {}, takeZeroMs = TAKE_ZERO) => {
  const { results } = reduceToNoteResults(synth(o), exercise.noteSequence, { takeZeroMs, hopMs });
  return { results, summary: scoreAttempt(results) };
};

let failures = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS  ' : 'FAIL  '}${name}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
}

let r = run();
check('perfect take scores 100', r.summary.overallScore, 100);
check('perfect take: all 9 green', r.results.filter((x) => x.band === 'green').length, 9);
check('perfect take: meanAbsCents ~0', Math.abs(r.summary.meanAbsCents as number) < 0.01, true);

r = run({ centsOff: 30 });
check('30c sharp scores 0', r.summary.overallScore, 0);
check('30c sharp: all red', r.results.filter((x) => x.band === 'red').length, 9);
check('30c sharp: still 9 attempted', r.summary.notesAttempted, 9);
check('30c sharp: meanAbsCents ~30', Math.round(r.summary.meanAbsCents as number), 30);

// Not tested at exactly 10.0: 2^(10/1200) round-trips to 10.000000000000016
// cents, so an exact-boundary assertion tests float representation rather than
// scoring. The band edge is checked either side of it instead.
check('9.9c counts as on pitch', run({ centsOff: 9.9 }).summary.notesOnPitch, 9);
check('10.1c does not', run({ centsOff: 10.1 }).summary.notesOnPitch, 0);
check('9.9c green, 10.1c amber',
  [run({ centsOff: 9.9 }).results[0].band, run({ centsOff: 10.1 }).results[0].band],
  ['green', 'amber']);

r = run({ silentIndices: [2, 5] });
check('2 skipped -> 7 attempted', r.summary.notesAttempted, 7);
check('2 skipped -> 2 missed', r.results.filter((x) => x.band === 'missed').length, 2);
check('2 skipped -> denominator stays 9', r.summary.notesTotal, 9);
check('2 skipped -> score 78, not 100', r.summary.overallScore, Math.round(700 / 9));
check('skipped note has null cents', r.results[2].centsOff, null);
// The asymmetry in DATA_MODEL §5.1: skipping lowers the score but must not
// flatter the average, so the mean is over attempted notes only.
check('meanAbsCents excludes missed', Math.abs(r.summary.meanAbsCents as number) < 0.01, true);

check('40% coverage -> all missed', run({ coverageFrac: 0.4 }).results.every((x) => x.band === 'missed'), true);
check('80% coverage -> all attempted', run({ coverageFrac: 0.8 }).summary.notesAttempted, 9);

// A 1234.5 ms origin error is 1.85 notes at this tempo, and this exercise is a
// palindrome, so one note coincidentally lands on a matching pitch. The claim
// is that the score collapses, not that it reaches zero.
const wrong = run({}, 0).summary;
check('wrong takeZero collapses the score', wrong.overallScore < 20, true);
check('wrong takeZero: at most 1 note on pitch', wrong.notesOnPitch <= 1, true);

const total = 20;
console.log(`\n${total - failures}/${total} checks pass`);
// Thrown rather than process.exit, which is not typed under the app's browser
// tsconfig. An uncaught throw still exits non-zero, which is all CI needs.
if (failures > 0) throw new Error(`${failures} of ${total} checks failed`);
