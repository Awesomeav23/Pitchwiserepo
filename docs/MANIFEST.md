# MANIFEST.md

**Project:** Pitchwise — real-time pitch feedback for voice and melodic instruments
**Phase:** 1 of 3 (Foundation documents)
**Last checkpoint:** 2026-09-13

---

## Progress

**4 / 6 documents complete (67%)**

## File Status

| # | File | Phase | Status | Notes |
|---|---|---|---|---|
| 1 | `docs/REQUIREMENTS.md` | 1 | Complete | 3 open questions in §10 |
| 2 | `docs/TECH_DECISIONS.md` | 1 | Complete | 10 ADRs, all Accepted |
| 3 | `docs/AUDIO_PIPELINE.md` | 1 | Complete — pending measurement | Contains `[TBM]` fields; spike fills them |
| 4 | `docs/DATA_MODEL.md` | 2 | Complete | Resolves open question 1; adds ADR-011 |
| 5 | `docs/API_SPEC.md` | 2 | Not started | Unblocked — #4 complete |
| 6 | `docs/MANIFEST.md` | 2 | This file | Updated each checkpoint |

## Phase 3 — Pre-code, not documents

| Item | Status |
|---|---|
| Spike: mic → note name, throwaway page | Not started — **do this before Phase 2** |
| 5 exercises hand-authored as JSON | Not started — shapes defined in DATA_MODEL §4, §6.2 |
| Repo init, .gitignore, README skeleton | Complete |

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
| 2 | Does metronome click bleed through the amplitude gate? | Stage B fallback design | During spike |
| 3 | Is a 2048 window adequate for bass / low cello? | Stage A window sizing, instrument profiles | During spike |

---

## Next Action

**Run the spike.** `API_SPEC.md` is now unblocked and could be written, but
`AUDIO_PIPELINE.md` still has 20+ `[TBM]` fields that only the spike can fill, and open
questions 2 and 3 change engine configuration. Spiking first means fewer revisions.

`ADR-011` has been appended to `TECH_DECISIONS.md`; the ADR log is authoritative.

---

## Change Log

| Date | Change |
|---|---|
| 2026-09-13 | Phase 1 complete: REQUIREMENTS, TECH_DECISIONS, AUDIO_PIPELINE created |
| 2026-09-13 | Repo skeleton created: README, .gitignore, docs/, spike/ |
| 2026-09-13 | DATA_MODEL.md created; open question 1 resolved (ADR-011) |
