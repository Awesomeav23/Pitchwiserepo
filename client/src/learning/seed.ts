/**
 * Course content. One published starter course, built on the eight-lesson
 * skeleton in LEARNING_PLATFORM.md §4.1; the rest of the catalog is listed but
 * unpublished, which is the tranche mechanism from DATA_MODEL §11.1 rather than
 * a placeholder.
 *
 * Voice is published first because its transposition is zero and its clef is
 * ordinary, so every piece of notation in it means exactly what it shows. A
 * guitar course engraves an octave above sounding pitch and a clarinet course
 * engraves a tone above; both are correct and both need explaining in the
 * lesson that introduces the staff. Getting the platform right on the
 * instrument with no such wrinkle comes first.
 *
 * In the finished product these are emitted by the seed generator
 * (DATA_MODEL §11.9) from a skeleton plus per-instrument overrides. Written
 * out longhand here because the shape has to be proven on a course built by
 * hand before a generator is worth writing.
 */
import { INSTRUMENT_PROFILES } from '../audio/profiles';
import { buildExercise } from '../exercises/build';
import type { Course } from './types';

const inline = (title: string, spec: string, bpm: number) => ({
  title,
  bpm,
  sequence: buildExercise(spec, { bpm }).noteSequence,
});

const VOICE_TENOR: Course = {
  id: 'course-voice-tenor',
  slug: 'voice-tenor-starter',
  title: 'Voice — starter course',
  summary: 'Find your range, read your first staff, and sing a melody in tune.',
  instrumentId: 'voice_tenor',
  level: 1,
  isPublished: true,
  modules: [
    {
      id: 'm1',
      title: 'Getting started',
      lessons: [
        {
          id: 'l1',
          title: 'Meet your voice',
          kind: 'content',
          estimatedMinutes: 6,
          completionRule: { kind: 'read' },
          blocks: [
            { kind: 'prose', md: 'Your voice is the only instrument you cannot put down, adjust, or hand to a repair shop. Everything that makes a note happen — the air, the vibration, the resonance — is inside you, which is why singing in tune is mostly a matter of *hearing* accurately rather than *doing* something precisely.' },
            { kind: 'prose', md: 'Three things make a sung note:\n\n- **Breath.** Air moving steadily past the vocal folds. Unsteady air is the single most common cause of a wandering pitch.\n- **The folds themselves.** They vibrate at a rate you control largely by ear, not by feel.\n- **Resonance.** The shape of your mouth and throat, which changes the tone colour but not the pitch.' },
            { kind: 'prose', md: 'Stand or sit so your ribs are free. Feet flat, shoulders down, chin level — not lifted. A lifted chin tightens the throat and flattens your top notes, and you will hear it on the trace later in this course.' },
            { kind: 'callout', tone: 'limitation', md: 'Pitchwise cannot see you. Posture, breath and tone are taught here but never graded — the app only ever measures the frequency you produce. Nothing in this course scores how you are standing.' },
          ],
        },
        {
          id: 'l2',
          title: 'Finding your range',
          kind: 'drill',
          estimatedMinutes: 8,
          completionRule: { kind: 'self_report' },
          blocks: [
            { kind: 'prose', md: 'Before anything else, find out which notes you actually have. Open **Tuner** from the top of the screen and sing a comfortable note — any note. The tuner names it.' },
            { kind: 'prose', md: 'Now walk downward a step at a time until the sound goes breathy or disappears, and note the lowest name you can hold steady for three seconds. Then do the same upward.' },
            { kind: 'score', spec: 'C4 D4 E4 F4 G4 F4 E4 D4 C4.', bpm: 76, caption: 'Walk down and up like this, one step at a time' },
            { kind: 'prose', md: 'Most untrained voices hold about an octave and a half comfortably. If yours is less today, that is normal and it moves — range is the slowest thing to change and the least worth worrying about early.' },
            { kind: 'callout', tone: 'note', md: 'Mark this lesson complete once you know your lowest and highest comfortable note. Nothing is recorded — this one is for you.' },
          ],
        },
      ],
    },
    {
      id: 'm2',
      title: 'Your first notes',
      lessons: [
        {
          id: 'l3',
          title: 'Your first three notes',
          kind: 'exercise',
          estimatedMinutes: 10,
          completionRule: { kind: 'attempt_score', minScore: 60 },
          inlineExercise: inline('First three notes', 'C4 D4 E4 D4 C4.', 80),
          blocks: [
            { kind: 'prose', md: 'Three notes, up and back. Sing them on any vowel you like — *ah* is easiest to keep open.' },
            { kind: 'score', spec: 'C4 D4 E4 D4 C4.', bpm: 80, caption: 'Press ▶ to hear it before you sing it' },
            { kind: 'prose', md: 'Listen first, then sing along with the metronome. The count-in gives you four beats before the first note.' },
            { kind: 'callout', tone: 'note', md: 'Aim for **steady**, not loud. A quiet note held straight scores better than a strong one that wobbles, because the app measures the frequency you land on and how much of the note you actually held.' },
          ],
        },
        {
          id: 'l4',
          title: 'Note names and the staff',
          kind: 'quiz',
          estimatedMinutes: 9,
          completionRule: { kind: 'quiz_pass', minFraction: 0.75 },
          blocks: [
            { kind: 'prose', md: 'The five lines and four spaces are a **staff**. A note sits on a line or in a space, and where it sits is which note it is. Higher on the staff means higher in pitch — the picture is literal.' },
            { kind: 'score', spec: 'C4 D4 E4 F4 G4 A4 B4 C5.', bpm: 100, caption: 'C4 up to C5, one step per note' },
            { kind: 'prose', md: 'The curly sign at the start is a **treble clef**. It fixes the reference: the line it curls around is G above middle C. Everything else follows from that one anchor.' },
            { kind: 'prose', md: '**Middle C** sits just below the staff on its own short line, called a ledger line. It is the note everything else is usually counted from.' },
            { kind: 'score', spec: 'C4.', bpm: 100, playable: true, caption: 'Middle C, on its ledger line' },
            { kind: 'prose', md: 'The number after a note name is its octave: C4 is middle C, C5 is the C above it, C3 the C below. Pitchwise uses these names everywhere — on the tuner, on the scorecard, and here.' },
          ],
          quiz: {
            version: 1,
            passFraction: 0.75,
            questions: [
              {
                id: 'q1',
                prompt: 'Which note is this?',
                score: { spec: 'C4.', bpm: 100 },
                choices: ['C4 — middle C', 'E4', 'G4', 'A3'],
                answerIndex: 0,
                explain: 'Middle C sits on its own ledger line just below the treble staff.',
              },
              {
                id: 'q2',
                prompt: 'Which note is this?',
                score: { spec: 'G4.', bpm: 100 },
                choices: ['C4', 'E4', 'G4', 'B4'],
                answerIndex: 2,
                explain: 'G4 sits on the second line up — the line the treble clef curls around.',
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
        {
          id: 'l5',
          title: 'Your first scale',
          kind: 'exercise',
          estimatedMinutes: 12,
          completionRule: { kind: 'attempt_score', minScore: 60 },
          exerciseSlug: 'c-major-five-note',
          blocks: [
            { kind: 'prose', md: 'Five notes up, five back down, ending on a long C. This is the same shape you walked through by ear in lesson 2 — now you can see it and be scored on it.' },
            { kind: 'score', spec: 'C4 D4 E4 F4 G4 F4 E4 D4 C4.', bpm: 90, caption: 'C major, five notes — 90 bpm' },
            { kind: 'callout', tone: 'note', md: 'The last note is held for two beats. Hold it all the way — a note released early reads as low coverage, which the scorecard reports separately from being out of tune.' },
          ],
        },
      ],
    },
    {
      id: 'm3',
      title: 'Playing music',
      lessons: [
        {
          id: 'l6',
          title: 'Singing in time',
          kind: 'exercise',
          estimatedMinutes: 10,
          completionRule: { kind: 'attempt_any' },
          exerciseSlug: 'five-note-descending-warmup',
          blocks: [
            { kind: 'prose', md: 'A metronome click is a fixed grid. Your job is to change note exactly when it clicks — not just to sing the right notes in the right order.' },
            { kind: 'score', spec: 'G4 F4 E4 D4 C4 G4 F4 E4 D4 C4.', bpm: 76, caption: 'Descending five-note warm-up — 76 bpm, slow on purpose' },
            { kind: 'prose', md: 'Slow tempos are harder than fast ones, because there is more empty time in which to drift. If you find this uncomfortable, that is the exercise working.' },
            { kind: 'callout', tone: 'limitation', md: 'Timing is **not scored yet**. Rhythm scoring is built but deliberately switched off until the app\'s audio latency has been measured — scoring you against a delay the app has not measured would be scoring you for its own lag. This lesson completes on any attempt.' },
          ],
        },
        {
          id: 'l7',
          title: 'A simple melody',
          kind: 'exercise',
          estimatedMinutes: 12,
          completionRule: { kind: 'attempt_score', minScore: 55 },
          inlineExercise: inline('A simple melody', 'E4 D4 C4 D4 E4 E4 E4. D4 D4 D4. E4 G4 G4.', 96),
          blocks: [
            { kind: 'prose', md: 'Everything so far has gone up or down in order. A melody does not — it moves in steps *and* skips, and the skips are where intonation usually slips first.' },
            { kind: 'score', spec: 'E4 D4 C4 D4 E4 E4 E4. D4 D4 D4. E4 G4 G4.', bpm: 96, caption: 'You will recognise this one' },
            { kind: 'prose', md: 'Notice the repeated notes and the longer notes at the end of each phrase. Sing the repeats cleanly separated rather than sliding through them, and give the long notes their full length.' },
            { kind: 'callout', tone: 'note', md: 'The pass mark here is lower than the scale lessons. Skips are genuinely harder, and a first melody should not be a wall.' },
          ],
        },
        {
          id: 'l8',
          title: 'Where to go next',
          kind: 'content',
          estimatedMinutes: 4,
          completionRule: { kind: 'read' },
          blocks: [
            { kind: 'prose', md: 'You have sung a scale, read a staff, and held a melody against a click. That is the whole beginner loop — everything after this is the same loop with harder material.' },
            { kind: 'prose', md: 'Three things worth doing next, in order of how much they will help:\n\n1. **Repeat lesson 5 daily for a week.** Intonation improves through repetition at a tempo you can already manage, not through new exercises.\n2. **Use the tuner without an exercise.** Sing a note, look, adjust. Two minutes of this is worth an hour of guessing.\n3. **Try the interval drill and the arpeggio** from the exercise library. Both are in your range and both are harder than anything here.' },
            { kind: 'callout', tone: 'note', md: 'Courses for the other instruments are listed in the catalog and are not written yet. This one exists to prove the shape.' },
          ],
        },
      ],
    },
  ],
};

/**
 * The catalog: every instrument in the profile list gets a course entry, and
 * all but one are unpublished. Listing them is not a promise that they exist —
 * an unpublished course cannot be opened and says so.
 */
export const COURSES: Course[] = [
  VOICE_TENOR,
  ...INSTRUMENT_PROFILES
    .filter((p) => p.id !== 'voice_tenor')
    .map((p): Course => ({
      id: `course-${p.id}`,
      slug: `${p.id.replace(/_/g, '-')}-starter`,
      title: `${p.displayName} — starter course`,
      summary: 'Setup, tuning, first notes, reading notation, and a first melody.',
      instrumentId: p.id,
      level: 1,
      isPublished: false,
      modules: [],
    })),
];

export const courseBySlug = (slug: string): Course | undefined =>
  COURSES.find((c) => c.slug === slug);
