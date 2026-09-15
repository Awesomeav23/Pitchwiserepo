# Pitchwise

Real-time pitch feedback for voice and melodic instruments, plus starter courses that
teach the basics of each. Sing or play an exercise into your microphone and see your pitch
traced against the target in real time, then get a per-note scorecard measuring how many
cents sharp or flat you were.

Every instrument in the catalog has a starter course — setup, tuning, first notes, reading
notation, a first melody — with those exercises as its graded practice steps. The trainer
tells you whether you hit the note; the courses tell you which note to go for and why.

**Status:** In development. Seven design documents complete, including the learning layer
(ADR-012). The week-1 spike is built and `AudioWorklet` is de-risked; its hardware
measurements are outstanding. The client is scaffolded with the audio engine ported and
tuner mode working — 1 of 15 screens.

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
| Frontend | React, TypeScript, Canvas, Tone.js |
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
| Client | Scaffolded. 1 of 15 screens built |
| Learning layer | Specified, not built — `LEARNING_PLATFORM.md` |
| Server | Not started |

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

- [ ] Metronome with count-in (Tone.js) — US-04
- [ ] Frame accumulation across a take, and reduction to per-note results
- [ ] Scoring: coverage, bands, mean absolute cents (`DATA_MODEL.md` §5.1)
- [ ] Onset suppression — blocked on the spike's frame count
- [ ] Microphone device picker and permission pre-flight

**Screens — 14 of 15 remaining**

- [ ] Sign-in / sign-up (US-01, provider-hosted)
- [ ] Onboarding: choose instrument or voice (US-01)
- [ ] Exercise library (US-02)
- [ ] Exercise detail with note preview (US-02)
- [ ] Practice take: count-in, metronome, target overlay, live trace (US-04, US-05)
- [ ] Scorecard (US-06)
- [ ] Attempt history (US-07)
- [ ] Microphone denied or unavailable (§5.1)

*Learning layer (ADR-012):*

- [ ] Course catalog (US-14)
- [ ] Course detail with modules, lessons and progress (US-15)
- [ ] Lesson: content — block renderer for prose, diagram, listen, callout (US-16)
- [ ] Lesson: quiz with post-submission explanations (US-18)
- [ ] Lesson: drill with self-report (US-19)
- [ ] Lesson: exercise — chrome around the practice-take screen, not a second one (US-17)

**Infrastructure**

- [ ] Routing
- [ ] Auth provider integration — blocked on Clerk vs Auth0 (`API_SPEC.md` §14)
- [ ] API client and types shared with the server
- [ ] Piano-roll rendering of target against detected pitch
- [ ] `NoteSource` abstraction over the audio engine (ADR-013)
- [ ] Course seed generator — skeleton plus per-instrument overrides (`DATA_MODEL.md` §11.9)
- [ ] Starter-course content: 3 prose lessons and an SVG diagram set per instrument

Twelve of the fourteen remaining screens consume endpoints that do not exist yet, so the
backend is the real gate on finishing the frontend.

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

Then the practice-take screen, which is the last significant client work that does not
require the server and the screen every `exercise` lesson wraps. Then the server. Then one
starter course built by hand, end to end, before generating twelve.
