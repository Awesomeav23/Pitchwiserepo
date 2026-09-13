/* Pitchwise spike — correctness checks for Stages A–F.
   Loads dsp-core.js and the AudioWorkletProcessor source extracted from
   index.html, so these run against the code the browser actually executes.
   Run: node verify.mjs                                                      */
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { PerformanceObserver } from 'perf_hooks';

const here = path.dirname(fileURLToPath(import.meta.url));
await import(path.join(here, 'dsp-core.js'));
const D = globalThis.PitchwiseDSP;
const SR = 48000;

/* --- build the real worklet processor in a fake AudioWorkletGlobalScope --- */
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const appSrc = html.match(/<script type="module">([\s\S]*)<\/script>/)[1];
const workletSrc = appSrc.match(/const PROCESSOR_SRC = `([\s\S]*?)`;/)[1];

let registered = null;
function makeProcessor(processorOptions) {
  const scope = {
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: () => {}, onmessage: null }; } },
    registerProcessor: (_n, c) => { registered = c; },
    sampleRate: SR, currentTime: 0, currentFrame: 0
  };
  const fn = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate',
    'currentTime', 'currentFrame', 'globalThis', workletSrc + '\nreturn registered_;');
  // `currentTime` must advance per block, so build the class with a getter via eval scope
  const build = new Function('AudioWorkletProcessor', 'registerProcessor', 'getTime', 'sampleRate', 'globalThis',
    'Object.defineProperty(globalThis,"__t",{get:getTime,configurable:true});' +
    'const currentTime = 0;' + workletSrc);
  void fn; void build;
  // Simpler: patch `currentTime` to a module-level mutable via a wrapper object.
  const src = workletSrc.replace(/\bcurrentTime\b/g, 'CTX.currentTime');
  const CTX = { currentTime: 0 };
  const f = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'CTX', 'globalThis',
    src + '\nreturn PitchProcessor;');
  const Cls = f(scope.AudioWorkletProcessor, () => {}, SR, CTX, globalThis);
  const inst = new Cls({ processorOptions });
  return { inst, CTX };
}

function runWorklet(samples, opts) {
  const { inst, CTX } = makeProcessor({
    windowSize: opts.windowSize ?? 2048, hopSize: opts.hopSize ?? 512,
    yinThreshold: 0.1, clarityThreshold: opts.clarityThreshold ?? 0.90,
    profile: opts.profile
  });
  const out = [];
  inst.port.postMessage = m => out.push({ ...m });
  const BLK = 128;
  for (let p = 0; p + BLK <= samples.length; p += BLK) {
    CTX.currentTime = p / SR;
    inst.process([[samples.subarray(p, p + BLK)]], [[new Float32Array(BLK)]], {});
  }
  return out;
}

/* --- signal generators --------------------------------------------------- */
function tone(hz, dur, { harm = [1], amp = 0.3, noise = 0 } = {}) {
  const n = Math.floor(SR * dur), b = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < harm.length; k++) {
      const f = hz * (k + 1);
      if (f < SR / 2) v += harm[k] * Math.sin(2 * Math.PI * f * i / SR);
    }
    v += (Math.random() - 0.5) * noise;
    b[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  const k = peak ? amp / peak : 1;
  for (let i = 0; i < n; i++) b[i] *= k;
  return b;
}
const noiseBuf = (dur, amp) => {
  const b = new Float32Array(Math.floor(SR * dur));
  for (let i = 0; i < b.length; i++) b[i] = (Math.random() - 0.5) * 2 * amp;
  return b;
};

/* --- assertions ---------------------------------------------------------- */
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  \x1b[32mPASS\x1b[0m  ${name}${detail ? '  ' + detail : ''}`); }
  else { fail++; console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? '  ' + detail : ''}`); }
}
const P = id => ({ ...D.profileById(id), gateThreshold: 0.01 });

