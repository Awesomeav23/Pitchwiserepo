# AUDIO_PIPELINE.md

**Project:** Pitchwise
**Status:** Draft v1.0 — *contains unmeasured fields*
**Last updated:** 2026-09-13

> **Read this first.** Every field marked `[TBM]` (To Be Measured) is a placeholder for a
> number that comes from the spike or from the built engine. These are deliberately not
> filled with plausible-looking estimates. Do not quote a `[TBM]` field in the README, in
> a resume bullet, or in an interview until it has been measured and this document
> updated. A wrong number stated confidently is worse than no number.

---

## 1. Purpose

This document specifies the audio path from microphone to on-screen pitch trace: what
each stage does, what it emits, and why it is configured the way it is. It is the
reference for the engine implementation and the source material for the eventual
write-up on latency.

Related: `TECH_DECISIONS.md` ADR-001 through ADR-004 and ADR-010 record *why* these
choices were made; this document records *how* they are implemented.

---

## 2. Signal Path Overview

```
  [ Microphone ]
        │  getUserMedia — MediaStream
        ▼
  [ MediaStreamAudioSourceNode ]          main thread, setup only
        │
        ▼
  [ AudioWorkletNode ] ──────────────────────────────────────┐
        │                                                     │
        │   ══ audio thread (AudioWorkletProcessor) ══         │
        │                                                     │
        │   Stage A — Ring buffer accumulation                 │
        │       128-sample quanta → analysis window            │
        │                                                     │
        │   Stage B — Amplitude gate (RMS)                     │
        │       below threshold → emit UNVOICED, stop          │
        │                                                     │
        │   Stage C — YIN pitch detection                      │
        │       → f0 (Hz) + clarity (0–1)                      │
        │                                                     │
        │   Stage D — Clarity gate                             │
        │       below threshold → emit UNVOICED, stop          │
        │                                                     │
        │   Stage E — Range clamp (per-instrument)             │
        │       outside [fMin, fMax] → reject                  │
        │                                                     │
        └───────────────► port.postMessage(PitchFrame) ────────┘
                                  │
        ══ main thread ══         ▼
                          Stage F — Median filter + octave correction
                                  │
                                  ▼
                          Stage G — Hz → cents deviation vs. target
                                  │
                                  ▼
                          Stage H — Canvas render (requestAnimationFrame)
                                  │
                                  ▼
                          Stage I — Accumulate frames for scoring
```

**Thread split rationale.** Stages A–E run on the audio thread because they must not be
blocked by React rendering (ADR-002). Stage F onward runs on the main thread because the
median filter needs only a short history and the result is consumed by rendering anyway;
keeping the worklet minimal reduces the amount of code that is hard to debug.

---

## 3. Stage Specifications

### Stage A — Ring buffer accumulation

`AudioWorkletProcessor.process()` is invoked with a fixed 128-sample render quantum. That
is far too short for pitch detection — 128 samples at 48 kHz is 2.67 ms, which cannot
resolve a period of a low note. Frames must be accumulated into a larger analysis window.

| Parameter | Value | Reasoning |
|---|---|---|
| Sample rate | 48000 Hz (device default; do not force) | Resampling costs CPU and quality for no benefit. Read `sampleRate` from the worklet global and compute everything from it. |
| Analysis window | 2048 samples (~42.7 ms @ 48 kHz) | Must contain at least two full periods of the lowest detectable note. At 2048 samples the floor is roughly 45 Hz, which covers bass guitar's low E (41.2 Hz) only marginally — see note below. |
| Hop size | 512 samples (~10.7 ms @ 48 kHz) | Yields ~94 analysis frames/sec, comfortably above the ~50 fps display rate. 75% overlap between windows. |
| Buffer type | Float32Array ring buffer, length ≥ window + hop | Avoids per-frame allocation on the audio thread. **Allocate once at construction.** |

