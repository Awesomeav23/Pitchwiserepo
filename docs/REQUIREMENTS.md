# REQUIREMENTS.md

**Project:** Pitchwise — real-time pitch feedback for voice and melodic instruments
**Owner:** Avnish Ozarkar
**Status:** Draft v1.0
**Last updated:** 2026-09-15

---

## 1. Product Statement

Pitchwise is a web application that listens to a user play or sing an exercise and tells
them, in real time, whether they are hitting the right notes. The user selects a lesson
(a scale, an interval drill, a vocal warm-up), plays or sings along to a metronome, and
watches their detected pitch traced against the target pitch on screen. When the take
ends, they receive a per-note scorecard — how many cents sharp or flat on each note, how
many milliseconds early or late — and that attempt is stored so improvement is visible
over weeks rather than guessed at.

The same analysis engine serves voice and any monophonic instrument, because a sung A4
and a flute A4 are both 440 Hz. The detector does not care what produced the sound.

Around that trainer sits a **learning layer** (ADR-012): every instrument in the
catalog has a starter course that teaches setup, tuning, first notes, basic notation
and a first melody, with the exercises above as its graded practice steps. The trainer
tells a user whether they hit the note; the courses tell them which note to go for and
why. Model in `LEARNING_PLATFORM.md`.

---

## 2. Scope

### 2.1 In Scope

| Area | Included |
|---|---|
| Input sources | Voice; any instrument played one note at a time |
| Instruments | Flute, recorder, clarinet, saxophone, trumpet, trombone, violin, viola, cello, guitar (melody), bass (melody), piano (melody) |
| Analysis | Monophonic fundamental-frequency detection, client-side, real time |
| Scoring | Per-note pitch deviation in cents; per-note timing offset in milliseconds |
| Persistence | User accounts, saved attempts, attempt history |
| Content | Hand-authored exercise library (scales, intervals, warm-ups) |
| Courses | One starter course per catalog instrument: text lessons, SVG diagrams, synthesized reference audio, theory quizzes, and graded practice steps |
| Progress | Server-evaluated lesson completion, ordered unlocking, per-course progress |
| Input | Audio via microphone. A `NoteSource` abstraction exists for a future MIDI source (ADR-013); no MIDI source is built |
| Delivery | Deployed, publicly reachable web app |

### 2.2 Out of Scope

| Excluded | Reason |
|---|---|
| Polyphonic detection (chords, strummed guitar, two-handed piano) | Real-time multi-pitch detection is an open research problem requiring ML models; out of proportion to this project |
| Drums / unpitched percussion | No fundamental frequency to detect |
| Timbre, tone quality, or vibrato scoring | Subjective and out of scope for a pitch tool |
| Audio recording playback / storage | Avoids storage cost and privacy surface; analysis is client-side and audio never leaves the browser |
| Native mobile apps | Web only |
| Social feed, sharing, multiplayer | Not core to the practice loop |
| Sheet-music import (MusicXML, PDF) | Exercises are hand-authored JSON in v1 |
| Video lessons | Recurring hosting cost against a free-tier budget; lessons are text, SVG and synthesized audio |
| Grading of chords, two-handed playing, strum correctness | Follows from monophonic audio analysis. Taught and self-reported, never presented as graded. `LEARNING_PLATFORM.md` §2 |
| Web MIDI input | Deferred, not rejected — the abstraction is built, the source is not (ADR-013) |
| User-authored courses | US-12 (custom exercises) is not built; courses cannot precede it |

**Scope statement for public-facing copy:** Pitchwise is a single-note practice tool for
voice and melodic instruments, with starter courses that teach the basics of each. This is
a product decision, not a deficiency — a pitch trainer is inherently about one note at a
time.

**The courses must not overclaim.** They are starter courses, never "learn guitar". Any
lesson teaching something the engine cannot grade carries a `limitation` callout saying so
(`LEARNING_PLATFORM.md` §5). Twelve shallow courses that are honest about their depth are
defensible; twelve that imply mastery are not.

---

## 3. Users

| Persona | Need |
|---|---|
| Self-taught singer | Objective feedback on pitch without a teacher in the room |
| Instrument student between lessons | Structured practice with immediate correction |
| Returning musician | Rebuild ear and intonation; track progress |

Secondary (post-MVP): a teacher who assigns exercises and reviews student attempt history.

---

## 4. User Stories

### 4.1 MVP

- **US-01** As a new user, I can create an account and select my primary instrument (or voice) so that exercises and analysis are tuned to my range.
- **US-02** As a user, I can browse a library of exercises and see each one's notes before attempting it.
- **US-03** As a user, I can grant microphone access and see my current detected pitch displayed live.
- **US-04** As a user, I can start an exercise with a metronome count-in and play or sing along.
- **US-05** As a user, I can see my pitch traced against the target pitch in real time while I play.
- **US-06** As a user, I receive a scorecard at the end of an attempt showing per-note pitch deviation in cents.
- **US-07** As a user, my attempts are saved and I can view a history of past attempts for each exercise.
- **US-08** As a user, I can use a standalone tuner mode that shows detected pitch and deviation with no exercise attached.

### 4.2 Post-MVP (Stretch)

- **US-09** As a user, I receive timing feedback (milliseconds early/late) alongside pitch feedback.
- **US-10** As a user, I see exercises rendered as standard musical notation, not only as a piano roll.
- **US-11** As a user, I see aggregate trends across attempts (e.g. consistent flatness in a given register).
- **US-12** As a user, I can author a custom exercise by entering a note sequence.
- **US-13** As a teacher, I can assign exercises to a student and review their attempt history.