console.log('\nStage A — ring buffer');
{
  const ra = new D.RingAnalyzer(2048, 512);
  const ramp = new Float32Array(48000);
  for (let i = 0; i < ramp.length; i++) ramp[i] = i;
  const ends = [], edges = [];
  for (let p = 0; p < ramp.length; p += 128) {
    ra.push(ramp.subarray(p, p + 128));
    while (ra.hasFrame()) { const f = ra.takeFrame(); ends.push(ra.frameEnd); edges.push([f[0], f[2047]]); }
  }
  check('hop spacing is exactly 512 samples', ends.every((e, i) => i === 0 || e - ends[i - 1] === 512));
  check('window contents are the correct sample range',
    edges.every(([a, b], i) => a === i * 512 && b === i * 512 + 2047));
  check('ring capacity is a power of two ≥ window+hop', ra.ring.length === 4096, `got ${ra.ring.length}`);
  check('frame buffer is reused, not reallocated',
    ra.takeFrame() === ra.frame);
}

console.log('\nStage A — no allocation in the hot path');
{
  const prof = P('tenor');
  const sig = tone(220, 6, { harm: [1, .5, .3] });
  const { inst, CTX } = makeProcessor({ windowSize: 2048, hopSize: 512, yinThreshold: 0.1,
    clarityThreshold: 0.9, profile: prof });
  let posted = 0; const seen = new Set();
  inst.port.postMessage = m => { posted++; seen.add(m); };
  const BLK = 128;
  for (let r = 0; r < 3; r++)
    for (let p = 0; p + BLK <= sig.length; p += BLK) {
      CTX.currentTime = p / SR;
      inst.process([[sig.subarray(p, p + BLK)]], [[new Float32Array(BLK)]], {});
    }
  check('one message object is reused for every frame', seen.size === 1,
    `${posted} frames posted, ${seen.size} distinct object(s)`);

  // A real AudioWorklet hands process() the same arrays every render quantum,
  // so the harness must reuse them too — otherwise we measure our own garbage
  // instead of the processor's.
  //
  // We count garbage collections rather than heap bytes: process.memoryUsage()
  // has a noise floor of tens of bytes per call (rms(), which cannot allocate,
  // reports the same as anything else), and the thing §3 Stage A actually
  // forbids is triggering GC on the audio thread.
  const inBlk = new Float32Array(BLK);
  const inArg = [[inBlk]], outArg = [[new Float32Array(BLK)]], paramArg = {};
  inst.port.postMessage = () => {};
  const drive = seconds => {
    const blocks = Math.floor(SR * seconds / BLK);
    for (let i = 0, p = 0; i < blocks; i++, p += BLK) {
      for (let j = 0; j < BLK; j++) inBlk[j] = sig[(p + j) % sig.length];
      CTX.currentTime = p / SR;
      inst.process(inArg, outArg, paramArg);
    }
    return blocks;
  };
  drive(3);                                   // warm up: let V8 optimise
  const gcOver = async seconds => {
    let n = 0;
    const obs = new PerformanceObserver(l => { n += l.getEntries().length; });
    obs.observe({ entryTypes: ['gc'] });
    global.gc?.();
    await new Promise(r => setImmediate(r));
    n = 0;
    const t = process.hrtime.bigint();
    drive(seconds);
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    await new Promise(r => setImmediate(r));
    obs.disconnect();
    return { gc: n, ms };
  };
  // The invariant is that GC does not scale with runtime. A fixed count that
  // is identical for 30 s and 120 s is a one-off at the observer boundary, not
  // garbage produced per frame.
  const short = await gcOver(30), long = await gcOver(120);
  check('GC events do not grow with runtime (no per-frame garbage)',
    long.gc <= short.gc, `30 s → ${short.gc} GC, 120 s → ${long.gc} GC`);
  const perFrame = long.ms / Math.floor(SR * 120 / 512) * 1000;
  check('Stages B–E fit the frame budget', perFrame < 512 / SR * 1e6,
    `${perFrame.toFixed(0)} µs/frame vs ${(512 / SR * 1e6).toFixed(0)} µs available `
    + `(${(perFrame / (512 / SR * 1e6) * 100).toFixed(1)}% of one core)`);
}

