/**
 * Per-instrument course overrides. The shared skeleton is in generate.ts; this
 * file is the part that genuinely differs per instrument — how you hold it, how
 * you tune it, what its notation does that the staff alone does not explain, and
 * where to go when the course ends.
 *
 * Written by hand, per ADR-011. These are starter courses and say so: enough to
 * get a beginner producing correct notes in tune, not a substitute for a
 * teacher. Anything the engine cannot grade carries a `limitation` callout
 * (LEARNING_PLATFORM §2), which is what keeps twelve shallow courses honest
 * rather than thin.
 */
import type { InstrumentCourse } from './generate';
import type { Block } from './types';

const CANNOT_SEE: Block = {
  kind: 'callout',
  tone: 'limitation',
  md: 'Pitchwise scores pitch only. Posture, breath and hand position matter and are taught here, but the app hears you rather than seeing you — it cannot tell you whether your technique is right.',
};

const nextSteps = (what: string): Block[] => [
  { kind: 'prose', md: `Three things worth doing next, in order of how much they will help:\n\n1. **Repeat lesson 5 daily for a week.** Intonation improves through repetition at a tempo you can already manage, not through new material.\n2. **Use the tuner with no exercise attached.** ${what} Two minutes of this is worth an hour of guessing.\n3. **Try the interval drill and the arpeggio** from the practice screen. Both are harder than anything here.` },
  { kind: 'callout', tone: 'note', md: 'This is a starter course. It ends where a real curriculum begins — with a teacher, or with material chosen for what you specifically find hard.' },
];

// ---- voice -------------------------------------------------------------

const voice = (id: string, name: string, range: string, low: string, high: string,
                rangeShift: number): InstrumentCourse => ({
  instrumentId: id,
  name,
  verb: 'sing',
  clef: rangeShift < 0 ? 'bass' : 'treble',
  rangeShift,
  notationShift: 0,
  meet: [
    { kind: 'prose', md: 'Your voice is the only instrument you cannot put down, adjust, or hand to a repair shop. Everything that makes a note happen — the air, the vibration, the resonance — is inside you, which is why singing in tune is mostly a matter of *hearing* accurately rather than *doing* something precisely.' },
    { kind: 'prose', md: 'Three things make a sung note:\n\n- **Breath.** Air moving steadily past the vocal folds. Unsteady air is the single most common cause of a wandering pitch.\n- **The folds themselves.** They vibrate at a rate you control largely by ear, not by feel.\n- **Resonance.** The shape of your mouth and throat, which changes the tone colour but not the pitch.' },
    { kind: 'prose', md: `Stand or sit so your ribs are free. Feet flat, shoulders down, chin level — not lifted. A lifted chin tightens the throat and flattens your top notes, and you will hear it on the trace later in this course.` },
    { kind: 'prose', md: `This course is pitched for **${name.replace('Voice — ', '')}** — roughly ${range}. If the exercises sit uncomfortably high or low, you may be a different voice type; try another of the voice courses rather than forcing these.` },
    CANNOT_SEE,
  ],
  tune: [
    { kind: 'prose', md: 'A voice has no tuning pegs. What it has instead is a range, and knowing yours is the equivalent step — it tells you which music is yours to sing today.' },
    { kind: 'prose', md: `Open **Tuner** from the top of the screen and sing a comfortable note — any note. The tuner names it. Now walk downward a step at a time until the sound goes breathy or disappears, and note the lowest name you can hold steady for three seconds. Then do the same upward.` },
    { kind: 'prose', md: `A ${name.replace('Voice — ', '')} typically sits around **${low} to ${high}**. Most untrained voices hold about an octave and a half comfortably. If yours is less today, that is normal and it moves — range is the slowest thing to change and the least worth worrying about early.` },
  ],
  tuneDrill: 'Mark this lesson complete once you know your lowest and highest comfortable note. Nothing is recorded — this one is for you.',
  next: nextSteps('Sing a note, look at the reading, adjust.'),
});

// ---- the catalogue -----------------------------------------------------