**Low-frequency note.** A 2048-sample window is marginal for bass guitar's lowest notes.
Two options if bass proves unreliable in the spike: (a) widen the window to 4096 samples
for low-range instrument profiles only, accepting ~85 ms of added window latency, or
(b) declare bass supported only above its low E. Decide after measurement; record the
outcome here.

**Measured (spike, 2026-09-13).** The floor is `sampleRate / (windowSize/2 - 1)` — the
integration window is half the analysis window, so the largest evaluable lag is
`windowSize/2 - 1`. That is **46.9 Hz** at 2048 / 48 kHz, confirming the estimate above.
Cello low C (65.4 Hz) and guitar low E (82.4 Hz) are comfortably clear. **Bass low E
(41.2 Hz) and piano A0 (27.5 Hz) produce no detection at all** — the detector reports
unvoiced rather than a wrong pitch, which is the safe failure. A 4096-sample window
resolves both, at 85.3 ms of window and double the CPU. Detail in `spike/RESULTS.md` §3.
This resolves open question 3 in `MANIFEST.md`; option (b) remains available and costs
one semitone.

**Audio-thread discipline.** No allocation, no `console.log`, no try/catch in the hot
path inside `process()`. Anything that triggers garbage collection on the audio thread
causes dropouts.

### Stage B — Amplitude gate

Computes RMS over the analysis window. Below the per-instrument threshold, the frame is
marked unvoiced and emitted immediately — detection is skipped entirely, which also saves
CPU during rests.

This is the first defense against the detector emitting a wandering frequency during
silence, and against the metronome click being analyzed as a pitch.

```
rms = sqrt( Σ(sample²) / N )
voiced = rms > instrumentProfile.gateThreshold
```

Threshold is a linear amplitude value, not dB, to avoid a log on every frame.

**Open question from `REQUIREMENTS.md` §10:** does metronome bleed through the gate? If
the click is loud enough to pass, the fallback is to route the metronome to headphones
only, or to suppress analysis in a short window around each click.

### Stage C — YIN pitch detection

See ADR-003. Emits two values: estimated fundamental `f0` in Hz, and a clarity value in
0–1 derived from the aperiodicity measure (higher = more confidently periodic).

Implementation: use a maintained library (Pitchy) rather than hand-rolling, unless the
spike shows a need to control the internals. Reassess only if library overhead measurably
threatens the CPU criterion.

**Note on what is actually running where.** The client (`client/src/audio/`) uses Pitchy,
as specified. The throwaway spike hand-rolls YIN instead, because an
`AudioWorkletGlobalScope` cannot import a library and the spike has no build step — a
workaround, not a recommendation. Pitchy implements the **McLeod Pitch Method**, which is
a relative of YIN rather than YIN itself. The two share the octave-error failure mode but
not necessarily its distribution, so **the detector measurements in `spike/RESULTS.md`
describe the spike's YIN and do not automatically transfer to the client.** Re-measure
against Pitchy before quoting an accuracy or octave-error figure for the product.

### Stage D — Clarity gate

YIN's clarity value is a free confidence signal. Frames below threshold are marked
unvoiced regardless of amplitude — this catches loud-but-unpitched input such as a chair
scrape, a breath, or a consonant at the start of a sung syllable.

| Parameter | Initial value | Notes |
|---|---|---|
| Clarity threshold | 0.90 | Tune during spike. Too high and quiet or breathy notes drop out; too low and noise passes. |

### Stage E — Range clamp

Per ADR-010. Any `f0` outside the active instrument profile's `[fMin, fMax]` is rejected
as unvoiced. This is the cheapest single reduction in octave-error rate available: if a
flute profile caps at 2100 Hz, a spurious double-octave reading is discarded before it
ever reaches the display.

Range is widened by a small margin beyond the instrument's nominal range so that a
legitimately sharp or flat top note is not rejected.

### Stage F — Median filter and octave correction

See ADR-004. Runs on the main thread over the incoming `PitchFrame` stream.

