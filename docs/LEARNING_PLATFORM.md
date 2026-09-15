# LEARNING_PLATFORM.md

**Project:** Pitchwise
**Status:** Draft v1.0
**Last updated:** 2026-09-15

Defines the learning layer that sits above the exercise library: courses, modules,
lessons, and progress. Introduced by **ADR-012**; the input abstraction it assumes is
**ADR-013**.

Related: `DATA_MODEL.md` §11 (schema), `API_SPEC.md` §15 (endpoints),
`REQUIREMENTS.md` §4.3 (user stories), `AUDIO_PIPELINE.md` §6 (instrument profiles).

---

## 1. What This Layer Is

Pitchwise v1 gives a user a flat library of five exercises and no reason to prefer one
over another. The learning layer supplies the missing structure: an ordered path through
instruction, practice, and checks, per instrument.

It is strictly **additive**. Exercises, attempts, scoring, bands and `note_results` are
unchanged. A lesson of kind `exercise` points at a row in `exercises`; everything
downstream of that pointer works exactly as it does today.

```
courses ──N── modules ──N── lessons
                               │
                               ├─ kind 'content'  → blocks (prose, diagram, listen)
                               ├─ kind 'exercise' → FK exercises ──→ attempts  (existing)
                               ├─ kind 'quiz'     → questions
                               └─ kind 'drill'    → self-reported practice
```

---

## 2. What Can and Cannot Be Graded

This table is the honest boundary of the product and should govern every claim made in
lesson copy. The audio engine is monophonic by ADR-004 and `MANIFEST.md`'s locked scope
constant; nothing in this layer changes that.

| Skill | Voice | Flute / Clarinet / Sax / Trumpet / Trombone | Violin / Viola / Cello | Guitar / Bass | Piano |
|---|---|---|---|---|---|
| Single-note pitch | Graded | Graded | Graded | Graded (melody) | Graded (melody) |
| Melody, note sequence | Graded | Graded | Graded | Graded | Graded |
| Rhythm / timing | Graded | Graded | Graded | Graded | Graded |
| Sustained-note steadiness | Graded | Graded | Graded | Graded | Graded |
| Chords, double stops | n/a | n/a | **Not graded** | **Not graded** | **Not graded** |
| Two-handed playing | n/a | n/a | n/a | n/a | **Not graded** |
| Strum / comp pattern | n/a | n/a | n/a | Timing only | n/a |
| Technique: posture, bowing, embouchure, hand shape | **Not graded** | **Not graded** | **Not graded** | **Not graded** | **Not graded** |
| Tone quality, vibrato | **Not graded** | **Not graded** | **Not graded** | **Not graded** | **Not graded** |
| Theory knowledge | Quiz | Quiz | Quiz | Quiz | Quiz |

**Not graded does not mean not taught.** A lesson may teach a guitar chord in full and
close with a `drill` the user marks complete themselves. What is forbidden is presenting
an ungraded lesson as though the app verified it.

**Strum timing** is the one partial case. Onset detection from the RMS envelope
(`AUDIO_PIPELINE.md` Stage B) can tell whether strums landed on the beat without knowing
which notes sounded. Whether this ships is `[TBM]` — it depends on the onset-suppression
frame count, still unmeasured.

**On chords and MIDI.** Per ADR-013 the engine grows a `NoteSource` abstraction now, so a
Web MIDI source can supply exact polyphonic note data later without touching the lesson
model. Every cell reading *Not graded* for chords becomes gradable for MIDI-capable
instruments on the day that source is built. Lesson content must not promise it before
then.

---

## 3. Lesson Kinds

| Kind | Body | Completion | Uses the audio engine |
|---|---|---|---|
| `content` | Blocks (§5) | Marked read | No |
| `exercise` | FK → `exercises` | An attempt meeting a threshold | Yes |
| `quiz` | Questions (§6) | Score at or above pass mark | No |
| `drill` | Blocks + instruction | Self-reported by the user | Optional |

Completion is data, not code. Each lesson carries a `completion_rule` so the rule is
authored with the lesson rather than branched on `kind` in the client:

```jsonc
{ "kind": "read" }
{ "kind": "attempt_score", "minScore": 70 }
{ "kind": "attempt_any" }
{ "kind": "quiz_pass", "minFraction": 0.8 }
{ "kind": "self_report" }
```

`attempt_score` is evaluated server-side against `attempts.overall_score` — the client
reports an attempt, it does not report a completion.

---

## 4. The Starter Course

Scope decision: **every instrument in the catalog gets one starter course, and nothing
deeper.** Breadth over depth is deliberate. The risk of that choice is a set of twelve
thin courses that teach nobody anything, and the mitigation is that they share one
skeleton and are named honestly — *Starter course*, never *Learn guitar*.

