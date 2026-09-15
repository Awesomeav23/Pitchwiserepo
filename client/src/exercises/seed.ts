/**
 * The five v1 exercises from DATA_MODEL.md §6.2. Authored as strings and built
 * at module load, which is the same output the seed generator will emit for the
 * database — one source of truth for the shapes, per ADR-011.
 *
 * All five are stepwise or small-interval by design. The median filter corrects
 * octave errors by assuming pitch moves smoothly (AUDIO_PIPELINE §3 Stage F), so
 * an exercise with an octave leap in it would be scored by a filter actively
 * working against the music.
 *
 * Ranges are written for a middle voice. Per-instrument transposed variants are
 * post-MVP; `lowestMidi` / `highestMidi` exist so a profile that cannot reach
 * them can say so rather than score the player badly for the app's choice.
 */
import { buildExercise } from './build';
import type { Exercise, ExerciseTypeId } from './types';

interface Seed {
  slug: string;
  title: string;
  description: string;
  typeId: ExerciseTypeId;
  difficulty: number;
  tempoBpm: number;
  spec: string;
}

const SEEDS: Seed[] = [
  {
    slug: 'c-major-five-note',
    title: 'C major, five notes',
    description: 'Five-note scale up and back. The shortest exercise in the library.',
    typeId: 'scale',
    difficulty: 1,
    tempoBpm: 90,
    spec: 'C4 D4 E4 F4 G4 F4 E4 D4 C4.',
  },
  {
    slug: 'c-major-octave',
    title: 'C major scale, one octave',
    description: 'A full octave up and back, stepwise throughout.',
    typeId: 'scale',
    difficulty: 2,
    tempoBpm: 100,
    spec: 'C4 D4 E4 F4 G4 A4 B4 C5 B4 A4 G4 F4 E4 D4 C4.',
  },
  {
    slug: 'seconds-and-thirds',
    title: 'Seconds and thirds',
    description: 'Alternating steps and skips. Thirds are where intonation usually slips first.',
    typeId: 'interval',
    difficulty: 2,
    tempoBpm: 80,
    spec: 'C4 D4 C4 E4 D4 E4 D4 F4 E4 G4 F4 A4.',
  },
  {
    slug: 'five-note-descending-warmup',
    title: 'Descending five-note warm-up',
    description: 'Two descending five-note figures. Starts high and relaxes downward.',
    typeId: 'warmup',
    difficulty: 1,
    tempoBpm: 76,
    spec: 'G4 F4 E4 D4 C4 G4 F4 E4 D4 C4.',
  },
  {
    slug: 'major-triad-arpeggio',
    title: 'Major triad arpeggio',
    description: 'C major triad up and down, twice. The widest leaps in the library.',
    typeId: 'arpeggio',
    difficulty: 3,
    tempoBpm: 92,
    spec: 'C4 E4 G4 C5 G4 E4 C4 E4 G4 C5 G4 E4 C4.',
  },
];

export const EXERCISES: Exercise[] = SEEDS.map((s) => {
  const built = buildExercise(s.spec, { bpm: s.tempoBpm });
  return {
    slug: s.slug,
    title: s.title,
    description: s.description,
    typeId: s.typeId,
    difficulty: s.difficulty,
    tempoBpm: s.tempoBpm,
    timeSignature: '4/4',
    lowestMidi: built.lowestMidi,
    highestMidi: built.highestMidi,
    noteSequence: built.noteSequence,
  };
});

export const exerciseBySlug = (slug: string): Exercise =>
  EXERCISES.find((e) => e.slug === slug) ?? EXERCISES[0];
