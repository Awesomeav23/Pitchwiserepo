/**
 * The seed generator from DATA_MODEL.md §11.9: a course is a shared skeleton
 * plus a per-instrument override, not eight bespoke lessons written twelve
 * times.
 *
 * LEARNING_PLATFORM.md §4.2 is the cost argument. Lessons 3, 5, 6 and 7 are the
 * seed exercises transposed into the instrument's range; only lessons 1, 2 and 8
 * are genuinely per-instrument, plus a clef, two transpositions and — for guitar
 * and piano — a chord lesson. Roughly thirty-six short prose pieces over a
 * shared frame, rather than ninety-six lessons.
 *
 * In the finished product this runs at build time and emits rows. It runs at
 * module load here because there is no database yet; the inputs and the output
 * shape are the same either way.
 */
import { buildExercise } from '../exercises/build';
import type { NoteSequence } from '../exercises/types';
import type { Block, Course, Lesson, Module } from './types';

export interface InstrumentCourse {
  instrumentId: string;
  /** Display name, used in shared lesson copy. */
  name: string;
  /** "sing" or "play" — the shared lessons read as English either way. */
  verb: 'sing' | 'play';
  clef: 'treble' | 'bass';
  /**
   * Semitones to move the seed exercises so they sit in a beginner's comfortable
   * range on this instrument. Applies to what is sounded and scored.
   */
  rangeShift: number;
  /**
   * Written pitch minus sounding pitch, for transposing instruments. Engraving
   * only — never applied to a detected frequency (ADR-010). A clarinettist's
   * written C sounds B flat, so the staff shows +2.
   */
  notationShift: number;
  /** Explains this instrument's notation quirk in lesson 4. Omitted when there is none. */
  notationNote?: string;
  /** Lesson 1 — setup, parts, posture. */
  meet: Block[];
  /** Lesson 2 — tuning, or finding pitch. */
  tune: Block[];
  /** Lesson 2's instruction to the learner, shown above the self-report button. */
  tuneDrill: string;
  /** Lesson 8 — where to go next. */
  next: Block[];
  /** Optional lesson 7b. Guitar and piano, where chords are the obvious gap. */
  chord?: { title: string; blocks: Block[] };
}

const transpose = (seq: NoteSequence, semitones: number): NoteSequence =>
  semitones === 0 ? seq
    : { version: 1, notes: seq.notes.map((n) => ({ ...n, midi: n.midi + semitones })) };

/** Build a spec string's sequence, shifted into range. */
function seq(spec: string, bpm: number, shift: number): NoteSequence {
  return transpose(buildExercise(spec, { bpm }).noteSequence, shift);
}

/** Notation is engraved at written pitch, which for a transposing instrument is
 *  not the pitch that sounds. Scoring always uses the sounding pitch. */
const writtenSpecShift = (c: InstrumentCourse) => c.rangeShift + c.notationShift;

const SPECS = {
  firstThree: { spec: 'C4 D4 E4 D4 C4.', bpm: 80 },
  scale: { spec: 'C4 D4 E4 F4 G4 F4 E4 D4 C4.', bpm: 90 },
  descending: { spec: 'G4 F4 E4 D4 C4 G4 F4 E4 D4 C4.', bpm: 76 },
  melody: { spec: 'E4 D4 C4 D4 E4 E4 E4. D4 D4 D4. E4 G4 G4.', bpm: 96 },
  octave: { spec: 'C4 D4 E4 F4 G4 A4 B4 C5.', bpm: 100 },
} as const;

function scoreBlock(c: InstrumentCourse, key: keyof typeof SPECS, caption: string): Block {
  const { spec, bpm } = SPECS[key];
  return {
    kind: 'score',
    spec: shiftSpec(spec, writtenSpecShift(c)),
    bpm,
    clef: c.clef,
    caption,
  };
}

