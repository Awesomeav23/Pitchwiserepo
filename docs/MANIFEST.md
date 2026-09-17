# MANIFEST.md

**Project:** Pitchwise — real-time pitch feedback for voice and melodic instruments
**Phase:** 3 of 3 — documents complete. Server built and verified; client substantially built and **entirely unverified**; hardware measurements not started
**Last checkpoint:** 2026-09-17 (all buildable work complete; nothing built today has been rendered)

---

## Progress

**Documents:** 7 / 7 complete. **Client:** 15 of 15 screens, wired to the API.
**Server:** all endpoints built, 55 end-to-end checks passing. **Measurements:** not started.

Nothing in the client has been used by a person. It typechecks, builds, and passes 20
headless scoring checks; the audio path, the engraving and the quiz flow have never run.

## File Status

| # | File | Phase | Status | Notes |
|---|---|---|---|---|
| 1 | `docs/REQUIREMENTS.md` | 1 | Complete | 3 open questions in §10. §4.3 adds US-14–US-19 |
| 2 | `docs/TECH_DECISIONS.md` | 1 | Complete | 13 ADRs, all Accepted |
| 3 | `docs/AUDIO_PIPELINE.md` | 1 | Complete — pending measurement | Spike is built and partly run. `[TBM]` fields needing hardware are still empty; findings so far in `spike/RESULTS.md` |
| 4 | `docs/DATA_MODEL.md` | 2 | Complete | Resolves open question 1 (ADR-011). §11 added for the learning layer |
| 5 | `docs/API_SPEC.md` | 2 | Complete | 4 open items in §14. §15 added for courses and progress |
| 6 | `docs/MANIFEST.md` | 2 | This file | Updated each checkpoint |
| 7 | `docs/LEARNING_PLATFORM.md` | 3 | Complete | Courses, lessons, progress. Adds ADR-012 and ADR-013 |

## Phase 3 — Pre-code, not documents

| Item | Status |
|---|---|
| Spike: mic → note name, throwaway page | **Build complete.** ADR-002 confirmed in Chrome; 25 DSP checks passing. Checklist and findings in `spike/README.md` |
| Spike: hardware measurements | **Outstanding** — latency, gate thresholds, metronome bleed, real instruments. See below |
| 5 exercises hand-authored as JSON | **Built.** `client/src/exercises/`. Verified against the §6.2 table: note counts, ranges, tempos and the §4.1 worked example all match |
| Repo init, .gitignore, README skeleton | Complete — remote `Awesomeav23/Pitchwiserepo`, pushed |
| Client scaffold + audio engine | **Complete.** Vite + React + TypeScript; Stages A–G in an AudioWorklet using Pitchy; tuner mode (US-08) |
| Client: practice take (US-04, US-05) | **Built.** Count-in, metronome, piano roll, live trace, per-note results. Scoring covered by `npm run verify`; **audio path never run in a browser** |
| Client: learning layer (US-14–US-19) | **Built on local seed data.** Catalog, course detail, lesson view, block renderer, quizzes, progress, ordered unlocking. Never used by a person |
| Sheet music (ADR-015) | **Stage 1 built.** VexFlow engraving with playback, lazy-loaded. Cursor and live staff feedback not built |
| Starter-course content, 12 instruments | **12 of 12 written**, 98 lessons, all published. Generated from one skeleton plus per-instrument overrides (`learning/generate.ts`, `learning/content.ts`) |
| Client: remaining 7 screens | Not started — sign-in, onboarding, exercise library, exercise detail, scorecard, attempt history, mic-denied. List in `README.md` |
| `NoteSource` abstraction (ADR-013) | **Built.** `client/src/audio/note-source.ts`; `PitchEngine implements NoteSource`; tuner migrated to `subscribe`. Typechecks and builds — **not yet run in a browser** |
| Course seed generator | **Built.** `learning/generate.ts` + `learning/content.ts`. Emits all 12 courses from one skeleton; refuses a course whose notation shift disagrees with its instrument profile |
| Server | **Built and verified.** Express + Postgres. Every endpoint in `API_SPEC.md` §§5–8, §12 and §15. 55 end-to-end checks pass against a real database (`cd server && npm run verify`) |

### Spike status against `AUDIO_PIPELINE.md` §9

**Done or verified:** worklet wiring, ring buffer (sample-exact, no per-frame
allocation), YIN accuracy, gate behaviour, median-filter octave correction,
synthetic accuracy sweep, synthetic octave-error A/B.

**Outstanding — all need a microphone and a room:**