| Parameter | Initial value | Notes |
|---|---|---|
| Median window | 5 frames (~53 ms of history at 512 hop) | Odd number so the median is an actual sample. Larger = smoother but laggier. |
| Octave-outlier band | within 3% of 2× or 0.5× the running median | Catches true octave errors while leaving genuine large intervals alone |

Algorithm per frame:
1. If unvoiced, push a gap marker and reset nothing — the window persists across short gaps.
2. Compute the median of the current window.
3. If the new value is within the octave-outlier band of 2× or 0.5× the median, correct it
   toward the median rather than discarding it (preserves frame count for timing).
4. Otherwise accept and push.

**Cost:** this stage introduces a latency of roughly half the window — about 26 ms at 5
frames. That is the dominant tunable term in the latency budget in §7. If the measured
total exceeds the 50 ms target, this window is the first thing to shrink.

**Known limitation.** A deliberate octave leap in an exercise would be damped by this
filter. v1 exercises are stepwise by design (`REQUIREMENTS.md` §7) so this does not
arise. If octave-leap exercises are added later, this stage needs an onset-aware bypass.

### Stage G — Hz to cents

Display and scoring are in cents, not Hz, because cents are perceptually linear — 20
cents flat sounds equally wrong at any pitch, while 5 Hz flat is inaudible at C6 and
badly out of tune at C2.

```
cents = 1200 × log₂(detectedHz / targetHz)
midi  = 69 + 12 × log₂(detectedHz / 440)
```

A4 = 440 Hz reference. Configurable later if an ensemble tuning reference (442, 443) is
ever needed; not in v1 scope.

**Scoring thresholds** (used by the scorecard, not by the display):

| Band | Deviation | Label |
|---|---|---|
| Green | within ±10 cents | on pitch |
| Amber | ±10 to ±25 cents | close |
| Red | beyond ±25 cents | off |

These are perceptual conventions, not measured values — roughly, ±5 cents is at the edge
of audibility for most listeners and ±25 cents is unmistakably out of tune. Adjust after
using the tool.

### Stage H — Canvas render

Per ADR-008. Renders on `requestAnimationFrame`, decoupled from the ~94 Hz analysis rate;
the renderer reads the latest available state rather than being driven per frame.

Y-axis is logarithmic in frequency (i.e. linear in cents/semitones), so that a semitone
occupies the same vertical distance everywhere on screen.

**Onset suppression.** Plucked and struck instruments produce a sharp attack transient
whose first frames are not yet periodic. Suppress trace rendering for the first `[TBM]`
frames after a voiced-onset transition. Determine the value by observing guitar and piano
attacks in the spike.

### Stage I — Frame accumulation for scoring

The full sequence of `PitchFrame` values for a take is retained in memory, then reduced
to per-note results after the take ends. Only the reduced results are persisted
(ADR-001) — see `DATA_MODEL.md` §5 for the shape.

---

## 4. Data Shapes

```ts
/** Emitted from the worklet, one per analysis hop (~94/sec). */
interface PitchFrame {
  timestamp: number;   // ms since take start (audio clock, NOT Date.now)
  voiced: boolean;
  hz: number | null;   // null when unvoiced
  clarity: number;     // 0–1, YIN confidence
  rms: number;         // for debug display and gate tuning
}

/** One target note in an exercise. */
interface NoteTarget {
  midi: number;        // MIDI note number; Hz derived, not stored
  startMs: number;     // relative to exercise start
  durationMs: number;
}

/** One scored note, after reduction. */
interface NoteResult {
  targetMidi: number;
  detectedHz: number | null;   // median of voiced frames in the note's window
  centsOff: number | null;     // null when the note was not attempted
  msOff: number | null;        // onset timing; null if rhythm scoring is cut
  coverage: number;            // 0–1, fraction of the window that was voiced
}
```

**On timestamps:** use the audio context clock (`currentTime` / `currentFrame`), never
`Date.now()` or `performance.now()` from the main thread. Main-thread clocks drift
relative to the audio clock and will corrupt timing scores.

---

## 5. Octave Error Strategy — Summary