console.log('\nStages C–E — detection and gates (via the real worklet)');
{
  const prof = P('tenor');                       // 120–550 Hz
  for (const [hz, label] of [[130.81, 'C3'], [220, 'A3'], [329.63, 'E4'], [523.25, 'C5']]) {
    const f = runWorklet(tone(hz, 1.0, { harm: [0.15, 1, 0.7, 0.4] }), { profile: prof });
    const v = f.filter(x => x.voiced).slice(2);
    const err = v.length ? v.reduce((a, x) => a + Math.abs(D.hzToCents(x.hz, hz)), 0) / v.length : NaN;
    check(`${label} (${hz} Hz) detected with weak fundamental`, v.length > 10 && err < 5,
      `${v.length} voiced frames, mean |err| ${err.toFixed(2)}¢`);
  }
  const sil = runWorklet(new Float32Array(SR), { profile: prof });
  check('Stage B rejects digital silence',
    sil.every(f => !f.voiced && f.reason === D.REASON.AMPLITUDE), `${sil.length} frames`);

  const quiet = runWorklet(tone(220, 1, { amp: 0.005 }), { profile: prof });
  check('Stage B rejects signal below the gate threshold',
    quiet.every(f => f.reason === D.REASON.AMPLITUDE));

  const hiss = runWorklet(noiseBuf(1, 0.3), { profile: prof });
  const passed = hiss.filter(f => f.voiced).length;
  check('Stage D rejects loud broadband noise',
    passed / hiss.length < 0.05, `${passed}/${hiss.length} frames passed`);

  const outOfRange = runWorklet(tone(880, 1, { harm: [1, .4] }), { profile: prof });
  const bad = outOfRange.filter(f => f.voiced && f.hz > prof.fMax).length;
  check('Stage E rejects pitch above fMax', bad === 0,
    `fMax ${prof.fMax} Hz, ${outOfRange.filter(f => f.voiced).length} voiced`);
}

console.log('\nStage F — median filter and octave correction');
{
  const f = new D.MedianOctaveFilter(5, 0.03);
  const truth = 220, out = [];
  for (let i = 0; i < 40; i++) out.push(f.push(i % 7 === 6 ? truth * 2 : truth));
  const settled = out.slice(6);
  check('injected 2× octave spikes are corrected, not passed through',
    settled.every(v => Math.abs(D.hzToCents(v, truth)) < 1), `corrections ${f.corrections}`);
  check('frame count is preserved (no discards)', out.length === 40 && f.pushes === 40);

  const g = new D.MedianOctaveFilter(5, 0.03);
  for (let i = 0; i < 5; i++) g.push(220);
  const before = g.count;
  g.push(null);
  check('unvoiced frames leave the window intact (gap marker)', g.count === before);

  // a genuine large interval must survive: a fifth is not an octave error
  const h = new D.MedianOctaveFilter(5, 0.03);
  for (let i = 0; i < 5; i++) h.push(220);
  for (let i = 0; i < 5; i++) h.push(330);
  check('a real interval (perfect fifth) is not treated as an octave error',
    Math.abs(D.hzToCents(h.push(330), 330)) < 1, `corrections ${h.corrections}`);

  // latency: the median of an n-window lags a step by (n-1)/2 frames
  const k = new D.MedianOctaveFilter(5, 0.03);
  for (let i = 0; i < 10; i++) k.push(220);
  let lag = 0;
  for (let i = 0; i < 10; i++) { const v = k.push(440 * 1.5); lag++; if (Math.abs(v - 660) < 1) break; }
  check('median output lags a step change by (n-1)/2 + 1 frames', lag === 3, `${lag} frames`);
}

console.log('\nStage G — conversions');
{
  check('A4 = 440 Hz → MIDI 69', Math.abs(D.hzToMidi(440) - 69) < 1e-9);
  check('MIDI 60 → 261.63 Hz', Math.abs(D.midiToHz(60) - 261.6255653) < 1e-6);
  check('one semitone = 100 cents', Math.abs(D.hzToCents(D.midiToHz(61), D.midiToHz(60)) - 100) < 1e-9);
  check('note naming across the octave boundary',
    D.noteName(60) === 'C4' && D.noteName(59) === 'B3' && D.noteName(69) === 'A4');
  const n = D.nearestNote(440 * Math.pow(2, 20 / 1200));
  check('nearestNote reports +20 cents on A4', n.name === 'A4' && Math.abs(n.cents - 20) < 1e-6);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