export const INSTRUMENT_COURSES: InstrumentCourse[] = [
  voice('voice_soprano', 'Voice — soprano', 'C4–C6', 'C4', 'C6', 0),
  voice('voice_alto', 'Voice — alto', 'F3–F5', 'F3', 'F5', 0),
  voice('voice_tenor', 'Voice — tenor', 'C3–C5', 'C3', 'C5', 0),
  voice('voice_bass', 'Voice — bass', 'E2–E4', 'E2', 'E4', -12),

  {
    instrumentId: 'flute',
    name: 'Flute',
    verb: 'play',
    clef: 'treble',
    rangeShift: 0,
    notationShift: 0,
    meet: [
      { kind: 'prose', md: 'The flute is three pieces: the **headjoint** you blow across, the **body** with most of the keys, and the **footjoint** with the last few. Twist them together gently — never force a joint, and never grip the keys while you do it, because the rods bend and the pads stop sealing.' },
      { kind: 'prose', md: 'Line the hole in the headjoint up with the first key on the body. Then bring the flute to you rather than leaning toward it: head level, left arm across the front, right elbow relaxed down.' },
      { kind: 'prose', md: 'The sound comes from air splitting on the far edge of the hole — like blowing across a bottle. Rest the near edge in the dip below your lower lip, aim a narrow stream of air across, and adjust the angle until the tone clears. This takes most people a few sessions. It is normal for nothing at all to happen at first.' },
      { kind: 'callout', tone: 'note', md: 'If no note sounds, the problem is nearly always the air angle, not the fingering. Roll the headjoint very slightly in or out and try again.' },
      CANNOT_SEE,
    ],
    tune: [
      { kind: 'prose', md: 'A flute is tuned by how far the headjoint is pushed in. Further in raises the pitch; further out lowers it. A few millimetres is a lot.' },
      { kind: 'prose', md: 'Warm up first — a cold flute plays flat, and tuning cold guarantees you will be sharp ten minutes later. Play for a minute or two, then open **Tuner**, play A4, and adjust the headjoint until the reading sits near zero.' },
      { kind: 'callout', tone: 'warning', md: 'Blowing harder also raises the pitch. Tune with the air you actually use to play, not with a careful special breath, or the instrument will be in tune only when you are being careful.' },
    ],
    tuneDrill: 'Mark this complete once you can get A4 within about ten cents of centre and hold it there for three seconds.',
    next: nextSteps('Play a note, look at the reading, adjust your air.'),
  },

  {
    instrumentId: 'clarinet_bb',
    name: 'Clarinet (B♭)',
    verb: 'play',
    clef: 'treble',
    rangeShift: 0,
    notationShift: 2,
    notationNote: 'The clarinet is a **transposing instrument**. The note you read is not the note that sounds: written C sounds B♭, a tone lower. This is normal and every clarinet part in the world is written this way. The staff above shows what you read; the tuner shows what actually sounds, so the two will disagree by a tone — that is correct, not a fault.',
    meet: [
      { kind: 'prose', md: 'Five pieces: **mouthpiece**, **barrel**, **upper joint**, **lower joint**, **bell**. Cork grease on every joint, and twist rather than push — the bridge key between the two joints bends if you force them together misaligned.' },
      { kind: 'prose', md: 'The **reed** is the part that makes the sound, and it is fragile. Soak it in your mouth for a minute before playing. Line its tip exactly level with the tip of the mouthpiece — a hair too high and nothing sounds, a hair too low and it squeaks — then hold it with the ligature just tight enough not to slip.' },
      { kind: 'prose', md: 'Top teeth on the mouthpiece, lower lip cushioned over the bottom teeth, corners of the mouth firm. Take in about a centimetre of mouthpiece. Blow steadily rather than hard.' },
      { kind: 'callout', tone: 'note', md: 'Squeaks are almost always the reed, the amount of mouthpiece in your mouth, or a leaking finger. Check those three in that order.' },
      CANNOT_SEE,
    ],
    tune: [
      { kind: 'prose', md: 'A clarinet is tuned at the **barrel** — pull it out slightly to lower the pitch, push it in to raise it. Millimetres matter.' },
      { kind: 'prose', md: 'Warm the instrument first by playing for a minute; a cold clarinet is flat. Then open **Tuner** and play your written C — remember it will read as B♭, because the instrument transposes. Adjust the barrel until that reading is steady and central.' },
      { kind: 'callout', tone: 'warning', md: 'Biting harder raises the pitch and thins the tone. If you are sharp, loosen the embouchure before you touch the barrel.' },
    ],
    tuneDrill: 'Mark this complete once you can hold a steady note within about ten cents of centre for three seconds.',
    next: nextSteps('Play a note, look at the reading, and notice what your embouchure does to it.'),
  },

  {
    instrumentId: 'trumpet_bb',
    name: 'Trumpet (B♭)',
    verb: 'play',
    clef: 'treble',
    rangeShift: 0,
    notationShift: 2,
    notationNote: 'The trumpet is a **transposing instrument**. The note you read is not the note that sounds: written C sounds B♭, a tone lower. Every trumpet part is written this way. The staff above shows what you read; the tuner shows what sounds, so the two disagree by a tone — that is correct, not a fault.',
    meet: [
      { kind: 'prose', md: 'The trumpet is one piece plus a **mouthpiece**, which you drop in and twist very gently. Never hammer it in — a stuck mouthpiece needs a workshop tool to remove, and pulling at it bends the receiver.' },
      { kind: 'prose', md: 'Left hand holds the weight, right-hand fingertips rest on the valve buttons — fingers curved, not flat. Keep the instrument up, roughly level. Pointing it at the floor closes your throat.' },
      { kind: 'prose', md: 'The sound is your **lips buzzing**, amplified. Practise the buzz without the instrument first: lips together, corners firm, blow until they vibrate. Then buzz into the mouthpiece alone, then into the trumpet. Skipping this step is the most common reason a beginner gets no sound at all.' },
      { kind: 'prose', md: 'Which note you get depends on how fast the lips buzz, not only on the valves. The same fingering gives several notes — that is the instrument working as intended, and it is why ear training matters more here than on a keyboard.' },
      CANNOT_SEE,
    ],
    tune: [
      { kind: 'prose', md: 'A trumpet is tuned at the **main tuning slide** — the large U-shaped slide nearest you. Pull it out to lower the pitch, push it in to raise it.' },
      { kind: 'prose', md: 'Warm up first: a cold trumpet is flat, and the pitch will drift upward for the first few minutes. Then open **Tuner** and play your written C, which sounds B♭. Adjust the slide until the reading is central.' },
      { kind: 'callout', tone: 'warning', md: 'Pressing harder or blowing harder both raise the pitch. Tune with normal playing effort, not with a forced note.' },
    ],
    tuneDrill: 'Mark this complete once you can hold a steady note within about ten cents of centre for three seconds.',
    next: nextSteps('Play a note, look at the reading, and notice how much your lips alone change it.'),
  },

  {
    instrumentId: 'violin',
    name: 'Violin',
    verb: 'play',
    clef: 'treble',
    rangeShift: 0,
    notationShift: 0,
    meet: [
      { kind: 'prose', md: 'The violin sits on your **collarbone**, not your shoulder, held by the weight of your head rather than by your left hand. If your left hand is holding the instrument up, it cannot move freely, and every note after the first will fight you.' },
      { kind: 'prose', md: 'The left hand stays loose: thumb opposite the first finger, fingertips falling onto the string rather than pressing. The wrist stays straight — a collapsed wrist is the most common cause of a beginner being unable to reach the higher fingers.' },
      { kind: 'prose', md: 'The bow is held with a curved thumb under the frog and rounded fingers over the stick. New bow hair needs **rosin** or it will make no sound at all. Draw the bow parallel to the bridge, about halfway between bridge and fingerboard, using arm weight rather than pressure.' },
      { kind: 'prose', md: 'The four strings, lowest to highest, are **G3 D4 A4 E5**. Everything in first position is within reach of those four plus four fingers.' },
      { kind: 'callout', tone: 'note', md: 'A scratchy sound usually means too much pressure or a bow drifting toward the bridge. Lighten, and bring the bow back parallel.' },
      CANNOT_SEE,
    ],
    tune: [
      { kind: 'prose', md: 'The violin has **pegs** at the scroll for large adjustments and **fine tuners** at the tailpiece for small ones. Use the fine tuners wherever you can — pegs move suddenly and a slipped peg can snap a string.' },
      { kind: 'prose', md: 'Open **Tuner** and bow each open string in turn: **G3, D4, A4, E5**. Turn the fine tuner clockwise to raise the pitch, anticlockwise to lower it. Bow steadily while you adjust — an uneven bow makes the reading jump and you will chase it.' },
      { kind: 'callout', tone: 'warning', md: 'Tune up to a note rather than down to it. Approaching from below takes the slack out of the string and the tuning holds better.' },
    ],
    tuneDrill: 'Mark this complete once all four open strings read within about ten cents of centre.',
    next: nextSteps('Bow an open string, look at the reading, and watch what a change of bow pressure does to it.'),
  },

  {
    instrumentId: 'cello',
    name: 'Cello',
    verb: 'play',
    clef: 'bass',
    rangeShift: -12,
    notationShift: 0,
    meet: [
      { kind: 'prose', md: 'Sit at the front of the chair with both feet flat. Set the **endpin** so the cello leans into your chest and the top of the fingerboard is near your left ear — too short and you will hunch, too long and the instrument slides away from you.' },
      { kind: 'prose', md: 'The knees hold the lower bouts lightly. The instrument should stay put if you take both hands off it; if it does not, the endpin length or the angle is wrong, and everything you do with your hands will be spent holding it up instead.' },
      { kind: 'prose', md: 'Left-hand fingers curve onto the string with a straight wrist and the thumb behind the neck. The bow is held with a curved thumb and rounded fingers, drawn parallel to the bridge using arm weight — not grip.' },
      { kind: 'prose', md: 'The four strings, lowest to highest, are **C2 G2 D3 A3**. Cello music is written in the **bass clef**, which is why the staves in this course look different from the violin or flute ones.' },
      CANNOT_SEE,
    ],
    tune: [
      { kind: 'prose', md: 'Large adjustments at the **pegs**, small ones at the **fine tuners** on the tailpiece. Most cellos have a fine tuner on every string; use them.' },
      { kind: 'prose', md: 'Open **Tuner** and bow each open string: **C2, G2, D3, A3**. Bow steadily while adjusting — an uneven bow makes the reading jump.' },
      { kind: 'callout', tone: 'warning', md: 'The low C is near the bottom of what the app can detect reliably. If it reads as nothing rather than as a wrong note, that is the detector declining to guess — tune it by ear against the G, or with the fine tuner while watching the reading flicker in and out.' },
    ],
    tuneDrill: 'Mark this complete once all four open strings read within about ten cents of centre, or you have tuned the low C by ear against the others.',
    next: nextSteps('Bow an open string, look at the reading, and watch what bow pressure does to it.'),
  },

  {
    instrumentId: 'guitar',
    name: 'Guitar (melody)',
    verb: 'play',
    clef: 'treble',
    rangeShift: -12,
    notationShift: 12,
    notationNote: 'Guitar music is written **an octave above where it sounds**. A written C4 on the guitar staff produces the pitch C3. This is a convention, not a mistake — it keeps guitar music on a treble staff instead of covered in ledger lines. The staff above shows what you read; the tuner shows the pitch that actually sounds, an octave lower.',
    meet: [
      { kind: 'prose', md: 'Sit with the guitar on the leg nearer the neck, or use a strap. The neck should angle slightly upward. Keep the body of the guitar against you so you are not tilting it back to see the strings — once you tilt it, the fretting hand loses its angle and everything gets harder.' },
      { kind: 'prose', md: 'The fretting hand presses **just behind** a fret, not on top of it and not halfway between. Fingertips, not pads. Thumb behind the neck, roughly opposite the second finger. A buzzing note is almost always a finger too far from the fret or not quite upright.' },
      { kind: 'prose', md: 'The picking hand can use a plectrum or fingers. For this course use whichever you find easier — the notes are the same either way, one at a time.' },
      { kind: 'prose', md: 'The six strings, lowest to highest, are **E2 A2 D3 G3 B3 E4**. This starter course stays on single notes; chords come at the end.' },
      CANNOT_SEE,
    ],
    tune: [
      { kind: 'prose', md: 'Tune with the machine heads at the headstock. Turn slowly — a guitar string goes from flat to snapped faster than you expect, especially the top E.' },
      { kind: 'prose', md: 'Open **Tuner** and play each open string in turn: **E2, A2, D3, G3, B3, E4**. Let the string ring on its own rather than holding it, and read once the initial attack has settled — the first fraction of a second after a pluck is not a reliable pitch on any plucked string.' },
      { kind: 'callout', tone: 'warning', md: 'Tune up to a note rather than down to it, so the slack is out of the string. A new set of strings will drift for a day or two no matter how carefully you tune it.' },
    ],
    tuneDrill: 'Mark this complete once all six open strings read within about ten cents of centre.',
    next: nextSteps('Play a note, look at the reading, and check whether your fretting is pulling it sharp.'),
    chord: {
      title: 'Your first chord',
      blocks: [
        { kind: 'prose', md: 'Everything so far has been one note at a time, because that is what the app can measure. Guitar is not a one-note-at-a-time instrument, so here is the other half.' },
        { kind: 'prose', md: 'An **E minor** chord is the easiest first shape: second finger on the second fret of the A string, third finger on the second fret of the D string, and strum all six. Two fingers, and nothing to mute.' },
        { kind: 'prose', md: 'Press just behind the frets, arch your fingers so they do not touch the neighbouring strings, and strum slowly enough to hear each string. If one buzzes or thuds, it is being touched by the side of a finger — arch higher.' },
        { kind: 'prose', md: 'Then try **A minor**: first finger on the first fret of the B string, second on the second fret of the D string, third on the second fret of the G string, and strum from the A string down. Switch between the two until the change takes less than a bar.' },
        { kind: 'callout', tone: 'limitation', md: 'Pitchwise hears one note at a time, and a chord is several. Mark this complete yourself when the shapes ring cleanly.' },
      ],
    },
  },

  {
    instrumentId: 'bass',
    name: 'Bass (melody)',
    verb: 'play',
    clef: 'bass',
    rangeShift: -24,
    notationShift: 12,
    notationNote: 'Bass music is written **an octave above where it sounds**, on the bass clef. A written C3 produces the pitch C2. This is a convention that keeps bass parts readable rather than buried in ledger lines. The staff shows what you read; the tuner shows the pitch that sounds, an octave lower.',
    meet: [
      { kind: 'prose', md: 'A bass is longer and heavier than a guitar and rewards a strap even when sitting. Keep the neck angled up and the body against you; the reach to the first fret is genuinely long, and fighting the instrument’s balance costs you that reach.' },
      { kind: 'prose', md: 'Fret just behind the fret with fingertips, thumb behind the neck. On bass the spacing is wide enough that one finger per fret is a real stretch at first — take it slowly, and stop if your hand aches rather than playing through it.' },
      { kind: 'prose', md: 'Pluck with the first two fingers of the right hand, alternating, resting the thumb on the pickup. Alternating from the start is much easier than retraining later.' },
      { kind: 'prose', md: 'The four strings, lowest to highest, are **E1 A1 D2 G2**.' },
      { kind: 'callout', tone: 'warning', md: 'The low E is **below what this app can detect**. A 2048-sample window resolves down to about 47 Hz and low E is 41 Hz, so it will read as nothing rather than as a wrong note. That is the detector declining to guess — the exercises in this course stay above it.' },
      CANNOT_SEE,
    ],
    tune: [
      { kind: 'prose', md: 'Tune at the machine heads, slowly. Bass strings are under high tension and move less per turn than guitar strings, so small turns do more than you expect.' },
      { kind: 'prose', md: 'Open **Tuner** and play each open string: **E1, A1, D2, G2**. Let the note ring rather than holding it, and read after the attack settles.' },
      { kind: 'callout', tone: 'warning', md: 'The low E will likely show no reading at all, for the reason in the previous lesson. Tune it by ear against the A string — fifth fret of the E should match the open A.' },
    ],
    tuneDrill: 'Mark this complete once A, D and G read within about ten cents of centre and the low E is matched by ear.',
    next: nextSteps('Play a note, look at the reading, and check how much your fretting pressure moves it.'),
  },

  {
    instrumentId: 'piano',
    name: 'Piano (melody)',
    verb: 'play',
    clef: 'treble',
    rangeShift: 0,
    notationShift: 0,
    meet: [
      { kind: 'prose', md: 'Sit at the middle of the keyboard with your forearms roughly level with the keys. If your wrists have to rise to reach, the stool is too low, and every hour you play at the wrong height builds a habit you will have to undo.' },
      { kind: 'prose', md: 'Hands curved as if holding a small ball, fingertips on the keys, wrists loose and level. Play with the weight of the arm rather than by pressing with the fingers alone — the key only needs enough to sound it.' },
      { kind: 'prose', md: 'The black keys come in groups of **two** and **three**, and that pattern is how you find anything without looking. **Middle C** is the white key immediately to the left of a group of two, nearest the middle of the instrument. Find it now; every exercise in this course starts from it.' },
      { kind: 'prose', md: 'Number your fingers 1 to 5, thumb to little finger. This course stays in five-finger position with the right hand: thumb on middle C, and one finger per white key up to G.' },
      CANNOT_SEE,
    ],
    tune: [
      { kind: 'prose', md: 'A piano is the one instrument here you do **not** tune yourself. An acoustic piano is tuned once or twice a year by a technician; a digital piano is always in tune and has nothing to adjust.' },
      { kind: 'prose', md: 'So this lesson is the other half of the same idea: check that what you hear matches what the app hears. Open **Tuner**, play middle C, and confirm it reads C4 near the centre.' },
      { kind: 'prose', md: 'Then play up the five white keys from middle C — **C, D, E, F, G** — and watch the names appear. If the readings are steady and correct, the app and your instrument agree and you can trust the scores in the rest of this course.' },
      { kind: 'callout', tone: 'warning', md: 'If an acoustic piano reads consistently sharp or flat by more than about twenty cents, it is out of tune rather than you being wrong, and the exercise scores in this course will punish you for it. Worth a technician before going further.' },
    ],
    tuneDrill: 'Mark this complete once middle C reads C4 near centre and you can name the five white keys above it without looking at the screen.',
    next: nextSteps('Play a note, look at the reading, and confirm the instrument agrees with the app.'),
    chord: {
      title: 'Your first chord',
      blocks: [
        { kind: 'prose', md: 'Everything so far has been one note at a time, because that is what the app can measure. A piano is not a one-note-at-a-time instrument, so here is the other half.' },
        { kind: 'prose', md: 'A **C major triad**: thumb on middle C, third finger on E, fifth finger on G. Press all three together, with the same relaxed arm weight you have used for single notes.' },
        { kind: 'prose', md: 'Listen for whether all three sound at exactly the same moment. Unevenness is the thing to fix first, and it is easier to hear than to feel — play it, hold it, and listen to whether one note arrived late.' },
        { kind: 'prose', md: 'Then move the same shape up: **D F A**, then **E G B**. The hand shape does not change; only where it sits does.' },
        { kind: 'callout', tone: 'limitation', md: 'Pitchwise hears one note at a time, and a triad is three. Mark this complete yourself when they sound together cleanly. A MIDI keyboard could grade this exactly; that input is not built yet.' },
      ],
    },
  },
];
