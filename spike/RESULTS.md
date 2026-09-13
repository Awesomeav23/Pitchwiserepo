# Pitchwise spike — synthetic measurement results

Produced by `spike/measure.mjs`. **These are detector measurements taken with an
in-process signal generator — no microphone, no room, no acoustic path.** They
bound what the algorithm can do; they are not the end-to-end numbers that
`AUDIO_PIPELINE.md` §7 asks for. Do not copy them into the latency budget.

Engine: Node v23.10.0 (V8, same family as Chrome). Sample rate 48000 Hz.

## 1. Accuracy — synthesized semitone sweep

Method per §7.1 *Accuracy*: a synthesized tone of known frequency at every
semitone across the profile range; mean absolute deviation and worst case in cents.

| Profile | Timbre | Semitones | Mean abs | p95 | Worst | Undetected |
|---|---|---|---:|---:|---:|---|
| Voice — tenor | sine | 25 | **0.04¢** | 0.08¢ | 0.86¢ @ D3 | none |
| Voice — tenor | weakFundamental | 25 | **0.03¢** | 0.08¢ | 0.17¢ @ F3 | none |
| Voice — soprano | sine | 25 | **0.10¢** | 0.25¢ | 0.44¢ @ E4 | none |
| Voice — soprano | weakFundamental | 25 | **0.08¢** | 0.26¢ | 0.27¢ @ G5 | none |
| Violin | sine | 50 | **0.57¢** | 2.86¢ | 3.14¢ @ F#7 | none |
| Violin | weakFundamental | 50 | **24.80¢** | 5.90¢ | 1200.67¢ @ G#7 | none |
| Flute | sine | 37 | **0.30¢** | 1.18¢ | 1.63¢ @ C7 | none |
| Flute | weakFundamental | 37 | **0.28¢** | 1.69¢ | 2.23¢ @ B6 | none |
| Cello | sine | 49 | **0.06¢** | 0.21¢ | 0.90¢ @ D3 | none |
| Cello | weakFundamental | 49 | **0.05¢** | 0.16¢ | 0.27¢ @ C6 | none |

## 2. Octave error rate — filter off vs on, against ground truth

Method per §7.1 *Octave error rate*: one generated passage, run through the
pipeline twice, Stage F disabled then enabled. An error is a voiced frame within
±3% of 2× or 0.5× the known true frequency. Same input and same code both times.

The passage uses a deliberately weak fundamental with vibrato and attack
transients, which is the condition that provokes octave errors.

| Profile | Guard | Clarity | Frames | Filter OFF | Filter ON | Reduction |
|---|---|---:|---:|---:|---:|---:|
| Voice — tenor | off | 0.90 | 916 | **0.00%** (0) | **0.00%** (0) | — |
| Voice — tenor | 0.35 | 0.90 | 916 | **0.00%** (0) | **0.00%** (0) | — |
| Cello | off | 0.90 | 916 | **0.00%** (0) | **0.00%** (0) | — |
| Cello | 0.35 | 0.90 | 916 | **0.00%** (0) | **0.00%** (0) | — |
| Violin | off | 0.90 | 954 | **2.62%** (25) | **0.00%** (0) | 100% |
| Violin | 0.35 | 0.90 | 929 | **0.00%** (0) | **0.00%** (0) | — |

Stage F removed **every** octave error in this passage. That is the sporadic
case it is designed for, and it is the evidence §5 asks for.

It does **not** help with the other case: when the detector locks the wrong
octave for an entire sustained note, every frame agrees and the median agrees
with them. §1 shows exactly that — violin G#7 reads 1200¢ low on 32 of 32
frames, *after* filtering. See §6. Defense in depth has a gap there.

## 3. Low-frequency floor — MANIFEST open question 3

§3 Stage A puts the floor at "roughly 45 Hz" for a 2048-sample window. The
integration window is half the analysis window, so the largest evaluable lag is
`windowSize/2 - 1` and the floor is `sampleRate / (windowSize/2 - 1)`:

- **1024 samples** → floor **93.9 Hz**, window 21.3 ms
- **2048 samples** → floor **46.9 Hz**, window 42.7 ms
- **4096 samples** → floor **23.4 Hz**, window 85.3 ms

Lowest notes of the affected profiles, 2048 vs 4096:

| Note | True Hz | W=2048 | W=4096 | Verdict |
|---|---:|---|---|---|
| E1 (bass low E) | 41.20 | no detection | 0.0¢ (65/68 voiced) | **needs 4096** |
| A1 | 55.00 | 0.0¢ (69/72 voiced) | 0.0¢ (66/68 voiced) | OK at 2048 |
| E2 (guitar low E) | 82.41 | 0.0¢ (69/72 voiced) | 0.0¢ (66/68 voiced) | OK at 2048 |
| C2 (cello low C) | 65.41 | 0.0¢ (69/72 voiced) | 0.0¢ (66/68 voiced) | OK at 2048 |
| A0 (piano lowest) | 27.50 | no detection | 0.0¢ (65/68 voiced) | **needs 4096** |
| G2 | 98.00 | 0.0¢ (69/72 voiced) | 0.0¢ (66/68 voiced) | OK at 2048 |

**Answer to OQ3.** A 2048-sample window is adequate for cello (low C = 65.4 Hz,
comfortably above the 46.9 Hz floor) and for guitar and cello profiles generally.
It is *not* adequate for **bass low E (41.2 Hz)** or **piano A0 (27.5 Hz)**: both
fall below the floor and produce no detection at all — the detector reports
unvoiced rather than a wrong pitch, which is the safe failure. Option (a) from
§3 Stage A works: 4096 samples resolves both, at 85.3 ms of window latency and
double the CPU (§4). Option (b), declaring bass supported only above low E,
costs nothing and loses one semitone of range.