| Item | Blocks |
|---|---|
| Mic-to-display latency, acoustic loopback | §7 latency budget, REQUIREMENTS §5.2 |
| Gate thresholds per instrument | §6 profile table (12 `[TBM]` cells) |
| Metronome bleed | OQ2 below, §3 Stage B fallback |
| Voice and one physical instrument | §9 item 10 |
| Onset-suppression frame count | §3 Stage H `[TBM]` |

**Note on §6.** The gate-threshold table cannot be fully filled by one person —
it wants twelve instruments in a real room. Measure the ones available and leave
the rest `[TBM]`. An unmeasured field is correct; a plausible-looking guess is not.

---

## Locked Constants

Do not change these without writing a superseding ADR.

| Constant | Value | Source |
|---|---|---|
| Project name | Pitchwise | — |
| Tuning reference | A4 = 440 Hz | AUDIO_PIPELINE §Stage G |
| Analysis window | 2048 samples | AUDIO_PIPELINE §Stage A |
| Hop size | 512 samples | AUDIO_PIPELINE §Stage A |
| Median window | 5 frames | AUDIO_PIPELINE §Stage F |
| Latency target | < 50 ms | REQUIREMENTS §5.2 |
| Scoring unit | cents | AUDIO_PIPELINE §Stage G |
| Scope | monophonic **audio analysis** | REQUIREMENTS §2.2, amended by ADR-013 |
| Pitch storage | MIDI note number, not Hz | DATA_MODEL §1 |
| Timing storage | milliseconds, not ticks/beats | DATA_MODEL §1 |
| note_sequence schema | version 1 | DATA_MODEL §4 |
| note_results schema | version 1 | DATA_MODEL §5 |
| lesson block schema | version 1 | LEARNING_PLATFORM §5 |
| quiz schema | version 1 | LEARNING_PLATFORM §6 |

**On the scope constant.** ADR-013 amends its wording, not its ceiling. Audio analysis is
monophonic and stays monophonic; the word *audio* was added because a `NoteSource`
abstraction now exists that a future MIDI source could implement. No such source is built,
and nothing in the engine gained polyphonic capability.

---

## Open Questions Blocking Progress

| # | Question | Blocks | Resolve by |
|---|---|---|---|
| ~~1~~ | ~~Exercise authoring format~~ | — | **Resolved**: hand-authored JSON (ADR-011) |
| 2 | Does metronome click bleed through the amplitude gate? | Stage B fallback design | Harness built; needs speakers + mic |
| ~~3~~ | ~~Is a 2048 window adequate for bass / low cello?~~ | — | **Resolved** — see below |
| 4 | Enable the sub-octave guard for violin and piano? | Stage C config, §6 profiles | Needs a real violin at the top of its range |
| 5 | What `minScore` completes an `attempt_score` lesson? | Course pacing | Provisional 70. Needs real beginner attempts — a wall or a rubber stamp are both failures |
| 6 | Can lesson 2 auto-complete from tuner-mode frames instead of self-report? | Starter-course skeleton | Decide when the tuner is wired into a lesson |
| 7 | Is strum-timing grading viable from the RMS envelope alone? | Guitar course depth | Blocked on the onset-suppression frame count, itself unmeasured |

**OQ3 resolved.** The low-frequency floor is `sampleRate / (windowSize/2 - 1)`, i.e.
**46.9 Hz** at 2048 / 48 kHz — matching the "roughly 45 Hz" estimate in
`AUDIO_PIPELINE.md` §3 Stage A. Cello low C (65.4 Hz) and guitar low E (82.4 Hz) are
comfortably clear. **Bass low E (41.2 Hz) and piano A0 (27.5 Hz) return no detection
at all** — the detector reports unvoiced rather than a wrong pitch, which is the safe
failure. A 4096-sample window resolves both, at 85.3 ms of window latency and double
the CPU. Option (b) from §3 Stage A — supporting bass only above its low E — costs
nothing and loses one semitone. Measured in `spike/RESULTS.md` §3.

**OQ4 is new**, and was not anticipated anywhere in the documents. Above ~2.5 kHz the
true period is only 13–19 samples; when it falls near a half-integer, no integer lag
correlates well while 2× the lag does, so YIN locks the sub-octave — on every frame,
at 0.98 clarity. Measured at 32% of test frequencies in 3000–3600 Hz. It defeats all
three defences in §5: Stage E passes it because the sub-octave is still inside the
instrument range, and Stage F passes it because every frame agrees, so the median
agrees too. This affects **violin** (fMax 3600) and **piano** (fMax 4200); flute and
clarinet cap at 2200 Hz and are unaffected. An optional submultiple guard removes it
entirely and leaves C2–C6 unchanged to within 0.004 cents, at the cost of dropping
26.5% of high-range frames below the 0.90 clarity gate — silence instead of a
confident wrong octave. It is **off by default**. Detail in `spike/RESULTS.md` §6.