Octave errors are the characteristic failure mode of this class of detector and are
attacked at three separate stages. Defense in depth is deliberate: no single stage is
reliable alone.

| Layer | Stage | Mechanism |
|---|---|---|
| 1 | E | Per-instrument frequency range clamp — rejects impossible readings outright |
| 2 | C/D | YIN's own cumulative-mean normalization, plus clarity gating |
| 3 | F | Median filter with 2×/0.5× outlier correction |

**Measurement obligation.** Record the error rate *before* filtering and *after*, against
the same recorded input. The delta is the evidence that this strategy works — and it is
the single most useful number this project will produce for a write-up or an interview.
Both fields live in §7.

**A measured gap in the defence (spike, 2026-09-13).** All three layers assume octave
errors are *sporadic* — that most frames are right and the wrong ones are outliers. Above
roughly 2.5 kHz that assumption fails. The true period is only 13–19 samples there, and
when it falls near a half-integer no integer lag correlates well while 2× the lag lands
near a whole number and scores far better, so the detector locks the sub-octave on
**every frame of a sustained note**, at a clarity around 0.98. Layer 1 does not catch it
because the sub-octave is still inside the instrument's range. Layer 3 does not catch it
because every frame agrees, so the median agrees with them. Measured at 32% of test
frequencies in 3000–3600 Hz, 0% below 2.5 kHz.

This affects **violin** (fMax 3600) and **piano** (fMax 4200) only; flute and clarinet cap
at 2200 Hz. A submultiple guard — re-checking `tau/2` and `tau/3` against a relaxed
threshold — removes it entirely and leaves C2–C6 unchanged to within 0.004 cents, at the
cost of pushing 26.5% of high-range frames below the clarity gate, i.e. silence instead of
a confident wrong octave. It is implemented in the spike and **off by default**. Tracked
as open question 4 in `MANIFEST.md`; decide with a real violin before enabling it.

---

## 6. Instrument Profiles

Per ADR-010. `fMin` and `fMax` include margin beyond the nominal playing range.
`transposition` is in semitones, applied to *notation display only* — never to the
detected frequency.

| Instrument | Nominal range | fMin (Hz) | fMax (Hz) | Transposition | Gate threshold |
|---|---|---|---|---|---|
| Voice — soprano | C4–C6 | 240 | 1100 | 0 | `[TBM]` |
| Voice — alto | F3–F5 | 165 | 750 | 0 | `[TBM]` |
| Voice — tenor | C3–C5 | 120 | 550 | 0 | `[TBM]` |
| Voice — bass | E2–E4 | 75 | 350 | 0 | `[TBM]` |
| Flute | C4–C7 | 240 | 2200 | 0 | `[TBM]` |
| Clarinet (Bb) | E3–C7 | 140 | 2200 | +2 | `[TBM]` |
| Trumpet (Bb) | F#3–D6 | 170 | 1200 | +2 | `[TBM]` |
| Violin | G3–A7 | 185 | 3600 | 0 | `[TBM]` |
| Cello | C2–C6 | 60 | 1100 | 0 | `[TBM]` |
| Guitar (melody) | E2–E6 | 75 | 1350 | −12 (notation) | `[TBM]` |
| Bass (melody) | E1–G4 | 38 | 420 | −12 (notation) | `[TBM]` |
| Piano (melody) | A0–C8 | 25 | 4200 | 0 | `[TBM]` |

**Gate thresholds are all `[TBM]`** and must be measured per instrument with a real
microphone in a real room. A single global value will not work — the dynamic range
between a flute and a trumpet into the same laptop mic is large.

**Piano and bass caveat.** Both extend below the 2048-sample window's reliable floor
(~45 Hz). See the Stage A note. The v1 fallback is to restrict exercises for these
profiles to the upper part of the range.

---

## 7. Latency Budget

Target: **under 50 ms** from sound reaching the microphone to the trace updating on
screen (`REQUIREMENTS.md` §5.2).

