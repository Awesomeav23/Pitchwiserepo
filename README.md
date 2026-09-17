# Pitchwise

Real-time pitch feedback for voice and melodic instruments, plus starter courses that
teach the basics of each. Sing or play an exercise into your microphone and see your pitch
traced against the target in real time, then get a per-note scorecard measuring how many
cents sharp or flat you were.

Every instrument in the catalog has a starter course — setup, tuning, first notes, reading
notation, a first melody — with those exercises as its graded practice steps. Twelve
courses, 98 lessons, sheet music throughout. The trainer tells you whether you hit the
note; the courses tell you which note to go for and why.

---

## Where this is

The product is built and the plumbing is proven. What is missing is that **nobody has
used it yet**, and it still only runs on one laptop.

**Done**

- [x] Seven design documents, 15 ADRs
- [x] Audio engine — `AudioWorklet`, pitch detection, gating, median filter, `NoteSource`
- [x] Metronome with count-in, on the capture clock
- [x] Frame accumulation → per-note results → scoring
- [x] Learning platform — catalog, course detail, lessons, quizzes, ordered unlocking
- [x] Sheet music — VexFlow engraving with playback
- [x] **12 starter courses, 98 lessons** — one per instrument, all written
- [x] **15 of 15 screens** — sign-in, onboarding, catalog, course, four lesson kinds,
      exercise library and detail, practice take, scorecard, attempt history,
      microphone-denied, tuner
- [x] **Backend complete** — Postgres, full schema, seed, auth, every endpoint in `API_SPEC.md`
- [x] Progress decided by the server, not the browser
- [x] 78 automated checks — 58 API, 20 scoring

**Left, and needs a person**

- [ ] **Finish using it in a browser.** Sign-in, the catalog, the exercise library and the
      start of a practice take have now been used by a person; five bugs came out of that.
      Still unseen: every engraved stave, and what happens after a take is recorded
- [ ] **Create a Clerk account** and put the key in `client/.env.local` — until then sign-in works against accounts stored in the browser, which do not follow you between devices
- [ ] **One session at a microphone** — fills every `TBM` in this file

**Left, and is code**

- [ ] Nothing — every screen and feature on the list is built
- [ ] Deployment — nothing is hosted anywhere

Day-by-day history is the change log in `docs/MANIFEST.md`. This section is a
snapshot of the present, not a diary — the two would drift if both tried to be both.

---

## How it works

Audio is captured and analyzed entirely in the browser — it never reaches a server. An
`AudioWorklet` runs YIN autocorrelation over overlapping 2048-sample windows, producing
roughly 94 pitch estimates per second. Those estimates pass through amplitude gating,
clarity gating, a per-instrument frequency range clamp, and a median filter that corrects
octave errors, before being converted to cents deviation and rendered.

```
mic → AudioWorklet [ring buffer → RMS gate → YIN → clarity gate → range clamp]
    → main thread [median filter → Hz→cents → canvas]
    → scoring → Postgres
```

Detail: `docs/AUDIO_PIPELINE.md`

## Scope

**Supported:** voice, and any instrument played one note at a time — flute, clarinet,
trumpet, violin, cello, guitar and piano melodies.

**Not supported:** chords, strummed guitar, two-handed piano. Real-time polyphonic pitch
detection is an open research problem and out of proportion to this project. Pitchwise is
a single-note practice tool by design.

**Taught but not graded.** Courses for guitar and piano do teach chords, and courses for
every instrument cover technique — posture, bowing, embouchure, hand shape. The engine
cannot assess any of it, so those lessons are self-reported and say so on the page. The
full boundary of what is and is not graded is `LEARNING_PLATFORM.md` §2, and no lesson may
imply the app verified something it did not.

A `NoteSource` abstraction (ADR-013) leaves room for a Web MIDI input later, which would
make chords gradable on MIDI-capable instruments. It is not built.

## Stack

| Layer | Choice |
|---|---|
| Audio | Web Audio API, AudioWorklet, YIN |
| Frontend | React, TypeScript, Canvas, VexFlow (notation) |
| Backend | Node, Express, TypeScript |
| Database | PostgreSQL (JSONB for note sequences) |
| Auth | Managed provider (Clerk / Auth0) |

Reasoning for each: `docs/TECH_DECISIONS.md`

## Build status

| Area | State |
|---|---|
| Documents | 7 of 7 complete |
| Spike | Built. ADR-002 confirmed in Chrome. **Measurements outstanding** — see below |
| Audio engine | Stages A–G ported to TypeScript, running in an AudioWorklet |
| Client | 15 of 15 screens built — sign-in, onboarding, catalog, course, four lesson kinds, exercise library, exercise detail, practice take, scorecard, history, mic-denied, tuner |
| Learning layer | **Built on local seed data.** Catalog, course detail, lesson view, quizzes, progress. All 12 courses written, 98 lessons; no server |
| Server | **Built.** Express + Postgres, all endpoints, 55 end-to-end checks passing |

### Spike — what remains

The spike exists to fill this project's measured numbers. It runs, and the detector is
verified against synthesized input (`spike/RESULTS.md`), but the following need a real
microphone in a real room and are not done:

- [ ] Mic-to-display latency, and hardware input latency by acoustic loopback
- [ ] Gate thresholds per instrument — 12 `[TBM]` cells in `AUDIO_PIPELINE.md` §6
- [ ] Metronome bleed through the amplitude gate (open question 2)
- [ ] Tested against a voice and a physical instrument
- [ ] Onset-suppression frame count

Until those are done, every figure in the table below stays `TBM`. A wrong number stated
confidently is worse than no number.

