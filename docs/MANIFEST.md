# MANIFEST.md

**Project:** Pitchwise — real-time pitch feedback for voice and melodic instruments
**Phase:** 3 of 3 — documents complete, build underway
**Last checkpoint:** 2026-09-13 (spike built; client scaffolded)

---

## Progress

**5 / 6 documents complete (83%)**

## File Status

| # | File | Phase | Status | Notes |
|---|---|---|---|---|
| 1 | `docs/REQUIREMENTS.md` | 1 | Complete | 3 open questions in §10 |
| 2 | `docs/TECH_DECISIONS.md` | 1 | Complete | 10 ADRs, all Accepted |
| 3 | `docs/AUDIO_PIPELINE.md` | 1 | Complete — pending measurement | Spike is built and partly run. `[TBM]` fields needing hardware are still empty; findings so far in `spike/RESULTS.md` |
| 4 | `docs/DATA_MODEL.md` | 2 | Complete | Resolves open question 1; adds ADR-011 |
| 5 | `docs/API_SPEC.md` | 2 | Complete | 4 open items in §14; none block implementation |
| 6 | `docs/MANIFEST.md` | 2 | This file | Updated each checkpoint |

## Phase 3 — Pre-code, not documents

| Item | Status |
|---|---|
| Spike: mic → note name, throwaway page | **Build complete.** ADR-002 confirmed in Chrome; 25 DSP checks passing. Checklist and findings in `spike/README.md` |
| Spike: hardware measurements | **Outstanding** — latency, gate thresholds, metronome bleed, real instruments. See below |
| 5 exercises hand-authored as JSON | Not started — shapes defined in DATA_MODEL §4, §6.2 |
| Repo init, .gitignore, README skeleton | Complete — remote `Awesomeav23/Pitchwiserepo`, pushed |
| Client scaffold + audio engine | **Complete.** Vite + React + TypeScript; Stages A–G in an AudioWorklet using Pitchy; tuner mode (US-08) |
| Client: remaining 8 screens | Not started — list in `README.md` |
| Server | Not started — contract in `API_SPEC.md` |

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
| Scope | monophonic only | REQUIREMENTS §2.2 |
| Pitch storage | MIDI note number, not Hz | DATA_MODEL §1 |
| Timing storage | milliseconds, not ticks/beats | DATA_MODEL §1 |
| note_sequence schema | version 1 | DATA_MODEL §4 |
| note_results schema | version 1 | DATA_MODEL §5 |

---

## Open Questions Blocking Progress

| # | Question | Blocks | Resolve by |
|---|---|---|---|
| ~~1~~ | ~~Exercise authoring format~~ | — | **Resolved**: hand-authored JSON (ADR-011) |
| 2 | Does metronome click bleed through the amplitude gate? | Stage B fallback design | Harness built; needs speakers + mic |
| ~~3~~ | ~~Is a 2048 window adequate for bass / low cello?~~ | — | **Resolved** — see below |
| 4 | Enable the sub-octave guard for violin and piano? | Stage C config, §6 profiles | Needs a real violin at the top of its range |

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

**Finish the spike's hardware measurements.** The document set is complete, the spike
is built, and the client runs the engine end to end. The only outstanding documentation
work is filling measured values into `AUDIO_PIPELINE.md`, which needs a microphone.

In parallel, the practice-take screen is the next client work that does not depend on
the server.

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
