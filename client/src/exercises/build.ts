/**
 * The authoring helper from DATA_MODEL.md §4.2, per ADR-011. Exercises are
 * hand-authored as a compact string and converted here, rather than typed as
 * JSON by hand or imported from MIDI.
 *
 *   buildExercise('C4 D4 E4 F4 G4 F4 E4 D4 C4.', { bpm: 90 })
 *
 * - Note names map to MIDI: C4 → 60, F#3 → 54, Bb4 → 70
 * - `.` doubles that note's duration; repeated dots double again
 * - `-` is a rest of one unit, and is implicit in the output: a gap between
 *   one note's end and the next note's start is the rest. No rest objects,
 *   because nothing scores against them (DATA_MODEL §4).
 */
import type { NoteSequence, TargetNote } from './types';

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const UNIT_BEATS = { whole: 4, half: 2, quarter: 1, eighth: 0.5, sixteenth: 0.25 } as const;
export type Unit = keyof typeof UNIT_BEATS;

export interface BuildOptions {
  bpm: number;
  /** Duration of one token. Default a quarter note. */
  unit?: Unit;
}

const TOKEN = /^([A-G])([#b]*)(-?\d+)(\.*)$/;

export function noteNameToMidi(name: string): number {
  const m = TOKEN.exec(name.trim());
  if (!m) throw new Error(`Not a note name: "${name}"`);
  const [, letter, accidentals, octave] = m;
  const shift = [...accidentals].reduce((n, c) => n + (c === '#' ? 1 : -1), 0);
  const midi = (Number(octave) + 1) * 12 + PITCH_CLASS[letter] + shift;
  if (midi < 0 || midi > 127) throw new Error(`"${name}" is outside MIDI 0–127`);
  return midi;
}

export interface BuiltExercise {
  noteSequence: NoteSequence;
  lowestMidi: number;
  highestMidi: number;
}

export function buildExercise(spec: string, opts: BuildOptions): BuiltExercise {
  const beats = UNIT_BEATS[opts.unit ?? 'quarter'];

  // Rounded once, then accumulated as integers. Rounding per note instead
  // would let error compound across a take: at 90 bpm the unit is 666.67 ms,
  // and fifteen notes of independent rounding drift by several milliseconds
  // against a metronome that does not drift at all.
  const unitMs = Math.round((60000 / opts.bpm) * beats);

  const tokens = spec.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) throw new Error('Exercise spec is empty');

  const notes: TargetNote[] = [];
  let cursor = 0;

  for (const token of tokens) {
    if (/^-+$/.test(token)) {
      cursor += unitMs * token.length;
      continue;
    }
    const m = TOKEN.exec(token);
    if (!m) throw new Error(`Unrecognised token "${token}"`);
    const durationMs = unitMs * Math.pow(2, m[4].length);
    notes.push({ midi: noteNameToMidi(token), startMs: cursor, durationMs });
    cursor += durationMs;
  }

  if (notes.length === 0) throw new Error('Exercise has no notes, only rests');

  const midis = notes.map((n) => n.midi);
  const built: BuiltExercise = {
    noteSequence: { version: 1, notes },
    lowestMidi: Math.min(...midis),
    highestMidi: Math.max(...midis),
  };
  assertInvariants(built.noteSequence);
  return built;
}

/**
 * DATA_MODEL §4: notes are non-empty, starts are non-decreasing, and no two
 * notes overlap. Non-overlap is what enforces monophony at the data level, so
 * it is checked at write time rather than trusted.
 */
export function assertInvariants(seq: NoteSequence): void {
  if (seq.notes.length === 0) throw new Error('note_sequence has no notes');
  for (let i = 0; i < seq.notes.length - 1; i++) {
    const a = seq.notes[i];
    const b = seq.notes[i + 1];
    if (b.startMs < a.startMs) throw new Error(`startMs decreases at note ${i + 1}`);
    if (a.startMs + a.durationMs > b.startMs) {
      throw new Error(`notes ${i} and ${i + 1} overlap — the sequence is not monophonic`);
    }
  }
}