## 4. CPU cost per analysis frame

Stages B–E only, measured in isolation. §7.1 asks for a Chrome DevTools profile
of the real thing; this bounds the algorithm, and the browser number will be
higher because it includes postMessage and the render path.

Cost is dominated by the difference-function loop, which runs to
`tauMax = sampleRate / fMin`. A profile with a low fMin is therefore markedly
more expensive than a high one — the range clamp in §6 is a CPU control as well
as an accuracy control. Below, a mid-range profile (fMin 60, fMax 2000):

| Window | Hop | Frames/s | µs/frame | Budget | Load |
|---:|---:|---:|---:|---:|---:|
| 1024 | 512 | 94 | 297 | 10667 | **2.8%** |
| 1024 | 256 | 188 | 299 | 5333 | **5.6%** |
| 2048 | 512 | 94 | 924 | 10667 | **8.7%** |
| 2048 | 256 | 188 | 925 | 5333 | **17.3%** |
| 4096 | 512 | 94 | 1859 | 10667 | **17.4%** |
| 4096 | 256 | 188 | 1857 | 5333 | **34.8%** |


Per instrument profile at window 2048, hop 512:

| Profile | fMin | tauMax | µs/frame | Load |
|---|---:|---:|---:|---:|
| Voice — soprano | 240 Hz | 200 | 234 | **2.2%** |
| Voice — tenor | 120 Hz | 400 | 464 | **4.3%** |
| Violin | 185 Hz | 260 | 304 | **2.8%** |
| Guitar (melody) | 75 Hz | 640 | 740 | **6.9%** |
| Cello | 60 Hz | 800 | 923 | **8.7%** |
| Bass (melody) | 38 Hz | 1023 | 1180 | **11.1%** |
| Piano (melody) | 25 Hz | 1023 | 1181 | **11.1%** |

All well inside budget on this machine, but these are Node/V8 numbers on an
idle CPU. §7.1 still wants a Chrome profile during a real 60-second take.

## 5. Stage F latency — arithmetic, not a measurement

| Median window | Frames of lag | @ hop 512 | @ hop 256 |
|---:|---:|---:|---:|
| 3 | 1 | 10.7 ms | 5.3 ms |
| 5 | 2 | 21.3 ms | 10.7 ms |
| 7 | 3 | 32.0 ms | 16.0 ms |
| 9 | 4 | 42.7 ms | 21.3 ms |

§3 Stage F estimates ~26 ms for a 5-frame window at hop 512; the arithmetic gives
21.3 ms of filter lag, and the hop fill adds 10.7 ms.

## 6. Sub-octave errors above 2.5 kHz — a finding, not a [TBM] field

The true period of a high note is only a handful of samples: 3322 Hz at 48 kHz
is a lag of 14.45. When the true lag falls near a half-integer, *no* integer lag
correlates well, while 2x the lag lands near a whole number and scores far
better — so YIN's threshold search returns the sub-octave. Measured `d'` at
3322 Hz: **d'(14) = 0.148** (just above the 0.1 threshold) vs **d'(29) = 0.009**.

This defeats all three layers of §5: Stage E does not catch it (the sub-octave is
still inside the instrument range), and Stage F does not catch it (every frame
agrees, so the median agrees). Clarity is ~0.98 — confidently wrong.

Sub-octave error rate by frequency band, weak-fundamental timbre:

| Band | Lag (samples) | Guard off | Guard 0.25 | Guard 0.35 |
|---|---:|---:|---:|---:|
| 500–1000 Hz | 48.0–96.0 | 0% | 0% | 0% |
| 1000–2000 Hz | 24.0–48.0 | 0% | 0% | 0% |
| 2000–2500 Hz | 19.2–24.0 | 0% | 0% | 0% |
| 2500–3000 Hz | 16.0–19.2 | 12% | 0% | 0% |
| 3000–3600 Hz | 13.3–16.0 | 32% | 0% | 0% |
| 3600–4200 Hz | 11.4–13.3 | 28% | 2% | 0% |

**Cost of the guard at 0.35:** 26.5% of frames between 2.5–4.2 kHz
fall below the 0.90 clarity gate and are reported unvoiced rather than wrong.
Across C2–C6 the guard changes the detected frequency by at most 
**0.006 cents** — it does not disturb the range where YIN already works.

**Recommendation.** Silence beats a confident wrong octave, so the trade is
worth taking for violin (fMax 3600) and piano (fMax 4200). Flute and clarinet
cap at 2200 Hz and are unaffected. Two things to decide with real instruments:
whether to enable the guard, and whether the 0.90 clarity gate should be relaxed
at the top of the range to recover the frames it now drops. Neither belongs in
AUDIO_PIPELINE.md until it has been heard on a real violin.

## Still [TBM] — needs hardware

| Field | Why this harness cannot fill it |
|---|---|
| §7 hardware + OS input latency | Needs a real device; run the acoustic loopback in `index.html` |
| §7 total end-to-end latency | Needs mic → canvas paint on real hardware |
| §7 render (Stage H) | Needs a browser compositor |
| §6 gate thresholds (all 12) | Needs each instrument in a real room through a real mic |
| §3 Stage H onset suppression frames | Needs a plucked/struck instrument attack |
| Stage B metronome bleed (OQ2) | Needs speakers and a mic in the same room |
| Real-instrument octave error rate | Synthetic timbres understate it |
| Octave-guard decision (§6) | Needs a real violin at the top of its range |

