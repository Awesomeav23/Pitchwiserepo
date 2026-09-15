/** The scoring formula from DATA_MODEL.md §5.1. */
import { COVERAGE_THRESHOLD } from './take';
import type { NoteResult } from './take';

/** Within this many cents counts as on pitch (AUDIO_PIPELINE §3 Stage G). */
export const ON_PITCH_CENTS = 10;

export interface AttemptSummary {
  /** 0–100. */
  overallScore: number;
  /** Mean absolute deviation across attempted notes. Null if none were attempted. */
  meanAbsCents: number | null;
  notesOnPitch: number;
  notesAttempted: number;
  notesTotal: number;
  /**
   * False until rhythm scoring is built — it is position 2 on the cut list
   * (REQUIREMENTS §9) and `msOff` is null on every result until then.
   */
  rhythmScored: false;
}

export function scoreAttempt(results: NoteResult[]): AttemptSummary {
  const attempted = results.filter((r) => r.coverage >= COVERAGE_THRESHOLD && r.centsOff != null);
  const onPitch = attempted.filter((r) => Math.abs(r.centsOff as number) <= ON_PITCH_CENTS);

  const meanAbsCents = attempted.length
    ? attempted.reduce((sum, r) => sum + Math.abs(r.centsOff as number), 0) / attempted.length
    : null;

  // Denominator is every note in the exercise, not the notes attempted.
  // Skipping notes has to lower the score, or the highest score in the app
  // belongs to whoever sings one note perfectly and stops.
  const overallScore = Math.round((100 * onPitch.length) / Math.max(1, results.length));

  return {
    overallScore,
    meanAbsCents,
    notesOnPitch: onPitch.length,
    notesAttempted: attempted.length,
    notesTotal: results.length,
    rhythmScored: false,
  };
}