**Watch item on a locked constant.** The analysis window is locked at 2048. If bass or
full-range piano are to be supported, that needs either a per-profile override or a
superseding ADR — not an edit to the table above.

---

## Next Action

**Finish the spike's hardware measurements.** Unchanged, and more urgent than before: a
learning platform makes accuracy claims to beginners who cannot tell whether the app or
their own ear is wrong. Shipping teaching content on top of unmeasured gate thresholds is
the wrong order. This needs a microphone and a room, not more design.

Then, in order:

1. ~~**The `NoteSource` refactor** (ADR-013).~~ **Done**, before the practice-take screen
   became its second caller. Unverified in a browser.
2. ~~**The practice-take screen**~~ **Done.** Never run against a microphone — opening it
   is the cheapest outstanding verification in the project.
3. ~~**The server**~~ **Built.** Progress is now server-evaluated as
   LEARNING_PLATFORM §7 requires — but the client still writes to `localStorage`
   and has not been pointed at it.
4. ~~**One starter course, end to end, for one instrument**~~ **All twelve written**, via
   the generator. None has been walked by a person — that is now the outstanding gap.

 The spike is built and ADR-002 —
the largest scheduled risk in REQUIREMENTS §8 — is confirmed working in Chrome.
What remains is one focused session at a microphone, listed above. `API_SPEC.md`
is unblocked and does not depend on any of it, so it can proceed in parallel.

`ADR-011` has been appended to `TECH_DECISIONS.md`; the ADR log is authoritative.

---

## Change Log

