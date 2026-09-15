/**
 * Reduction of a take's frames to per-note results — DATA_MODEL.md §5.
 *
 * The engine produces ~94 frames a second regardless of what the exercise
 * asked for. This turns that stream into one result per target note, which is
 * what the scorecard renders and what gets persisted. Raw frames are never
 * stored: DATA_MODEL §1 principle 5, only derived numbers leave the browser.
 */
import { hzToCents, midiToHz, bandFor } from '../audio/pitch';
import type { AnalysedFrame } from '../audio/types';
import type { NoteSequence } from '../exercises/types';

export type ResultBand = 'green' | 'amber' | 'red' | 'missed';

export interface NoteResult {
  /** Position in the exercise's notes array, stored explicitly so a sparse
   *  result set still reads correctly (DATA_MODEL §5). */
  index: number;
  targetMidi: number;
  /** Median of voiced frames inside the note window. Null when not attempted. */
  detectedHz: number | null;
  /** Signed. Negative is flat. */
  centsOff: number | null;
  /** Signed onset offset. Null while rhythm scoring is unbuilt — cut list #2. */
  msOff: number | null;
  /** Fraction of the note window that was voiced, 0–1. */
  coverage: number;
  band: ResultBand;
}

export interface NoteResults {
  version: 1;
  results: NoteResult[];
}

/**
 * A note below this coverage was not attempted, and is excluded from
 * meanAbsCents — otherwise skipping notes would improve the average
 * (DATA_MODEL §5.1). Provisional: the final value belongs in the same config as
 * the gate and filter constants, and is an open item in DATA_MODEL §10.
 */
export const COVERAGE_THRESHOLD = 0.5;

/**
 * Frames to ignore after a note's onset, for instruments whose attack transient
 * produces garbage before the pitch settles (REQUIREMENTS §8, AUDIO_PIPELINE §3
 * Stage H).
 *
 * Zero, deliberately. The real count needs a plucked string and a struck key in
 * front of a microphone and is `[TBM]` in the spike. A plausible-looking guess
 * here would silently discard real frames on instruments that do not need it,
 * and would be indistinguishable from a measurement once written down.
 */
export const ONSET_SUPPRESSION_FRAMES = 0;

export interface ReduceOptions {
  /** Capture-clock ms at which the exercise began — take t = 0. */
  takeZeroMs: number;
  /** Hop interval in ms, for the coverage denominator. */
  hopMs: number;
}

export function reduceToNoteResults(
  frames: AnalysedFrame[],
  sequence: NoteSequence,
  opts: ReduceOptions,
): NoteResults {
  const results = sequence.notes.map((note, index): NoteResult => {
    const from = note.startMs;
    const to = note.startMs + note.durationMs;

    const inWindow = frames.filter((f) => {
      const t = f.timestamp - opts.takeZeroMs;
      return t >= from && t < to;
    });

    const usable = inWindow.slice(ONSET_SUPPRESSION_FRAMES);
    const voiced = usable.filter((f) => f.filteredHz != null);

    // Denominator is how many frames the window *should* have held, not how
    // many arrived. Using arrivals would score a take that dropped frames as
    // fully covered, which reads as the player having sung something they did
    // not.
    const expected = Math.max(1, Math.round(note.durationMs / opts.hopMs) - ONSET_SUPPRESSION_FRAMES);
    const coverage = Math.min(1, voiced.length / expected);

    if (coverage < COVERAGE_THRESHOLD || voiced.length === 0) {
      return {
        index, targetMidi: note.midi, detectedHz: null, centsOff: null,
        msOff: null, coverage, band: 'missed',
      };
    }

    const detectedHz = median(voiced.map((f) => f.filteredHz as number));
    const centsOff = hzToCents(detectedHz, midiToHz(note.midi));

    return {
      index,
      targetMidi: note.midi,
      detectedHz,
      centsOff,
      msOff: null,
      coverage,
      band: bandFor(centsOff),
    };
  });

  return { version: 1, results };
}

/**
 * Median rather than mean: one octave error that survived Stage F would drag a
 * mean far enough to change the band, while the median ignores it as long as
 * most of the window was right.
 */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Frames whose timestamps fall inside the take, for drawing the trace. */
export function framesInTake(
  frames: AnalysedFrame[],
  takeZeroMs: number,
  durationMs: number,
): AnalysedFrame[] {
  return frames.filter((f) => {
    const t = f.timestamp - takeZeroMs;
    return t >= 0 && t <= durationMs;
  });
}