---

### 4.3 Learning Platform (ADR-012)

- **US-14** As a user, I can browse starter courses and see the one for each instrument I play.
- **US-15** As a user, I can work through a course in order, with later lessons locked until earlier ones are complete.
- **US-16** As a user, I can read a lesson with diagrams and hear its example notes played back in tune.
- **US-17** As a user, practising a lesson's exercise counts toward completing that lesson when I score well enough.
- **US-18** As a user, I can answer a short theory quiz and see an explanation for every question afterwards.
- **US-19** As a user, I can mark a self-reported drill complete for things the app tells me plainly it cannot grade.

---

## 5. Success Criteria

### 5.1 Functional

- [ ] End-to-end loop works: select exercise → record → live feedback → scorecard → persisted attempt.
- [ ] At least 5 exercises seeded, covering at least 2 exercise types.
- [ ] At least 3 instrument profiles configured plus voice.
- [ ] Deployed and reachable at a public URL.
- [ ] Graceful handling of denied or unavailable microphone permission.
- [ ] At least one complete starter course end to end: enroll → lessons unlock in order → quiz graded → exercise attempt completes a lesson → course shows complete.
- [ ] Every ungraded lesson carries a visible `limitation` callout. No lesson implies the app verified something it did not.
- [ ] Lesson completion cannot be set by the client for graded lesson kinds.

### 5.2 Measured

These are targets, to be verified against the spike and final build. Figures marked
`[TBM]` are To Be Measured — do not quote them anywhere until measured.

| Metric | Target | Measured |
|---|---|---|
| Mic-to-display latency | < 50 ms | `[TBM]` |
| Pitch accuracy vs. reference tone | within ±5 cents | `[TBM]` |
| Octave-error rate, post-filtering | < 1% of voiced frames | `[TBM]` |
| Octave-error rate, pre-filtering (baseline) | — | `[TBM]` |
| Sustained CPU during analysis | does not drop UI below 60 fps | `[TBM]` |

**Measurement method** is defined in `AUDIO_PIPELINE.md` §7. Latency is measured from
buffer capture timestamp to canvas paint. Accuracy is measured against a synthesized
reference tone of known frequency, not against live playing.

### 5.3 Non-Goals as Criteria

The project is not judged on: exercise library size, visual design sophistication,
number of supported instruments, or user count.

---

## 6. Constraints

| Constraint | Detail |
|---|---|
| Timeline | **Superseded by ADR-012.** The original 5 weeks covered the trainer alone. The learning layer adds six screens to the eight already outstanding, with one built. No revised estimate is recorded here rather than a guessed one |
| Team | Solo |
| Budget | Free tiers only (hosting, database, auth) |
| Browser support | Chromium and Firefox desktop. Safari best-effort — AudioWorklet support is present but historically quirky. Mobile out of scope for v1. |
| Privacy | Audio is analyzed in the browser and is never transmitted or stored. Only derived numeric results (frequencies, deviations) are persisted. |

---

## 7. Assumptions

- The user has a working microphone and plays in a reasonably quiet room.
- The user follows the metronome; v1 rhythm scoring assumes no significant tempo drift.
- Users are on desktop with a modern browser.
- Exercise content is authored by hand for v1; no import pipeline is needed.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| AudioWorklet proves harder than budgeted | Blocks everything downstream | Spike it in week 1 day 1–2, before writing any other code. If not working by end of day 3, escalate: reduce scope to tuner-mode-only |
| Octave errors remain visible after filtering | Damages perceived accuracy | Narrow per-instrument frequency range; tune median filter window; documented in `AUDIO_PIPELINE.md` §5 |
| Guitar/piano attack transients produce garbage frames at onset | Cosmetic noise in the trace | Smoothing filter absorbs this; suppress display during the first N frames after onset |
| Last-week crunch consumes deploy and demo | Project reads as unfinished | Deploy, README, and demo video are protected deliverables; features are cut before they are |

---

## 9. Cut List

If the schedule slips, cut in this order. Do not cut out of order.

1. Rhythm / timing scoring → pitch accuracy only
2. Progress analytics → plain chronological attempt history
3. Course count — ship starter courses in tranches rather than all twelve at once
   (`courses.is_published` exists for this)
4. Quizzes → content and exercise lessons only

**Notation moved off this list** and onto the protected one (ADR-015). It was position 1.
A course that teaches an instrument without showing standard notation teaches somebody to
imitate a coloured bar.

**Tuner mode moved off this list.** It was position 4; lesson 2 of every starter course
uses it (`LEARNING_PLATFORM.md` §4.1), so cutting it now breaks every course.

**Protected, never cut:** authentication, deployment, README with architecture and
measured numbers, demo video, notation rendering, and the `limitation` callouts — a course that overclaims is
worse than no course.

---

## 10. Open Questions

- [ ] Exercise authoring format: hand-written JSON, or a minimal MIDI import? *(Decide before `DATA_MODEL.md` is finalized — it constrains the note-sequence shape.)*
- [ ] Auth: roll JWT by hand, or use a managed provider? *(Resolved in `TECH_DECISIONS.md` ADR-006.)*
- [ ] Does the metronome click bleed into the mic enough to affect detection, or does the amplitude gate handle it? *(Answer during the spike.)*
