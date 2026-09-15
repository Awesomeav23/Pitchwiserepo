/** Exercise shapes. Mirrors DATA_MODEL.md §3.5 and §4 so the client and the
 *  future API agree on one schema. */

export interface TargetNote {
  /** Concert pitch. 60 = C4. Transposition is display-only (ADR-010). */
  midi: number;
  /** Milliseconds from exercise start. The first note is 0. */
  startMs: number;
  durationMs: number;
}

export interface NoteSequence {
  /** Present from day one so a future change is not a guessing game. */
  version: 1;
  notes: TargetNote[];
}

export type ExerciseTypeId = 'scale' | 'interval' | 'warmup' | 'arpeggio';

export interface Exercise {
  slug: string;
  title: string;
  description: string;
  typeId: ExerciseTypeId;
  /** 1–5. */
  difficulty: number;
  tempoBpm: number;
  timeSignature: string;
  /** Denormalized from the sequence, per DATA_MODEL §3.5. */
  lowestMidi: number;
  highestMidi: number;
  noteSequence: NoteSequence;
}

export const durationOf = (seq: NoteSequence): number => {
  const last = seq.notes[seq.notes.length - 1];
  return last.startMs + last.durationMs;
};