| Date | Change |
|---|---|
| 2026-09-13 | Phase 1 complete: REQUIREMENTS, TECH_DECISIONS, AUDIO_PIPELINE created |
| 2026-09-13 | Repo skeleton created: README, .gitignore, docs/, spike/ |
| 2026-09-13 | DATA_MODEL.md created; open question 1 resolved (ADR-011) |
| 2026-09-13 | Spike built: worklet, YIN, gates, median filter, measurement harness, 25 checks |
| 2026-09-13 | ADR-002 confirmed in Chrome — worklet runs on the audio thread, take plays back |
| 2026-09-13 | Open question 3 resolved (low-frequency floor = 46.9 Hz); OQ4 opened (sub-octave errors above 2.5 kHz) |
| 2026-09-13 | Repo initialised, first commit, remote added (not pushed) |
| 2026-09-13 | API_SPEC.md written — Phase 2 documents complete |
| 2026-09-13 | Client scaffolded; Stages A–G ported to TypeScript; tuner mode (US-08) working |
| 2026-09-13 | Worklet build resolved: esbuild emits a self-contained file, identical in dev and production |
| 2026-09-15 | Learning layer specified: `LEARNING_PLATFORM.md`, ADR-012, ADR-013. DATA_MODEL §11, API_SPEC §15, REQUIREMENTS §4.3 (US-14–US-19) |
| 2026-09-15 | Scope constant amended to *monophonic audio analysis* (ADR-013); `attempts.input_source` added |
| 2026-09-15 | Tuner mode removed from the cut list — every starter course depends on it |
| 2026-09-15 | Timeline constraint in REQUIREMENTS §6 superseded; scope grew from 9 screens to 15 |
| 2026-09-15 | `NoteSource` built (ADR-013). Engine implements it, tuner consumes it. `events.onFrame` replaced by `subscribe`. Not browser-verified |
| 2026-09-15 | Exercise builder and the five seed exercises built; verified against DATA_MODEL §6.2 |
| 2026-09-15 | Practice-take screen built (US-04, US-05). ADR-014: metronome on the capture AudioContext, not Tone.js |
| 2026-09-15 | `npm run verify` — 20 headless checks on take reduction and scoring |
| 2026-09-15 | Learning layer built: catalog, course, lesson, quiz, progress, ordered unlocking (US-14–US-19) |
| 2026-09-15 | ADR-015: sheet music is core, off the cut list. `score` block added; one authored string drives notation, audio and scoring |
| 2026-09-15 | First starter course written by hand — voice, tenor, 8 lessons across 3 modules |
| 2026-09-15 | All 12 starter courses written (98 lessons) via the seed generator; catalog grouped by family, no unpublished entries |
| 2026-09-15 | Transposition sign convention fixed: guitar and bass were −12 against clarinet's +2. Now +12, and stated in AUDIO_PIPELINE §6 |
| 2026-09-15 | Server built: Postgres schema, seed, auth, and every endpoint in API_SPEC §§5–8, §12, §15. 55 end-to-end checks pass |
| 2026-09-15 | Client wired to the API; progress moved off localStorage to server-evaluated. Hash routing added |
| 2026-09-15 | Scorecard (US-06), onboarding (US-01) and the microphone-denied states (§5.1) built |
| 2026-09-16 | ADR-016: Clerk chosen, resolving API_SPEC §14's first open item. Sign-in built, code-split, optional at runtime |
| 2026-09-16 | Local accounts for use before a Clerk key exists — salted SHA-256 passwords, verified on sign-in, wrong ones refused. Superseded the placeholder form that checked nothing |
| 2026-09-16 | Creating an account hands off to sign-in rather than signing you straight in |
| 2026-09-16 | **First day any of the client was used by a person.** Five bugs found by clicking through it, none of which the automated checks could have caught — four in the sign-in and catalog flow, and one crash |
| 2026-09-16 | Fixed: pre-sign-in sessions were treated as signed in, so the app skipped the sign-in page entirely |
| 2026-09-16 | Fixed: the sign-in form was not remembering the email, and had no `name`/`id` on its inputs, so no password manager would save or fill it |
| 2026-09-16 | Fixed: the catalog ignored the instrument chosen at onboarding, while onboarding claimed it decided which course you land on. Your course now leads the catalog; the other eleven stay browsable |
| 2026-09-16 | Catalog heading drops a parenthesised qualifier — "Your course · Piano" rather than "Piano (melody)" twice, since the card below repeats it |
| 2026-09-16 | Attempt history built (US-07) — paginated, filterable by exercise, deletable. `api.attempts` was discarding `nextCursor`, making everything past the first page unreachable |
| 2026-09-16 | Exercise library and detail built (US-02). Migration 003 adds `exercises.in_library`, separating the 5 authored exercises from the 48 transposed course variants |
| 2026-09-16 | **All 15 screens built.** 58 API checks, 20 scoring checks |
| 2026-09-16 | Fixed (5th bug, found by use): standalone practice crashed to a blank page — it built a take from the exercise *list*, which omits `noteSequence` by design (API_SPEC §7). Broken since the API wiring the day before; nobody had clicked it |
| 2026-09-16 | `ApiExercise` split into summary and full record, so using a list row where notes are needed is a compile error rather than a runtime crash |
| 2026-09-16 | Error boundary added — a render crash showed a blank page with the error only in the console |
| 2026-09-16 | **First audio verification.** A take was started in Chrome: microphone capture, the AudioWorklet, the metronome and the count-in all ran, and phase transitions on the audio clock worked. ADR-002 and ADR-014 confirmed in the app rather than only in the spike |
| 2026-09-16 | Still unverified past that point: whether the live trace draws, whether frames land in the right note windows, and whether a take reaches the database. Needs a quiet room |
| 2026-09-16 | Deployment prepared: the Express app split from its listener so the same app serves locally and as a Vercel function, client and API deploying from one project so CORS never applies in production. `docs/DEPLOYMENT.md` written, and never run |
| 2026-09-17 | Found: **no lesson had ever referenced a diagram** — 0 diagram blocks across all 98, against 227 prose, 102 callout and 60 score. The README's claim that "every diagram block degrades to its caption" described nothing that was happening |
| 2026-09-17 | 11 SVG diagrams drawn and authored into lessons — piano keyboard and triad, guitar and bass fretboards, two chord charts, violin and cello open strings, and the tuning point on flute, clarinet and trumpet. Verified in both directions: every referenced id has a file, no file is orphaned |
| 2026-09-17 | Decided **not** to draw posture, holding position or embouchure. Those need a photograph or an illustrator, and a schematic line drawing of a person holding an instrument would be worse than the prose already there. The gap is left visible rather than filled badly |
| 2026-09-17 | Notation stage 2 — the sounding note lights up during playback. Both halves had been built in stage 1 and left unused: the renderer already returned a note-index to element map, the player already reported note indices |
| 2026-09-17 | Notation stage 3 — during a take the staff shows the note being played, coloured by how the last 180 ms compares with the target. Only the recent tail, so a note corrected mid-way reads as corrected |
| 2026-09-17 | Microphone device picker on the tuner and practice screens, shown only when more than one input exists. Labels are blank until permission is granted, so it falls back to "Microphone 1, 2" and fills in after a first take |
| 2026-09-17 | Fixed: `setLive` was captured by a callback declared above the `useState` that creates it — works only while nothing calls it during that render. Caught by the linter, not by the typechecker |
| 2026-09-17 | `scripts/check-changelog.mjs` added — flags any day with commits and no change log entry. Written after two days of work shipped unlogged and were found by reading back |
| 2026-09-17 | Onset suppression left at `0` by decision, not omission. The mechanism is built and wired in; the frame count depends on the instrument and is unmeasured, and a guess would sit next to 24 honestly-empty `[TBM]` cells pretending to be a measurement |
| 2026-09-17 | **First diagram seen in a browser.** The piano keyboard rendered correctly — groups of two and three, middle C left of a group of two — but its "middle C" label was clipped 3px by the viewBox and read "niddle C". Fixed, and every label in all 11 diagrams checked against its canvas |
| 2026-09-17 | Found by comparing two screenshots: each diagram had been drawn in its own coordinate space and then stretched to one display width, so the same 11px label rendered at 13.6px on the piano, 17.9px on the cello and 24.7px on the guitar. Every diagram was internally correct and only wrong beside another |
| 2026-09-17 | **A fix that did nothing.** Scaling both the drawing and its viewBox by the same factor cancels exactly, so the rendered output was unchanged — and the check written alongside it reported success, because it measured the viewBox and ignored the transform it had just added |
| 2026-09-17 | Fixed properly: geometry scales to the shared canvas, font sizes divide by the same factor so `font-size × scale` stays constant. All 11 diagrams now render body text at 13.6px |
| 2026-09-17 | Open-string diagrams tightened — a self-labelling heading removed where the figure caption already said the same thing, and 31% of dead vertical space cut |
| 2026-09-17 | README's outstanding work regrouped by what each item needs — code, someone to look, a microphone, an account — rather than by whether it is code. Three of the four categories are not mine |
| 2026-09-17 | **No staff was rendering anywhere in the app.** Two unrelated `.score` CSS rules collided — the scorecard's numeric display set `display:flex`, making every notation figure's container a flex item that shrank to zero width, below the renderer's 40px minimum. Found by screenshot, diagnosed by reading `host.clientWidth` out of the browser console |
| 2026-09-17 | Staff layout: sized to note count rather than stretching one note across the column, systems 100px instead of 138, centred in their canvas, and no time signature on single-note examples |
| 2026-09-17 | Notation verified correct end to end — the cello quiz engraves C3 on the 2nd space and G3 on the 4th in bass clef, and the eight-note example runs C3 to C4 with a ledger line, all matching the seeded data |
| 2026-09-17 | Guitar and bass fretboards had their **string weights reversed** — the top row, which is the thinnest string on a real instrument, was drawn thickest. The cello diagram had it the right way round, so the two contradicted each other |
| 2026-09-17 | The fretboards' "nut" label was clipped by the top of the canvas, and the clipping check had been passing it: it compared the baseline against zero and text ascends *above* its baseline |
| 2026-09-17 | `scripts/check-diagrams.mjs` added — label overflow in all four directions, consistent rendered text size, and referenced-vs-present ids both ways. Verified by reinstating the clipped label and watching it fail |
| 2026-09-17 | Exercise library was in arbitrary order — all five rows are seeded in one transaction so `created_at` is identical, leaving a random uuid as the only tiebreak, and the order would shuffle on any reseed. Now easiest first. `all=true` keeps recency ordering, since that is the path where the cursor matters |
| 2026-09-17 | Scorecard chart plotted **missed notes at zero cents**, putting them inside the on-pitch band — a take where nothing was heard read as five perfect notes. Missed slots are now a grey column labelled "missed", since a note with no reading has no deviation to plot |
| 2026-09-17 | The lesson's "Play it" section drew a **second staff from the exercise's sounding pitch with no clef** — for guitar that is an octave below what a guitarist reads, three ledger lines down and clipped by the box; for cello it would have been a treble clef. Removed: the lesson already shows the same music engraved correctly above, and that staff now carries the live highlighting |
| 2026-09-17 | `.callout strong` styled **every** bold inside a callout, so Markdown emphasis in the body became a second uppercase label mid-sentence. The label has its own class now |
| 2026-09-17 | **Every buildable item is now built.** The only remaining code item is onset suppression, which is blocked on a measurement. What is left needs a microphone, three accounts, or someone looking at a screen |
