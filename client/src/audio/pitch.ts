/** Stage G — Hz, cents and MIDI. See docs/AUDIO_PIPELINE.md §3 Stage G. */

/** A4 reference. Configurable ensemble tuning (442, 443) is not in v1 scope. */
export const A4_HZ = 440;

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const hzToMidi = (hz: number): number => 69 + 12 * Math.log2(hz / A4_HZ);
export const midiToHz = (midi: number): number => A4_HZ * Math.pow(2, (midi - 69) / 12);

/**
 * Cents are used for display and scoring because they are perceptually linear:
 * 20 cents flat sounds equally wrong at any pitch, while 5 Hz flat is inaudible
 * at C6 and badly out of tune at C2.
 */
export const hzToCents = (hz: number, targetHz: number): number =>
  1200 * Math.log2(hz / targetHz);

export function noteName(midi: number): string {
  const r = Math.round(midi);
  return `${NAMES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
}

export interface NearestNote {
  midi: number;
  name: string;
  /** Signed cents from that note. Negative is flat. */
  cents: number;
}

export function nearestNote(hz: number): NearestNote {
  const exact = hzToMidi(hz);
  const midi = Math.round(exact);
  return { midi, name: noteName(midi), cents: (exact - midi) * 100 };
}

export type Band = 'green' | 'amber' | 'red';

/** Scoring bands from §3 Stage G. Used by the scorecard, not by the display. */
export function bandFor(cents: number): Band {
  const a = Math.abs(cents);
  return a <= 10 ? 'green' : a <= 25 ? 'amber' : 'red';
}