### Frontend — what remains

**Done:** Vite + React + TypeScript scaffold; audio engine (Stages A–G) in an
AudioWorklet with Pitchy; tuner mode (US-08).

**Audio**

- [x] Metronome with count-in — US-04. On the capture `AudioContext`, not Tone.js (ADR-014)
- [x] Frame accumulation across a take, and reduction to per-note results
- [x] Scoring: coverage, bands, mean absolute cents (`DATA_MODEL.md` §5.1)
- [ ] Onset suppression — still blocked on the spike's frame count; the hook exists and is set to 0
- [x] Microphone device picker — shown when more than one input exists, on both the tuner and practice

**Screens — 1 of 15 remaining**

- [x] Sign-in / sign-up (US-01) — Clerk when a key is set, local accounts otherwise
- [x] Onboarding: choose instrument or voice (US-01)
- [x] Exercise library (US-02) — filter by type and by what fits your range
- [x] Exercise detail with note preview (US-02) — engraved at written pitch, playable
- [x] Practice take: count-in, metronome, target overlay, live trace (US-04, US-05)
- [x] Scorecard (US-06) — deviation chart, per-note table, addressable by URL
- [x] Attempt history (US-07) — paginated, filterable, deletable
- [x] Microphone denied or unavailable (§5.1) — per-cause guidance, not one message

*Learning layer (ADR-012):*

- [x] Course catalog (US-14)
- [x] Course detail with modules, lessons and progress (US-15)
- [x] Lesson: content — block renderer for prose, score, diagram, callout (US-16)
- [x] Lesson: quiz with post-submission explanations (US-18)
- [x] Lesson: drill with self-report (US-19)
- [x] Lesson: exercise — chrome around the practice-take screen, not a second one (US-17)
- [x] Sheet music: VexFlow engraving with playback (ADR-015), stage 1 of 3
- [x] Notation stage 2 — the sounding note lights up during playback
- [x] Notation stage 3 — during a take the staff shows the note you are on, coloured by how it is going
- [x] Starter courses for all 12 instruments — 98 lessons, generated from one skeleton
- [x] SVG diagrams — 11 drawn, covering what notation cannot express: keyboards, fretboards, chord charts, string layouts, tuning points. Posture and embouchure are deliberately not drawn

**Infrastructure**

- [x] Auth provider integration — Clerk (ADR-016), code-split, optional at runtime
- [x] API client — one module, the only thing that fetches
- [x] Piano-roll rendering of target against detected pitch
- [x] `NoteSource` abstraction over the audio engine (ADR-013)
- [x] The five seed exercises and the `buildExercise` helper (`DATA_MODEL.md` §4.2, §6.2)
- [x] Routing — hash-based, hand-written; courses, lessons and attempts have URLs

The learning layer runs entirely on local seed data with progress in `localStorage`. That
is a stand-in, not the design: `LEARNING_PLATFORM.md` §7 requires progress to be
server-evaluated, because a client that can declare its own completion makes the model
advisory. The rules live in one function so there is a single thing to move when the
server exists.

## Measured results

<!-- Fill these in from the spike. Do not quote them until measured. -->

| Metric | Target | Measured |
|---|---|---|
| Mic-to-display latency | < 50 ms | TBM |
| Pitch accuracy | ±5 cents | TBM |
| Octave-error rate, filter off | — | TBM |
| Octave-error rate, filter on | < 1% | TBM |

## Documents

| File | Contents |
|---|---|
| `docs/REQUIREMENTS.md` | Scope, user stories, success criteria, cut list |
| `docs/TECH_DECISIONS.md` | 10 ADRs covering every architecture choice |
| `docs/AUDIO_PIPELINE.md` | Signal path, filtering strategy, instrument profiles, latency budget |
| `docs/MANIFEST.md` | Build status, locked constants, open questions |
| `docs/DATA_MODEL.md` | Schema, JSONB shapes, seed data, scoring formula |
| `docs/API_SPEC.md` | Endpoints, auth, validation, pagination |
| `docs/LEARNING_PLATFORM.md` | Courses, lessons, progress, and what can and cannot be graded |
| `spike/RESULTS.md` | Synthetic measurements from the spike, and what is still unmeasured |

## Running it

```sh
cd client && npm install && npm run dev     # the app, on :5173
npm run verify                              # 20 headless checks on take scoring

node scripts/check-changelog.mjs             # every day of work reached the change log

docker compose up -d                        # Postgres on :5433
cd server && npm install
npm run migrate && npm run seed             # schema, then reference data
npm run dev                                 # the API, on :8787
npm run verify                              # 55 end-to-end checks (needs the API running)
```

`npm run dev` bundles the AudioWorklet with esbuild before starting Vite. The worklet does
not hot-reload — restart after editing anything it imports.

```sh
cd spike && python3 -m http.server 8000     # the spike, on :8000
node --expose-gc spike/verify.mjs           # 25 checks on the DSP
node spike/measure.mjs                      # regenerate spike/RESULTS.md
```

## Next action

Take the spike's hardware measurements: latency, gate thresholds, metronome bleed, and a
real instrument. That fills the table above and closes `AUDIO_PIPELINE.md` §9. It matters
more now than it did — a course teaching beginners cannot rest on unmeasured gates, since
a beginner cannot tell whether the app or their own ear is wrong.

Walk a course end to end in a browser. The learning layer has never been used
by a person: the engraving, the playback, the quiz, the unlocking and the embedded take are
all unverified beyond a typecheck and a build.

Then the server, so progress stops living in `localStorage`. Then the remaining eleven
courses, and the notation cursor.