| Stage | Source of delay | Estimate | Measured |
|---|---|---|---|
| Hardware + OS input | Device and driver buffering | varies by device | `[TBM]` |
| A — Window fill | Hop size, not full window (overlapped) | ~10.7 ms | `[TBM]` |
| B–E — Detection | YIN over 2048 samples | — | `[TBM]` |
| F — Median filter | ~half the window, 5 frames | ~26 ms | `[TBM]` |
| G — Conversion | Two log operations | negligible | — |
| H — Render | Up to one frame at 60 fps | ~16 ms worst case | `[TBM]` |
| **Total** | | | `[TBM]` |

**If over budget**, reduce in this order:
1. Median window 5 → 3 frames (saves ~11 ms; costs some smoothing)
2. Hop 512 → 256 samples (saves ~5 ms; costs CPU)
3. Analysis window 2048 → 1024 (saves detection time; raises the low-frequency floor to
   ~90 Hz, which rules out bass and low cello — a real trade-off, not a free win)

### 7.1 Measurement Method

**Latency.** Instrument the pipeline end to end. Record `audioContext.currentTime` at
buffer capture inside the worklet, attach it to the `PitchFrame`, and compare against
`performance.now()` at canvas paint, having first measured the offset between the two
clocks. Do not estimate by eye or by video frame counting — the number will end up in a
README and needs to be defensible.

**Accuracy.** Play a synthesized reference tone of known frequency (not a live
instrument, which has its own intonation error) into the input. Sweep across the range in
semitone steps. Report mean absolute deviation in cents, and worst case.

**Octave error rate.** Record a fixed passage once. Run the recorded input through the
pipeline twice — once with Stage F disabled, once enabled. Report error rate as a
percentage of voiced frames in both conditions. Same input both times; that is what makes
the comparison meaningful.

**CPU.** Chrome DevTools performance profile during a sustained 60-second take. Confirm
the UI holds 60 fps and note the audio-thread utilization.

---

## 8. Known Limitations

| Limitation | Cause | Status |
|---|---|---|
| Monophonic only | Multi-pitch detection is out of scope (`REQUIREMENTS.md` §2.2) | By design |
| Attack transients yield garbage frames on plucked/struck instruments | Signal is not yet periodic during the attack | Mitigated by onset suppression, Stage H |
| Deliberate octave leaps are damped | Median filter cannot distinguish them from errors | Accepted; v1 exercises are stepwise |
| Very low notes below 46.9 Hz undetectable | Analysis window too short to contain two periods | **Measured.** Fails safe as unvoiced. See Stage A note |
| Sub-octave errors above ~2.5 kHz | At lags of 13–19 samples, a true period near a half-integer correlates worse than 2× that lag | **Open.** Affects violin and piano. See §5 and `spike/RESULTS.md` §6 |
| Loud room noise passing the gate | Gate is amplitude-only, not spectral | Accepted; clarity gate at Stage D catches most of it |
| Safari behavior unverified | AudioWorklet support historically inconsistent | Best-effort; not a success criterion |

---

## 9. Spike Checklist

The spike exists to fill this document's `[TBM]` fields and to de-risk ADR-002 before
anything else is built. It is throwaway code — a single HTML file, no framework, no repo
hygiene.

- [ ] `getUserMedia` → `AudioWorkletNode` wired up, worklet module loads
- [ ] Ring buffer accumulates 128-sample quanta into a 2048 window without allocation
- [ ] YIN returns plausible `f0` for a sung note
- [ ] Note name and cents deviation display live on screen
- [ ] Amplitude gate silences the display during rests
- [ ] Median filter visibly reduces octave jumps
- [ ] Latency measured by the method in §7.1
- [ ] Accuracy measured against a synthesized sweep
- [ ] Octave error rate measured, filter off vs. on
- [ ] Tested against at least one voice and one physical instrument
- [ ] Metronome bleed question (§Stage B) answered
- [ ] **All `[TBM]` fields in this document replaced with measured values**

The last item is the definition of done for week 1.
