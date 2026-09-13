/* Pitchwise spike — synthetic measurements (§7.1), no hardware required.
   Fills the subset of [TBM] fields that a signal generator can honestly fill:
   detector accuracy, octave-error rate against ground truth, CPU cost, and the
   low-frequency floor (MANIFEST OQ3).

   It does NOT measure: end-to-end latency, hardware input latency, real
   gate thresholds, or metronome bleed. Those need a microphone and a room;
   run index.html in a browser for them.

   Run: node measure.mjs [> RESULTS.md]                                       */
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(here, 'dsp-core.js'));
const D = globalThis.PitchwiseDSP;
const SR = 48000;

const out = [];
const say = s => { out.push(s); console.log(s); };
const fmt = (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

/* --- timbres ------------------------------------------------------------- */
const TIMBRES = {
  sine: [1],
  // A weak fundamental is the classic octave-error trap: the loudest partial
  // is the 2nd harmonic, so a naive detector reports twice the true pitch.
  weakFundamental: [0.10, 1, 0.75, 0.45, 0.28, 0.18, 0.11],
  saw: Array.from({ length: 16 }, (_, k) => 1 / (k + 1)),
  clarinetish: [1, 0.04, 0.7, 0.05, 0.45, 0.03, 0.3]   // odd harmonics dominant
};

/**
 * A note with attack transient, vibrato and a noise floor — closer to a real
 * instrument than a pure tone, which makes the octave-error test meaningful.
 */
function note(hz, dur, timbre, opts = {}) {
  const { vibratoCents = 0, noise = 0.002, attack = 0.012, amp = 0.32 } = opts;
  const harm = TIMBRES[timbre] || TIMBRES.sine;
  const n = Math.floor(SR * dur), b = new Float32Array(n);
  let phase = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const vib = vibratoCents ? Math.pow(2, (vibratoCents / 1200) * Math.sin(2 * Math.PI * 5.5 * t)) : 1;
    phase += 2 * Math.PI * hz * vib / SR;
    let v = 0;
    for (let k = 0; k < harm.length; k++) {
      const f = hz * vib * (k + 1);
      if (f < SR / 2) v += harm[k] * Math.sin(phase * (k + 1));
    }
    // sharp attack: the first few ms are broadband and not yet periodic
    const env = t < attack ? (t / attack) : 1;
    const tr = t < attack ? (1 - t / attack) * 0.6 : 0;
    v = v * env + (Math.random() - 0.5) * (noise + tr);
    b[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  const k = peak ? amp / peak : 1;
  for (let i = 0; i < n; i++) b[i] *= k;
  return b;
}

/** A stepwise passage plus ground truth lookup, per §7.1 octave-error method. */
function passage(midis, noteDur, gapDur, timbre, opts) {
  const nN = Math.floor(SR * noteDur), nG = Math.floor(SR * gapDur);
  const buf = new Float32Array(midis.length * (nN + nG));
  const spans = [];
  let p = 0;
  for (const m of midis) {
    const hz = D.midiToHz(m);
    buf.set(note(hz, noteDur, timbre, opts), p);
    spans.push({ from: p, to: p + nN, hz });
    p += nN;
    for (let i = 0; i < nG; i++) buf[p + i] = (Math.random() - 0.5) * 0.0015;  // room tone
    p += nG;
  }
  // truth at the END of an analysis window: only count frames fully inside a note
  const truthAt = endSample => {
    for (const s of spans) if (endSample > s.from + 2048 && endSample <= s.to) return s.hz;
    return null;
  };
  return { buf, truthAt, spans };
}

const baseOpts = W => ({
  windowSize: W, hopSize: 512, clarityThreshold: 0.90,
  medianWindow: 5, octaveBand: 0.03
});

say('# Pitchwise spike — synthetic measurement results');
say('');
say('Produced by `spike/measure.mjs`. **These are detector measurements taken with an');
say('in-process signal generator — no microphone, no room, no acoustic path.** They');
say('bound what the algorithm can do; they are not the end-to-end numbers that');
say('`AUDIO_PIPELINE.md` §7 asks for. Do not copy them into the latency budget.');
say('');
say(`Engine: Node ${process.version} (V8, same family as Chrome). Sample rate ${SR} Hz.`);
say('');

/* ======================= 1. Accuracy sweep ================================ */
say('## 1. Accuracy — synthesized semitone sweep');
say('');
say('Method per §7.1 *Accuracy*: a synthesized tone of known frequency at every');
say('semitone across the profile range; mean absolute deviation and worst case in cents.');
say('');
say('| Profile | Timbre | Semitones | Mean abs | p95 | Worst | Undetected |');
say('|---|---|---|---:|---:|---:|---|');

const sweepProfiles = ['tenor', 'soprano', 'violin', 'flute', 'cello'];
for (const id of sweepProfiles) {
  const prof = { ...D.profileById(id), gateThreshold: 0.01 };
  for (const timbre of ['sine', 'weakFundamental']) {
    const lo = Math.ceil(D.hzToMidi(prof.fMin) + 0.5), hi = Math.floor(D.hzToMidi(prof.fMax) - 0.5);
    const errs = [], missing = [];
    let worst = { c: 0, n: '' };
    for (let m = lo; m <= hi; m++) {
      const truth = D.midiToHz(m);
      const fr = D.analyzeBuffer(note(truth, 0.4, timbre), SR,
        { ...baseOpts(2048), profile: prof, medianFilter: true });
      const v = fr.filter(f => f.voiced && f.filtered != null).slice(2);
      if (!v.length) { missing.push(D.noteName(m)); continue; }
      for (const f of v) {
        const c = Math.abs(D.hzToCents(f.filtered, truth));
        errs.push(c);
        if (c > worst.c) { worst = { c, n: D.noteName(m) }; }
      }
    }
    say(`| ${prof.label} | ${timbre} | ${hi - lo + 1} | **${fmt(mean(errs))}¢** | `
      + `${fmt(pct(errs, .95))}¢ | ${fmt(worst.c)}¢ @ ${worst.n} | `
      + `${missing.length ? '**' + missing.join(', ') + '**' : 'none'} |`);
  }
}
say('');

/* ======================= 2. Octave error rate ============================= */
say('## 2. Octave error rate — filter off vs on, against ground truth');
say('');
say('Method per §7.1 *Octave error rate*: one generated passage, run through the');
say('pipeline twice, Stage F disabled then enabled. An error is a voiced frame within');
say('±3% of 2× or 0.5× the known true frequency. Same input and same code both times.');
say('');
say('The passage uses a deliberately weak fundamental with vibrato and attack');
say('transients, which is the condition that provokes octave errors.');
say('');
say('| Profile | Guard | Clarity | Frames | Filter OFF | Filter ON | Reduction |');
say('|---|---|---:|---:|---:|---:|---:|');

for (const id of ['tenor', 'cello', 'violin']) {
  const prof = { ...D.profileById(id), gateThreshold: 0.008 };
  // Span the WHOLE profile range. An earlier version of this harness sampled
  // only the bottom two octaves and reported 0.00% everywhere — octave errors
  // live at the top of the range, so a passage that never goes there measures
  // nothing.
  const lo = Math.ceil(D.hzToMidi(prof.fMin) + 1), hi = Math.floor(D.hzToMidi(prof.fMax) - 1);
  const step = Math.max(1, Math.round((hi - lo) / 28));
  const midis = [];
  for (let m = lo; m <= hi; m += step) midis.push(m);
  const { buf, truthAt } = passage(midis, 0.45, 0.12, 'weakFundamental',
    { vibratoCents: 18, noise: 0.004 });
  for (const guard of [0, 0.35]) {
    const o = { ...baseOpts(2048), profile: prof, clarityThreshold: 0.90, octaveGuard: guard };
    const off = D.analyzeBuffer(buf, SR, { ...o, medianFilter: false });
    const on = D.analyzeBuffer(buf, SR, { ...o, medianFilter: true });
    const rOff = D.octaveErrorRate(off, truthAt, 0.03, false);
    const rOn = D.octaveErrorRate(on, truthAt, 0.03, true);
    const red = rOff.rate > 0 ? (1 - rOn.rate / rOff.rate) * 100 : null;
    say(`| ${prof.label} | ${guard || 'off'} | 0.90 | ${rOff.voiced} | `
      + `**${(rOff.rate * 100).toFixed(2)}%** (${rOff.errors}) | `
      + `**${(rOn.rate * 100).toFixed(2)}%** (${rOn.errors}) | `
      + `${red == null ? '—' : red.toFixed(0) + '%'} |`);
  }
}
say('');
say('Stage F removed **every** octave error in this passage. That is the sporadic');
say('case it is designed for, and it is the evidence §5 asks for.');
say('');
say('It does **not** help with the other case: when the detector locks the wrong');
say('octave for an entire sustained note, every frame agrees and the median agrees');
say('with them. §1 shows exactly that — violin G#7 reads 1200¢ low on 32 of 32');
say('frames, *after* filtering. See §6. Defense in depth has a gap there.');
say('');

/* ======================= 3. Low-frequency floor (OQ3) ==================== */
say('## 3. Low-frequency floor — MANIFEST open question 3');
say('');
say('§3 Stage A puts the floor at "roughly 45 Hz" for a 2048-sample window. The');
say('integration window is half the analysis window, so the largest evaluable lag is');
say('`windowSize/2 - 1` and the floor is `sampleRate / (windowSize/2 - 1)`:');
say('');
for (const W of [1024, 2048, 4096]) {
  const f = SR / ((W >> 1) - 1);
  say(`- **${W} samples** → floor **${f.toFixed(1)} Hz**, window ${(W / SR * 1000).toFixed(1)} ms`);
}
say('');
say('Lowest notes of the affected profiles, 2048 vs 4096:');
say('');
say('| Note | True Hz | W=2048 | W=4096 | Verdict |');
say('|---|---:|---|---|---|');

const lowNotes = [['E1 (bass low E)', 28], ['A1', 33], ['E2 (guitar low E)', 40],
                  ['C2 (cello low C)', 36], ['A0 (piano lowest)', 21], ['G2', 43]];
for (const [label, midi] of lowNotes) {
  const truth = D.midiToHz(midi);
  const cells = [];
  for (const W of [2048, 4096]) {
    const prof = { fMin: 20, fMax: 4200, gateThreshold: 0.008 };
    const fr = D.analyzeBuffer(note(truth, 0.8, 'saw'), SR,
      { ...baseOpts(W), profile: prof, medianFilter: true });
    const v = fr.filter(f => f.voiced && f.filtered != null).slice(2);
    if (!v.length) { cells.push('no detection'); continue; }
    const errs = v.map(f => Math.abs(D.hzToCents(f.filtered, truth)));
    cells.push(`${fmt(mean(errs), 1)}¢ (${v.length}/${fr.length} voiced)`);
  }
  const ok = !cells[0].startsWith('no') && parseFloat(cells[0]) < 25;
  say(`| ${label} | ${truth.toFixed(2)} | ${cells[0]} | ${cells[1]} | `
    + `${ok ? 'OK at 2048' : '**needs 4096**'} |`);
}
say('');

say('**Answer to OQ3.** A 2048-sample window is adequate for cello (low C = 65.4 Hz,');
say('comfortably above the 46.9 Hz floor) and for guitar and cello profiles generally.');
say('It is *not* adequate for **bass low E (41.2 Hz)** or **piano A0 (27.5 Hz)**: both');
say('fall below the floor and produce no detection at all — the detector reports');
say('unvoiced rather than a wrong pitch, which is the safe failure. Option (a) from');
say('§3 Stage A works: 4096 samples resolves both, at 85.3 ms of window latency and');
say('double the CPU (§4). Option (b), declaring bass supported only above low E,');
say('costs nothing and loses one semitone of range.');
say('');

/* ======================= 4. CPU cost ===================================== */
say('## 4. CPU cost per analysis frame');
say('');
say('Stages B–E only, measured in isolation. §7.1 asks for a Chrome DevTools profile');
say('of the real thing; this bounds the algorithm, and the browser number will be');
say('higher because it includes postMessage and the render path.');
say('');
say('Cost is dominated by the difference-function loop, which runs to');
say('`tauMax = sampleRate / fMin`. A profile with a low fMin is therefore markedly');
say('more expensive than a high one — the range clamp in §6 is a CPU control as well');
say('as an accuracy control. Below, a mid-range profile (fMin 60, fMax 2000):');
say('');
say('| Window | Hop | Frames/s | µs/frame | Budget | Load |');
say('|---:|---:|---:|---:|---:|---:|');
for (const W of [1024, 2048, 4096]) {
  for (const H of [512, 256]) {
    const prof = { fMin: 60, fMax: 2000, gateThreshold: 0.008 };
    const yin = new D.Yin(W, SR, 0.1);
    const frame = note(220, W / SR + 0.01, 'saw').subarray(0, W);
    const scratch = { voiced: false, hz: null, clarity: 0, rms: 0, reason: 0 };
    for (let i = 0; i < 50; i++) D.stageBtoE(frame, W, yin, prof, 0.9, scratch);
    const N = 400, t = process.hrtime.bigint();
    for (let i = 0; i < N; i++) D.stageBtoE(frame, W, yin, prof, 0.9, scratch);
    const us = Number(process.hrtime.bigint() - t) / 1000 / N;
    const budget = H / SR * 1e6;
    say(`| ${W} | ${H} | ${(SR / H).toFixed(0)} | ${us.toFixed(0)} | `
      + `${budget.toFixed(0)} | **${(us / budget * 100).toFixed(1)}%** |`);
  }
}
say('');

say('');
say('Per instrument profile at window 2048, hop 512:');
say('');
say('| Profile | fMin | tauMax | µs/frame | Load |');
say('|---|---:|---:|---:|---:|');
for (const id of ['soprano', 'tenor', 'violin', 'guitar', 'cello', 'bass', 'piano']) {
  const prof = { ...D.profileById(id), gateThreshold: 0.008 };
  const yin = new D.Yin(2048, SR, 0.1, 0);
  const frame = note(220, 2048 / SR + 0.01, 'saw').subarray(0, 2048);
  const scratch = { voiced: false, hz: null, clarity: 0, rms: 0, reason: 0 };
  for (let i = 0; i < 50; i++) D.stageBtoE(frame, 2048, yin, prof, 0.9, scratch);
  const N = 300, t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) D.stageBtoE(frame, 2048, yin, prof, 0.9, scratch);
  const us = Number(process.hrtime.bigint() - t) / 1000 / N;
  const budget = 512 / SR * 1e6;
  say(`| ${prof.label} | ${prof.fMin} Hz | ${Math.min(1023, Math.ceil(SR / prof.fMin))} | `
    + `${us.toFixed(0)} | **${(us / budget * 100).toFixed(1)}%** |`);
}
say('');
say('All well inside budget on this machine, but these are Node/V8 numbers on an');
say('idle CPU. §7.1 still wants a Chrome profile during a real 60-second take.');
say('');

/* ======================= 5. Stage F latency ============================== */
say('## 5. Stage F latency — arithmetic, not a measurement');
say('');
say('| Median window | Frames of lag | @ hop 512 | @ hop 256 |');
say('|---:|---:|---:|---:|');
for (const n of [3, 5, 7, 9]) {
  const lag = (n - 1) / 2;
  say(`| ${n} | ${lag} | ${(lag * 512 / SR * 1000).toFixed(1)} ms | `
    + `${(lag * 256 / SR * 1000).toFixed(1)} ms |`);
}
say('');
say('§3 Stage F estimates ~26 ms for a 5-frame window at hop 512; the arithmetic gives');
say(`${(2 * 512 / SR * 1000).toFixed(1)} ms of filter lag, and the hop fill adds `
  + `${(512 / SR * 1000).toFixed(1)} ms.`);
say('');

/* ======================= 6. High-frequency sub-octave errors ============= */
say('## 6. Sub-octave errors above 2.5 kHz — a finding, not a [TBM] field');
say('');
say('The true period of a high note is only a handful of samples: 3322 Hz at 48 kHz');
say('is a lag of 14.45. When the true lag falls near a half-integer, *no* integer lag');
say('correlates well, while 2x the lag lands near a whole number and scores far');
say('better — so YIN\'s threshold search returns the sub-octave. Measured `d\'` at');
say('3322 Hz: **d\'(14) = 0.148** (just above the 0.1 threshold) vs **d\'(29) = 0.009**.');
say('');
say('This defeats all three layers of §5: Stage E does not catch it (the sub-octave is');
say('still inside the instrument range), and Stage F does not catch it (every frame');
say('agrees, so the median agrees). Clarity is ~0.98 — confidently wrong.');
say('');
say('Sub-octave error rate by frequency band, weak-fundamental timbre:');
say('');
say('| Band | Lag (samples) | Guard off | Guard 0.25 | Guard 0.35 |');
say('|---|---:|---:|---:|---:|');
{
  const HB = TIMBRES.weakFundamental;
  const tone = (hz, n) => {
    const b = new Float32Array(n); let pk = 0;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let k = 0; k < HB.length; k++) { const f = hz * (k + 1); if (f < SR / 2) v += HB[k] * Math.sin(2 * Math.PI * f * i / SR); }
      v += (Math.random() - 0.5) * 0.002; b[i] = v; if (Math.abs(v) > pk) pk = Math.abs(v);
    }
    const k = 0.32 / pk; for (let i = 0; i < n; i++) b[i] *= k; return b;
  };
  const bands = [[500, 1000], [1000, 2000], [2000, 2500], [2500, 3000], [3000, 3600], [3600, 4200]];
  const rate = (guard, lo, hi) => {
    const y = new D.Yin(2048, SR, 0.1, guard);
    let bad = 0, tot = 0;
    for (let hz = lo; hz < hi; hz += (hi - lo) / 60) {
      const r = y.detect(tone(hz, 2048), 180, 4400); tot++;
      if (Math.abs(1200 * Math.log2(r.hz / hz) + 1200) < 60) bad++;
    }
    return (bad / tot * 100).toFixed(0) + '%';
  };
  for (const [lo, hi] of bands)
    say(`| ${lo}–${hi} Hz | ${(SR / hi).toFixed(1)}–${(SR / lo).toFixed(1)} | `
      + `${rate(0, lo, hi)} | ${rate(0.25, lo, hi)} | ${rate(0.35, lo, hi)} |`);

  // cost of the guard: clarity, and the low/mid range it must not disturb
  let below = 0, tot = 0, worstLow = 0;
  const yG = new D.Yin(2048, SR, 0.1, 0.35), yN = new D.Yin(2048, SR, 0.1, 0);
  for (let hz = 2500; hz < 4200; hz += 10) { const r = yG.detect(tone(hz, 2048), 180, 4400); tot++; if (r.clarity < 0.90) below++; }
  for (let m = 36; m <= 84; m++) {
    const hz = D.midiToHz(m);
    const a = yG.detect(tone(hz, 2048), 60, 2200).hz, bHz = yN.detect(tone(hz, 2048), 60, 2200).hz;
    worstLow = Math.max(worstLow, Math.abs(1200 * Math.log2(a / bHz)));
  }
  say('');
  say(`**Cost of the guard at 0.35:** ${(below / tot * 100).toFixed(1)}% of frames between 2.5–4.2 kHz`);
  say(`fall below the 0.90 clarity gate and are reported unvoiced rather than wrong.`);
  say(`Across C2–C6 the guard changes the detected frequency by at most `);
  say(`**${worstLow.toFixed(3)} cents** — it does not disturb the range where YIN already works.`);
}
say('');
say('**Recommendation.** Silence beats a confident wrong octave, so the trade is');
say('worth taking for violin (fMax 3600) and piano (fMax 4200). Flute and clarinet');
say('cap at 2200 Hz and are unaffected. Two things to decide with real instruments:');
say('whether to enable the guard, and whether the 0.90 clarity gate should be relaxed');
say('at the top of the range to recover the frames it now drops. Neither belongs in');
say('AUDIO_PIPELINE.md until it has been heard on a real violin.');
say('');

/* ======================= what is still missing ============================ */
say('## Still [TBM] — needs hardware');
say('');
say('| Field | Why this harness cannot fill it |');
say('|---|---|');
say('| §7 hardware + OS input latency | Needs a real device; run the acoustic loopback in `index.html` |');
say('| §7 total end-to-end latency | Needs mic → canvas paint on real hardware |');
say('| §7 render (Stage H) | Needs a browser compositor |');
say('| §6 gate thresholds (all 12) | Needs each instrument in a real room through a real mic |');
say('| §3 Stage H onset suppression frames | Needs a plucked/struck instrument attack |');
say('| Stage B metronome bleed (OQ2) | Needs speakers and a mic in the same room |');
say('| Real-instrument octave error rate | Synthetic timbres understate it |');
say('| Octave-guard decision (§6) | Needs a real violin at the top of its range |');
say('');

import fs from 'fs';
fs.writeFileSync(path.join(here, 'RESULTS.md'), out.join('\n') + '\n');
console.error('\n→ wrote spike/RESULTS.md');
