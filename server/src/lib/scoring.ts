/**
 * The scoring formula from DATA_MODEL.md §5.1, computed server-side.
 *
 * API_SPEC §8 is explicit that the client does not send scores. Two reasons,
 * and the second matters more: a client cannot be the authority on its own
 * score, and the denormalized columns are what every history list reads — if
 * both sides computed them they could disagree, and the list would show one
 * number while the scorecard showed another.
 */
import { config } from './config.ts';

export const ON_PITCH_CENTS = 10;

export interface NoteResult {
  index: number;
  targetMidi: number;
  detectedHz: number | null;
  centsOff: number | null;
  msOff: number | null;
  coverage: number;
  band: 'green' | 'amber' | 'red' | 'missed';
}

export interface Summary {
  overallScore: number;
  meanAbsCents: number | null;
  notesOnPitch: number;
  notesAttempted: number;
  notesTotal: number;
}

export function summarise(results: NoteResult[], notesTotal: number): Summary {
  const attempted = results.filter(
    (r) => r.coverage >= config.coverageThreshold && r.centsOff !== null,
  );
  const onPitch = attempted.filter((r) => Math.abs(r.centsOff as number) <= ON_PITCH_CENTS);

  const meanAbsCents = attempted.length
    ? Math.round(
        (attempted.reduce((sum, r) => sum + Math.abs(r.centsOff as number), 0) / attempted.length) * 100,
      ) / 100
    : null;

  // Denominator is every note in the exercise, not the notes attempted, so
  // skipping notes lowers the score.
  return {
    overallScore: Math.round((100 * onPitch.length) / Math.max(1, notesTotal)),
    meanAbsCents,
    notesOnPitch: onPitch.length,
    notesAttempted: attempted.length,
    notesTotal,
  };
}