### 4.1 The skeleton

Eight lessons, identical in shape across every instrument. **All twelve courses are
written** and generated from this skeleton by `client/src/learning/generate.ts` plus the
per-instrument overrides in `content.ts` — the generator described in §4.4 and
`DATA_MODEL.md` §11.9.

| # | Lesson | Kind | Graded by | Varies by instrument |
|---|---|---|---|---|
| 1 | Meet your instrument | `content` | read | Fully — setup, care, posture, parts |
| 2 | Getting in tune / finding your pitch | `content` + `drill` | self-report, uses tuner mode | Partly — tuning method differs |
| 3 | Your first three notes | `exercise` | pitch | Transposition only |
| 4 | Note names and the staff | `content` + `quiz` | quiz | Clef and transposition only |
| 5 | Your first scale | `exercise` | pitch | Transposition only |
| 6 | Playing in time | `exercise` | pitch + timing | Transposition only |
| 7 | A simple melody | `exercise` | pitch + timing | Transposition only |
| 7b | Your first chord *(optional)* | `drill` | self-report | Guitar and piano only |
| 8 | Where to go next | `content` | read | Fully |

Lesson 2 is the first real use of tuner mode (US-08) inside a lesson, which is why tuner
mode moved off the cut list — see `REQUIREMENTS.md` §9.

Lesson 7b exists because a guitar starter course with no chord in it is not a guitar
course. It is taught and self-reported, and it says so.

### 4.2 Why this is affordable

Lessons 3, 5, 6 and 7 are the **five exercises that already exist**, transposed. The
`lowest_midi` / `highest_midi` columns in `DATA_MODEL.md` §3.5 were added for range
filtering and serve this directly.

Genuine per-instrument authoring is therefore:

| Item | Count | Note |
|---|---|---|
| Bespoke prose lessons (1, 2, 8) | 3 per instrument | Short — a few hundred words each |
| Diagram set | 1 per instrument | SVG, §5.2 |
| Transposition offset | 1 integer | Feeds exercise variant generation |
| Clef | 1 value | Lesson 4 only |
| Chord lesson (7b) | Guitar, piano only | 2 total |

Not ninety-six bespoke lessons. Roughly thirty-six short prose pieces plus a diagram set
each, over a shared frame.

### 4.3 Voice

Voice is not one instrument. The `instruments` catalog already splits it (`voice_alto`
and siblings), and each range gets its own course generated from the same skeleton with a
different transposition. Lessons 1 and 2 differ more from the instrumental versions than
those differ from each other — posture and breath rather than assembly and tuning.

### 4.4 Generation, not authoring

Courses are emitted at build time by a script that takes the skeleton plus a
per-instrument override file, exactly as `buildExercise` (`DATA_MODEL.md` §4.2) emits
exercise JSON. It is a seed generator, not an API endpoint and not part of the running
app. This follows ADR-011: hand-authored content, machine-assembled.

---

## 5. Lesson Content Blocks

Decision: lesson bodies are **sheet music, text, diagrams and generated audio**. No video.
Video means hosting, a player, and a per-instrument recording effort, and it is the one
content format that carries a recurring bill.

Sheet music is the centre of a lesson, not a decoration on one (ADR-015). Reading is a
substantial part of what a beginner is here to learn.

```jsonc
{
  "version": 1,
  "blocks": [
    { "kind": "prose",   "md": "Rest the guitar on your right thigh..." },
    { "kind": "score",   "spec": "C4 D4 E4 F4 G4.", "bpm": 90, "caption": "C major, five notes" },
    { "kind": "diagram", "id": "guitar-first-position", "caption": "First position" },
    { "kind": "callout", "tone": "note", "md": "If the string buzzes, press closer to the fret." }
  ]
}
```

| Block | Fields | Notes |
|---|---|---|
| `prose` | `md` | Restricted Markdown: emphasis, lists, links. No raw HTML |
| `score` | `spec`, `bpm`, `clef`, `timeSignature`, `caption`, `playable` | Engraved by VexFlow and playable. `spec` is the same compact string as an exercise (ADR-011) |
| `diagram` | `id`, `caption` | Resolves to an SVG asset by id, never by URL |
| `callout` | `tone`, `md` | `tone` is `note`, `warning`, or `limitation` |

The `listen` block from the first draft is **folded into `score`**: a block that sounds
notes but does not show them turned out to have no use in a lesson that teaches reading.

**`limitation` is a first-class callout tone.** Any lesson teaching something the app
cannot grade must carry one. That is how §2's boundary reaches the user instead of living
only in this document.

### 5.1 One authored source, three renderings

`spec` uses the same compact string as `buildExercise` — `"C4 D4 E4 F4 G4."`, `.` to
double a duration, `-` for a rest. One parser, and the string a lesson carries produces
all three of:

1. the engraved staff the learner reads,
2. the reference audio they hear when they press play,
3. the note sequence they are scored against, when the lesson is an exercise.

This is the point of ADR-015. Authoring the notation separately from the exercise would
make them two sources that can disagree — and they would, on the first tempo change nobody
propagated.

Playback is Web Audio, not Tone.js (ADR-014, ADR-015). **No audio files are shipped or
hosted**, which is what keeps the content format free to run. Reference audio is
synthesized from the same MIDI numbers the scoring uses, so it is in tune by construction
and inherits the A4 = 440 constant rather than restating it.

### 5.2 Diagrams

SVG files committed under `client/public/diagrams/<id>.svg`, referenced by `id`. Storing
an id rather than a path means the asset can move without a data migration, and a missing
diagram degrades to its caption rather than a broken image.

Photographs are deliberately excluded: they date, they weigh, and an SVG of a fingering is
clearer than a photograph of one.

---

## 6. Quizzes

Multiple choice and note identification only. No free text — grading free text is a
different product.

```jsonc
{
  "version": 1,
  "passFraction": 0.8,
  "questions": [
    {
      "id": "q1",
      "prompt": "Which note is this?",
      "kind": "choice",
      "diagram": "staff-treble-c4",
      "choices": ["C4", "E4", "G4", "A4"],
      "answerIndex": 0,
      "explain": "Middle C sits on the first ledger line below the treble staff."
    }
  ]
}
```

`answerIndex` and `explain` are **stripped from the API response** until the quiz is
submitted — see `API_SPEC.md` §15.4. Shipping answers to the client alongside the question
would make the quiz decorative.

---

## 7. Progress

Two tables (`DATA_MODEL.md` §11): enrollment per course, and one row per user per lesson.

| State | Meaning |
|---|---|
| `not_started` | No row, or explicitly reset |
| `in_progress` | Opened, or at least one failing attempt |
| `complete` | `completion_rule` satisfied |

Rules:

- **Progress is server-evaluated.** The client posts an attempt or a quiz submission; the
  server decides whether the lesson is complete. A client that could self-declare
  completion makes the whole progress model advisory.
- **Completion is sticky.** A later worse attempt does not un-complete a lesson.
  `best_attempt_id` records the attempt that satisfied the rule.
- **Lessons unlock in order within a module**, and modules within a course. Sequencing is
  the reason this layer exists; free navigation would make it a list again.
- **A completed lesson stays open.** Unlocking is forward-only, never a lockout.

`engine_version` on `attempts` already exists to keep scores comparable across detector
changes (`DATA_MODEL.md` §3.6). A completion earned under an older engine stands — it is
not recomputed, because the audio is gone by ADR-001 and cannot be.

---

## 8. Screens Added

On top of the eight already outstanding in `README.md`:

| Screen | Notes |
|---|---|
| Course catalog | Filtered by the user's instruments, all courses browsable |
| Course detail | Modules, lessons, progress, next action |
| Lesson: content | Block renderer — prose, diagram, listen, callout |
| Lesson: quiz | Question, submit, explanation |
| Lesson: drill | Instruction plus self-report control |
| Lesson: exercise | Wraps the existing practice-take screen with lesson chrome |

The exercise lesson is chrome, not a second practice screen. Building two would be the
obvious mistake here.

---

## 9. Deliberately Not Built

| Item | Why |
|---|---|
| Video lessons | Recurring hosting cost; §5 |
| Polyphonic audio grading | ADR-004, locked scope constant. MIDI is the path, ADR-013 |
| Technique assessment | No signal for it; §2 |
| Certificates, streaks, badges | Engagement mechanics, not learning. Revisit only with evidence |
| User-authored courses | US-12 is not built for exercises yet; courses cannot precede it |
| Spaced repetition / adaptive ordering | Needs attempt volume that does not exist yet |
| Free-text quiz answers | §6 |

---

## 10. Open Items

- [ ] Strum-timing grading — viable only if onset suppression measures well. `[TBM]`
- [ ] `minScore` for `attempt_score` completion. Provisional 70, unvalidated against real
      beginner attempts. A threshold set too high turns a starter course into a wall
- [ ] Whether lesson 2 can auto-complete from tuner-mode frames instead of self-report
- [ ] Clef and transposition values per instrument — derive from `AUDIO_PIPELINE.md` §6
      rather than restating them here
- [x] ~~Whether the twelve starter courses ship at once or in tranches~~ **All twelve at once.** The shared skeleton made the marginal cost of the eleventh course small enough that staggering them bought nothing, and a catalog advertising courses that do not exist is worse than no catalog. `courses.is_published` stays in the schema for future courses
