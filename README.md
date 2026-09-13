# Pitchwise

Real-time pitch feedback for voice and melodic instruments. Sing or play an exercise into
your microphone and see your pitch traced against the target in real time, then get a
per-note scorecard measuring how many cents sharp or flat you were.

**Status:** Pre-development. Foundation documents complete; spike not yet run.

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

## Stack

| Layer | Choice |
|---|---|
| Audio | Web Audio API, AudioWorklet, YIN |
| Frontend | React, TypeScript, Canvas, Tone.js |
| Backend | Node, Express, TypeScript |
| Database | PostgreSQL (JSONB for note sequences) |
| Auth | Managed provider (Clerk / Auth0) |

Reasoning for each: `docs/TECH_DECISIONS.md`

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
| `docs/API_SPEC.md` | *Not yet written* |

## Next action

Run the spike (`spike/`) — a throwaway page proving mic → note name works and filling the
measurement fields in `docs/AUDIO_PIPELINE.md`. See its §9 checklist.