/** Shift every note name in a compact spec string by a number of semitones. */
export function shiftSpec(spec: string, semitones: number): string {
  if (semitones === 0) return spec;
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return spec.split(/\s+/).map((token) => {
    const m = /^([A-G])([#b]*)(-?\d+)(\.*)$/.exec(token);
    if (!m) return token;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] as number;
    const acc = [...m[2]].reduce((n, ch) => n + (ch === '#' ? 1 : -1), 0);
    const midi = (Number(m[3]) + 1) * 12 + base + acc + semitones;
    return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}${m[4]}`;
  }).join(' ');
}

/**
 * "Clarinet (B flat)" → "clarinet", "Guitar (melody)" → "guitar". The display
 * name carries qualifiers that belong on a catalog card and not in the middle of
 * a sentence, and lowercasing the whole of it mangles the flat sign.
 */
const shortName = (name: string): string =>
  name.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();

export function generateCourse(c: InstrumentCourse): Course {
  const V = c.verb;
  const played = V === 'sing' ? 'sung' : 'played';

  const exerciseLesson = (
    id: string, title: string, key: keyof typeof SPECS, minutes: number,
    rule: Lesson['completionRule'], blocks: Block[],
  ): Lesson => ({
    id: `${c.instrumentId}-${id}`,
    title,
    kind: 'exercise',
    estimatedMinutes: minutes,
    completionRule: rule,
    blocks,
    inlineExercise: {
      title,
      bpm: SPECS[key].bpm,
      sequence: seq(SPECS[key].spec, SPECS[key].bpm, c.rangeShift),
    },
  });

  const modules: Module[] = [
    {
      id: `${c.instrumentId}-m1`,
      title: 'Getting started',
      lessons: [
        {
          id: `${c.instrumentId}-l1`,
          title: c.verb === 'sing' ? 'Meet your voice' : `Meet the ${shortName(c.name)}`,
          kind: 'content',
          estimatedMinutes: 6,
          completionRule: { kind: 'read' },
          blocks: c.meet,
        },
        {
          id: `${c.instrumentId}-l2`,
          title: c.verb === 'sing' ? 'Finding your range' : 'Getting in tune',
          kind: 'drill',
          estimatedMinutes: 8,
          completionRule: { kind: 'self_report' },
          blocks: [...c.tune, { kind: 'callout', tone: 'note', md: c.tuneDrill }],
        },
      ],
    },
    {
      id: `${c.instrumentId}-m2`,
      title: 'Your first notes',
      lessons: [
        exerciseLesson('l3', 'Your first three notes', 'firstThree', 10,
          { kind: 'attempt_score', minScore: 60 }, [
            { kind: 'prose', md: `Three notes, up and back. ${V === 'sing' ? 'Sing them on any vowel you like — *ah* is easiest to keep open.' : 'Take them slowly and let each one settle before moving.'}` },
            scoreBlock(c, 'firstThree', 'Press ▶ to hear it before you try it'),
            { kind: 'prose', md: `Listen first, then ${V} along with the metronome. The count-in gives you four beats before the first note.` },
            { kind: 'callout', tone: 'note', md: `Aim for **steady**, not loud. A quiet note held straight scores better than a strong one that wobbles, because the app measures the frequency you land on and how much of the note you actually held.` },
          ]),
        {
          id: `${c.instrumentId}-l4`,
          title: 'Note names and the staff',
          kind: 'quiz',
          estimatedMinutes: 9,
          completionRule: { kind: 'quiz_pass', minFraction: 0.75 },
          blocks: [
            { kind: 'prose', md: 'The five lines and four spaces are a **staff**. A note sits on a line or in a space, and where it sits is which note it is. Higher on the staff means higher in pitch — the picture is literal.' },
            scoreBlock(c, 'octave', 'Eight notes, one step at a time'),
            { kind: 'prose', md: c.clef === 'treble'
              ? 'The curly sign at the start is a **treble clef**. It fixes the reference: the line it curls around is G above middle C. Everything else follows from that one anchor.'
              : 'The sign at the start is a **bass clef**. Its two dots sit either side of the F below middle C, which is the anchor everything else is counted from.' },
            { kind: 'prose', md: 'The number after a note name is its octave: C4 is middle C, C5 is the C above it, C3 the C below. Pitchwise uses these names everywhere — on the tuner, on the scorecard, and here.' },
            ...(c.notationNote ? [{ kind: 'callout' as const, tone: 'warning' as const, md: c.notationNote }] : []),
          ],
          quiz: {
            version: 1,
            passFraction: 0.75,
            questions: [
              {
                id: 'q1',
                prompt: 'Which note is this?',
                score: { spec: shiftSpec('C4.', writtenSpecShift(c)), bpm: 100, clef: c.clef },
                choices: notesAround(c, 0),
                answerIndex: 0,
                explain: c.clef === 'treble'
                  ? 'Read up from middle C on its ledger line below the staff.'
                  : 'Read down from middle C on its ledger line above the bass staff.',
              },
              {
                id: 'q2',
                prompt: 'Which note is this?',
                score: { spec: shiftSpec('G4.', writtenSpecShift(c)), bpm: 100, clef: c.clef },
                choices: notesAround(c, 7),
                answerIndex: 0,
                explain: 'Count up the lines and spaces from the clef’s anchor note.',
              },
              {
                id: 'q3',
                prompt: 'A note higher on the staff sounds…',
                choices: ['Higher in pitch', 'Lower in pitch', 'Louder', 'Longer'],
                answerIndex: 0,
                explain: 'The staff is a literal picture of pitch. Vertical position is pitch and nothing else — loudness and length are written separately.',
              },
              {
                id: 'q4',
                prompt: 'What does the 4 in “C4” mean?',
                choices: ['Its octave', 'Its loudness', 'How many beats it lasts', 'Which finger to use'],
                answerIndex: 0,
                explain: 'The number is the octave. C4 is middle C, C5 is an octave above it, C3 an octave below.',
              },
            ],
          },
        },
        exerciseLesson('l5', 'Your first scale', 'scale', 12,
          { kind: 'attempt_score', minScore: 60 }, [
            { kind: 'prose', md: `Five notes up, five back down, ending on a long one. This is the same shape as lesson 3 with two more notes on top.` },
            scoreBlock(c, 'scale', 'Five notes up and back — 90 bpm'),
            { kind: 'callout', tone: 'note', md: 'The last note is held for two beats. Hold it all the way — a note released early reads as low coverage, which the scorecard reports separately from being out of tune.' },
          ]),
      ],
    },
    {
      id: `${c.instrumentId}-m3`,
      title: 'Playing music',
      lessons: [
        exerciseLesson('l6', V === 'sing' ? 'Singing in time' : 'Playing in time', 'descending', 10,
          { kind: 'attempt_any' }, [
            { kind: 'prose', md: 'A metronome click is a fixed grid. Your job is to change note exactly when it clicks — not just to get the right notes in the right order.' },
            scoreBlock(c, 'descending', 'Descending five-note warm-up — 76 bpm, slow on purpose'),
            { kind: 'prose', md: 'Slow tempos are harder than fast ones, because there is more empty time in which to drift. If you find this uncomfortable, that is the exercise working.' },
            { kind: 'callout', tone: 'limitation', md: 'Timing is **not scored yet**. Rhythm scoring is built but deliberately switched off until the app’s audio latency has been measured — scoring you against a delay the app has not measured would be scoring you for its own lag. This lesson completes on any attempt.' },
          ]),
        exerciseLesson('l7', 'A simple melody', 'melody', 12,
          { kind: 'attempt_score', minScore: 55 }, [
            { kind: 'prose', md: 'Everything so far has gone up or down in order. A melody does not — it moves in steps *and* skips, and the skips are where intonation usually slips first.' },
            scoreBlock(c, 'melody', 'You will recognise this one'),
            { kind: 'prose', md: `Notice the repeated notes and the longer notes at the end of each phrase. Keep the repeats cleanly separated rather than sliding through them, and give the long notes their full length.` },
            { kind: 'callout', tone: 'note', md: 'The pass mark here is lower than the scale lessons. Skips are genuinely harder, and a first melody should not be a wall.' },
          ]),
        ...(c.chord ? [{
          id: `${c.instrumentId}-l7b`,
          title: c.chord.title,
          kind: 'drill' as const,
          estimatedMinutes: 10,
          completionRule: { kind: 'self_report' as const },
          blocks: c.chord.blocks,
        }] : []),
        {
          id: `${c.instrumentId}-l8`,
          title: 'Where to go next',
          kind: 'content',
          estimatedMinutes: 4,
          completionRule: { kind: 'read' },
          blocks: [
            { kind: 'prose', md: `You have ${played} a scale, read a staff, and held a melody against a click. That is the whole beginner loop — everything after this is the same loop with harder material.` },
            ...c.next,
          ],
        },
      ],
    },
  ];

  return {
    id: `course-${c.instrumentId}`,
    slug: `${c.instrumentId.replace(/_/g, '-')}-starter`,
    title: `${c.name} — starter course`,
    summary: c.verb === 'sing'
      ? 'Find your range, read your first staff, and sing a melody in tune.'
      : `Set up, tune, read your first staff, and play a melody in tune.`,
    instrumentId: c.instrumentId,
    level: 1,
    isPublished: true,
    modules,
  };
}

/** Four plausible answers for a note-naming question, correct one first. */
function notesAround(c: InstrumentCourse, offsetFromC4: number): string[] {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const name = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  const written = 60 + offsetFromC4 + writtenSpecShift(c);
  return [written, written + 4, written + 7, written - 3].map(name);
}
