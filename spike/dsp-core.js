/* ===========================================================================
   Pitchwise spike — shared DSP core (Stages A–G of docs/AUDIO_PIPELINE.md §3)

   This file is the single source of truth for the signal path. It is used
   VERBATIM by three consumers:
     1. the AudioWorkletProcessor (Stages A–E, audio thread)
     2. the main-thread offline replay used for the filter-off/filter-on A/B
     3. tools/measure.mjs, the headless Node harness
   Using one copy is what makes the §7.1 octave-error comparison meaningful:
   "Same input both times" also has to mean same code both times.

   Plain ES5-compatible JS. No imports, no DOM, no console. Attaches to
   globalThis.PitchwiseDSP.
   =========================================================================== */
(function (root) {
'use strict';

/* ---------- Stage G — Hz / cents / MIDI (AUDIO_PIPELINE §3 Stage G) -------- */

var A4 = 440;
var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function hzToMidi(hz) { return 69 + 12 * Math.log2(hz / A4); }
function midiToHz(m) { return A4 * Math.pow(2, (m - 69) / 12); }
function hzToCents(hz, targetHz) { return 1200 * Math.log2(hz / targetHz); }

function noteName(midi) {
  var r = Math.round(midi);
  return NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}

/** Nearest equal-tempered note and the signed cents deviation from it. */
function nearestNote(hz) {
  var m = hzToMidi(hz);
  var r = Math.round(m);
  return { midi: r, name: noteName(r), cents: (m - r) * 100 };
}

/* ---------- Stage A — Ring buffer accumulation ----------------------------
   128-sample render quanta in, fixed-size overlapping analysis windows out.
   Allocates ONLY in the constructor. takeFrame() returns a reused Float32Array.
   Window boundaries are tracked by absolute sample index so successive frames
   are exactly hopSize apart regardless of block size.
   -------------------------------------------------------------------------- */

function RingAnalyzer(windowSize, hopSize) {
  var cap = 1;
  while (cap < windowSize + hopSize) cap <<= 1;   // power of two -> mask, no %
  this.windowSize = windowSize;
  this.hopSize = hopSize;
  this.ring = new Float32Array(cap);
  this.mask = cap - 1;
  this.frame = new Float32Array(windowSize);      // reused every hop
  this.total = 0;          // absolute samples written since reset
  this.nextEnd = windowSize; // absolute index one past the end of next window
  this.frameEnd = 0;       // absolute index one past the end of the last frame
}

RingAnalyzer.prototype.reset = function () {
  this.total = 0;
  this.nextEnd = this.windowSize;
  this.frameEnd = 0;
  this.ring.fill(0);
};

RingAnalyzer.prototype.push = function (block) {
  var ring = this.ring, mask = this.mask, w = this.total, n = block.length, i;
  for (i = 0; i < n; i++) ring[(w + i) & mask] = block[i];
  this.total = w + n;
};

RingAnalyzer.prototype.hasFrame = function () { return this.total >= this.nextEnd; };

RingAnalyzer.prototype.takeFrame = function () {
  var W = this.windowSize, ring = this.ring, mask = this.mask, out = this.frame;
  var start = this.nextEnd - W, i;
  for (i = 0; i < W; i++) out[i] = ring[(start + i) & mask];
  this.frameEnd = this.nextEnd;
  this.nextEnd += this.hopSize;
  return out;
};

/* ---------- Stage B — Amplitude gate --------------------------------------
   Linear RMS, not dB: §3 Stage B avoids a log on every frame.
   -------------------------------------------------------------------------- */

function rms(buf, n) {
  var s = 0, i, v;
  for (i = 0; i < n; i++) { v = buf[i]; s += v * v; }
  return Math.sqrt(s / n);
}

/* ---------- Stage C — YIN pitch detection ---------------------------------
   de Cheveigne & Kawahara (2002), steps 1-5. ADR-003.

   The integration window is half the analysis window, so the largest lag we
   can evaluate is windowSize/2 - 1. At 2048 samples / 48 kHz that puts the
   low-frequency floor at 48000/1023 = 46.9 Hz, which is the "~45 Hz" quoted
   in §3 Stage A. Bass low E (41.2 Hz) is below it — see OQ3.

   Allocates only in the constructor.
   -------------------------------------------------------------------------- */

function Yin(windowSize, sampleRate, threshold, octaveGuard) {
  this.windowSize = windowSize;
  this.half = windowSize >> 1;
  this.sampleRate = sampleRate;
  this.threshold = threshold == null ? 0.1 : threshold;  // d'(tau) threshold
  // Optional submultiple check — see detect(). 0 disables it, which is the
  // algorithm exactly as specified in ADR-003.
  this.octaveGuard = octaveGuard || 0;
  this.yin = new Float32Array(this.half);                // reused
  this.result = { hz: 0, clarity: 0, tau: 0 };           // reused
}

/** Lowest detectable frequency for this window size. */
Yin.prototype.floorHz = function () { return this.sampleRate / (this.half - 1); };

/**
 * @param buf      analysis window, length >= windowSize
 * @param fMinHz   search bound (Stage E range, narrowed for CPU); may be null
 * @param fMaxHz   search bound; may be null
 * Returns the reused result object {hz, clarity, tau}. hz is 0 if no estimate.
 */
Yin.prototype.detect = function (buf, fMinHz, fMaxHz) {
  var half = this.half, yin = this.yin, sr = this.sampleRate;
  var tauMax = half - 1, tauMin = 2, tau, j, sum, d, runningSum;

  // Restrict the lag search to the instrument's plausible range. This is a CPU
  // saving and a mild octave-error defence; Stage E still rejects properly.
  if (fMinHz) { tau = Math.ceil(sr / fMinHz); if (tau < tauMax) tauMax = tau; }
  if (fMaxHz) { tau = Math.floor(sr / fMaxHz); if (tau > tauMin) tauMin = tau; }
  if (tauMax > half - 1) tauMax = half - 1;
  if (tauMin < 2) tauMin = 2;

  var res = this.result;
  if (tauMin >= tauMax) { res.hz = 0; res.clarity = 0; res.tau = 0; return res; }

  // Step 1+2: difference function and cumulative mean normalisation, fused.
  yin[0] = 1;
  runningSum = 0;
  for (tau = 1; tau <= tauMax; tau++) {
    sum = 0;
    for (j = 0; j < half; j++) { d = buf[j] - buf[j + tau]; sum += d * d; }
    runningSum += sum;
    yin[tau] = runningSum === 0 ? 1 : (sum * tau) / runningSum;
  }

  // Step 3: absolute threshold — first local minimum below threshold.
  var tauEst = -1;
  for (tau = tauMin; tau <= tauMax; tau++) {
    if (yin[tau] < this.threshold) {
      while (tau + 1 <= tauMax && yin[tau + 1] < yin[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst === -1) {
    // No confident period. Fall back to the global minimum; the clarity value
    // derived from it will be low, so Stage D will reject it.
    var best = tauMin;
    for (tau = tauMin + 1; tau <= tauMax; tau++) if (yin[tau] < yin[best]) best = tau;
    tauEst = best;
  }

  // Submultiple guard (OFF unless octaveGuard > 0).
  //
  // Above ~2.5 kHz the true period is only 13-19 samples, so when it falls near
  // a half-integer no integer lag correlates well, while 2x the lag lands close
  // to a whole number and scores far better. YIN then locks the sub-octave on
  // every frame. Measured at 48 kHz / 2048: 0% below 2.5 kHz, 32% at 3-3.6 kHz.
  // Because every frame is wrong, Stage F cannot rescue it — the median is
  // wrong too — and Stage E does not catch it because the sub-octave is still
  // inside the instrument's range.
  //
  // The guard re-checks tauEst/2 and tauEst/3 against a relaxed threshold and
  // prefers the shorter lag when it is a credible period.
  if (this.octaveGuard > 0) {
    var k, t, a, c, cand;
    for (k = 2; k <= 3; k++) {
      t = tauEst / k;
      if (t < tauMin) continue;
      a = Math.floor(t); c = Math.ceil(t);
      cand = yin[a] <= yin[c] ? a : c;
      if (cand >= tauMin && yin[cand] < this.octaveGuard) { tauEst = cand; k = 1; }
    }
  }

  // Step 5: parabolic interpolation for sub-sample lag resolution. Without
  // this the quantisation error at high pitches is tens of cents.
  var x0 = tauEst > tauMin ? tauEst - 1 : tauEst;
  var x2 = tauEst + 1 <= tauMax ? tauEst + 1 : tauEst;
  var better;
  if (x0 === tauEst) better = yin[tauEst] <= yin[x2] ? tauEst : x2;
  else if (x2 === tauEst) better = yin[tauEst] <= yin[x0] ? tauEst : x0;
  else {
    var s0 = yin[x0], s1 = yin[tauEst], s2 = yin[x2];
    var denom = 2 * (2 * s1 - s2 - s0);
    better = denom === 0 ? tauEst : tauEst + (s2 - s0) / denom;
  }

  var clarity = 1 - yin[tauEst];
  if (clarity < 0) clarity = 0; else if (clarity > 1) clarity = 1;

  res.hz = better > 0 ? sr / better : 0;
  res.clarity = clarity;
  res.tau = better;
  return res;
};

/* ---------- Stages B–E, one analysis frame --------------------------------
   Writes into a caller-supplied object so the audio thread allocates nothing.
   `reason` records which stage rejected the frame — needed for gate tuning and
   for the metronome-bleed question (§3 Stage B).
   -------------------------------------------------------------------------- */

var REASON = { VOICED: 0, AMPLITUDE: 1, CLARITY: 2, RANGE: 3 };

function stageBtoE(frame, n, yin, profile, clarityThreshold, out) {
  var level = rms(frame, n);
  out.rms = level;
  out.hz = null;
  out.clarity = 0;
  out.voiced = false;

  // Stage B — amplitude gate. Detection is skipped entirely below threshold.
  if (level <= profile.gateThreshold) { out.reason = REASON.AMPLITUDE; return out; }

  // Stage C — YIN.
  var r = yin.detect(frame, profile.fMin, profile.fMax);
  out.clarity = r.clarity;

  // Stage D — clarity gate.
  if (r.clarity < clarityThreshold) { out.reason = REASON.CLARITY; return out; }

  // Stage E — per-instrument range clamp.
  if (r.hz <= 0 || r.hz < profile.fMin || r.hz > profile.fMax) {
    out.reason = REASON.RANGE;
    return out;
  }

  out.hz = r.hz;
  out.voiced = true;
  out.reason = REASON.VOICED;
  return out;
}

/* ---------- Stage F — Median filter + octave correction -------------------
   §3 Stage F, algorithm as written there:
     1. unvoiced -> gap marker, window persists (nothing reset)
     2. median of the current window
     3. new value within `band` of 2x or 0.5x the median -> correct toward the
        median rather than discard, preserving frame count for timing
     4. otherwise accept and push
   Output is the median of the window after the push, which is why this stage
   costs ~half the window in latency (§3 Stage F "Cost").
   -------------------------------------------------------------------------- */

function MedianOctaveFilter(size, band) {
  this.size = size;
  this.band = band == null ? 0.03 : band;
  this.buf = new Float64Array(size);
  this.scratch = new Float64Array(size);
  this.count = 0;
  this.idx = 0;
  this.corrections = 0;   // stats: how often step 3 fired
  this.pushes = 0;
}

MedianOctaveFilter.prototype.reset = function () {
  this.count = 0; this.idx = 0; this.corrections = 0; this.pushes = 0;
};

MedianOctaveFilter.prototype.median = function () {
  var n = this.count;
  if (n === 0) return null;
  var s = this.scratch, i, j, v;
  for (i = 0; i < n; i++) s[i] = this.buf[i];
  for (i = 1; i < n; i++) {            // insertion sort; n is 3-9
    v = s[i]; j = i - 1;
    while (j >= 0 && s[j] > v) { s[j + 1] = s[j]; j--; }
    s[j + 1] = v;
  }
  return (n & 1) ? s[(n - 1) >> 1] : 0.5 * (s[(n >> 1) - 1] + s[n >> 1]);
};

/** @param hz voiced frequency, or null for an unvoiced frame (gap marker). */
MedianOctaveFilter.prototype.push = function (hz) {
  if (hz == null) return null;          // step 1: gap, window persists
  var v = hz, med = this.median(), b = this.band, r;
  if (med != null) {                    // step 2+3
    r = v / med;
    if (Math.abs(r - 2) <= 2 * b) { v = v * 0.5; this.corrections++; }
    else if (Math.abs(r - 0.5) <= 0.5 * b) { v = v * 2; this.corrections++; }
  }
  this.buf[this.idx] = v;               // step 4
  this.idx = (this.idx + 1) % this.size;
  if (this.count < this.size) this.count++;
  this.pushes++;
  return this.median();
};

/* ---------- Offline full-pipeline replay (Stages A–F) ---------------------
   Used for the §7.1 octave-error A/B and by the Node harness. Identical stage
   code to the worklet; only the driving loop differs.
   -------------------------------------------------------------------------- */

var DEFAULTS = {
  windowSize: 2048,
  hopSize: 512,
  clarityThreshold: 0.90,
  yinThreshold: 0.1,
  octaveGuard: 0,
  medianWindow: 5,
  octaveBand: 0.03,
  medianFilter: true
};

function withDefaults(opts) {
  var o = {}, k;
  for (k in DEFAULTS) o[k] = DEFAULTS[k];
  if (opts) for (k in opts) if (opts[k] !== undefined) o[k] = opts[k];
  return o;
}

/**
 * @param samples Float32Array of input
 * @param sampleRate
 * @param opts {windowSize,hopSize,profile,clarityThreshold,medianWindow,
 *              octaveBand,medianFilter}
 * @returns array of PitchFrame-shaped objects, plus `.filtered` per frame
 */
function analyzeBuffer(samples, sampleRate, opts) {
  var o = withDefaults(opts);
  var profile = o.profile || { fMin: 60, fMax: 2000, gateThreshold: 0.01 };
  var ra = new RingAnalyzer(o.windowSize, o.hopSize);
  var yin = new Yin(o.windowSize, sampleRate, o.yinThreshold, o.octaveGuard);
  var filt = new MedianOctaveFilter(o.medianWindow, o.octaveBand);
  var scratch = { timestamp: 0, voiced: false, hz: null, clarity: 0, rms: 0, reason: 0 };
  var frames = [];
  var BLK = 128, p, end, buf, f;

  for (p = 0; p < samples.length; p += BLK) {
    end = p + BLK < samples.length ? p + BLK : samples.length;
    ra.push(samples.subarray(p, end));
    while (ra.hasFrame()) {
      buf = ra.takeFrame();
      stageBtoE(buf, o.windowSize, yin, profile, o.clarityThreshold, scratch);
      f = {
        timestamp: (ra.frameEnd / sampleRate) * 1000,
        endSample: ra.frameEnd,
        voiced: scratch.voiced,
        hz: scratch.hz,
        clarity: scratch.clarity,
        rms: scratch.rms,
        reason: scratch.reason,
        filtered: null
      };
      f.filtered = o.medianFilter ? filt.push(scratch.hz) : scratch.hz;
      frames.push(f);
    }
  }
  frames.corrections = filt.corrections;
  return frames;
}

/* ---------- Octave-error scoring (§5 "Measurement obligation") ------------- */

/**
 * Ground-truth mode: an octave error is a voiced frame whose reported pitch is
 * within `band` of 2x or 0.5x the known true frequency at that instant.
 * @param truthAt fn(endSample) -> true Hz, or null where no note is sounding
 */
function octaveErrorRate(frames, truthAt, band, useFiltered) {
  band = band == null ? 0.03 : band;
  var voiced = 0, errors = 0, i, f, t, v, r;
  for (i = 0; i < frames.length; i++) {
    f = frames[i];
    v = useFiltered ? f.filtered : f.hz;
    if (!f.voiced || v == null) continue;
    t = truthAt(f.endSample);
    if (!t) continue;
    voiced++;
    r = v / t;
    if (Math.abs(r - 2) <= 2 * band || Math.abs(r - 0.5) <= 0.5 * band) errors++;
  }
  return { voiced: voiced, errors: errors, rate: voiced ? errors / voiced : 0 };
}

/**
 * No-ground-truth mode, for a recorded real passage. An octave error is a
 * voiced frame sitting within `band` of 2x or 0.5x the median of a window of
 * +/-`half` frames around it. This is a heuristic, and any result derived from
 * it must be labelled as such.
 */
function octaveErrorRateHeuristic(frames, band, useFiltered, half) {
  band = band == null ? 0.03 : band;
  half = half || 11;
  var vals = [], i, f, v;
  for (i = 0; i < frames.length; i++) {
    f = frames[i];
    v = useFiltered ? f.filtered : f.hz;
    vals.push(f.voiced && v != null ? v : null);
  }
  var voiced = 0, errors = 0, j, lo, hi, w, med, r;
  for (i = 0; i < vals.length; i++) {
    if (vals[i] == null) continue;
    voiced++;
    lo = i - half < 0 ? 0 : i - half;
    hi = i + half >= vals.length ? vals.length - 1 : i + half;
    w = [];
    for (j = lo; j <= hi; j++) if (vals[j] != null) w.push(vals[j]);
    if (w.length < 3) continue;
    w.sort(function (a, b) { return a - b; });
    med = w.length & 1 ? w[(w.length - 1) >> 1] : 0.5 * (w[w.length / 2 - 1] + w[w.length / 2]);
    r = vals[i] / med;
    if (Math.abs(r - 2) <= 2 * band || Math.abs(r - 0.5) <= 0.5 * band) errors++;
  }
  return { voiced: voiced, errors: errors, rate: voiced ? errors / voiced : 0 };
}

/* ---------- Instrument profiles (AUDIO_PIPELINE §6) -----------------------
   fMin/fMax are from the table and are locked. gateThreshold is [TBM] in the
   document; the value here is a PLACEHOLDER so the spike will run at all, and
   is what the Calibrate panel overwrites. Do not copy it into the document.
   -------------------------------------------------------------------------- */

var PLACEHOLDER_GATE = 0.01;

var PROFILES = [
  { id: 'soprano',  label: 'Voice — soprano', nominal: 'C4–C6',  fMin: 240,  fMax: 1100, transposition: 0 },
  { id: 'alto',     label: 'Voice — alto',    nominal: 'F3–F5',  fMin: 165,  fMax: 750,  transposition: 0 },
  { id: 'tenor',    label: 'Voice — tenor',   nominal: 'C3–C5',  fMin: 120,  fMax: 550,  transposition: 0 },
  { id: 'bassvox',  label: 'Voice — bass',    nominal: 'E2–E4',  fMin: 75,   fMax: 350,  transposition: 0 },
  { id: 'flute',    label: 'Flute',           nominal: 'C4–C7',  fMin: 240,  fMax: 2200, transposition: 0 },
  { id: 'clarinet', label: 'Clarinet (Bb)',   nominal: 'E3–C7',  fMin: 140,  fMax: 2200, transposition: 2 },
  { id: 'trumpet',  label: 'Trumpet (Bb)',    nominal: 'F#3–D6', fMin: 170,  fMax: 1200, transposition: 2 },
  { id: 'violin',   label: 'Violin',          nominal: 'G3–A7',  fMin: 185,  fMax: 3600, transposition: 0 },
  { id: 'cello',    label: 'Cello',           nominal: 'C2–C6',  fMin: 60,   fMax: 1100, transposition: 0 },
  { id: 'guitar',   label: 'Guitar (melody)', nominal: 'E2–E6',  fMin: 75,   fMax: 1350, transposition: -12 },
  { id: 'bass',     label: 'Bass (melody)',   nominal: 'E1–G4',  fMin: 38,   fMax: 420,  transposition: -12 },
  { id: 'piano',    label: 'Piano (melody)',  nominal: 'A0–C8',  fMin: 25,   fMax: 4200, transposition: 0 }
];
for (var pi = 0; pi < PROFILES.length; pi++) {
  PROFILES[pi].gateThreshold = PLACEHOLDER_GATE;
  PROFILES[pi].gateMeasured = false;
}

function profileById(id) {
  for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].id === id) return PROFILES[i];
  return PROFILES[0];
}

root.PitchwiseDSP = {
  A4: A4,
  REASON: REASON,
  DEFAULTS: DEFAULTS,
  PROFILES: PROFILES,
  PLACEHOLDER_GATE: PLACEHOLDER_GATE,
  profileById: profileById,
  hzToMidi: hzToMidi,
  midiToHz: midiToHz,
  hzToCents: hzToCents,
  noteName: noteName,
  nearestNote: nearestNote,
  RingAnalyzer: RingAnalyzer,
  Yin: Yin,
  rms: rms,
  stageBtoE: stageBtoE,
  MedianOctaveFilter: MedianOctaveFilter,
  analyzeBuffer: analyzeBuffer,
  octaveErrorRate: octaveErrorRate,
  octaveErrorRateHeuristic: octaveErrorRateHeuristic
};

})(typeof globalThis !== 'undefined' ? globalThis : self);
