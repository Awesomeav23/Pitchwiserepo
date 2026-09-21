/**
 * Plays a NoteSequence so a learner can hear what the notation says.
 *
 * Web Audio rather than Tone.js, for the same reason as ADR-014 and one more:
 * Tone.js earns its size with samplers and a transport, and this needs neither.
 * A sampled instrument would sound better than any synthesis here, but samples
 * are audio files to host, which is the cost the content format was chosen to
 * avoid (LEARNING_PLATFORM §5). Additive tones with shaped envelopes are what
 * is left, and they are in tune by construction — they derive from the same
 * MIDI numbers the scoring does, so the reference a learner hears and the
 * target they are scored against cannot disagree.
 *
 * What the per-instrument voicing below does and does not claim: it makes a
 * guitar distinguishable from a clarinet, because the two differ in the two
 * things a listener notices first — which harmonics are present, and whether
 * the note dies away on its own or holds until it is released. It does not
 * make either sound like a recording of the real thing, and nothing here
 * should be presented to a learner as if it did. Timbre that survives an A/B
 * against the real instrument needs samples, which is a hosting decision
 * rather than a synthesis one.
 */
import { midiToHz } from '../audio/pitch';
import type { NoteSequence } from '../exercises/types';

export interface PlaybackHandle {
  stop(): void;
}

export interface PlayOptions {
  /** Called with the index of the sounding note, or null between notes. */
  onNote?: (index: number | null) => void;
  /** Called once playback ends or is stopped. */
  onEnd?: () => void;
  volume?: number;
  /** Instrument id from the course catalog. Unknown ids get the plain tone. */
  instrument?: string;
}

/**
 * One instrument's voice.
 *
 * `partials` are relative amplitudes of harmonic 1, 2, 3 … so a zero is a
 * harmonic the bore or string genuinely does not produce — that is the whole
 * character of a clarinet, whose closed cylindrical bore suppresses the even
 * ones and is why it reads as hollow rather than bright.
 */
export interface Timbre {
  partials: number[];
  attackS: number;
  /**
   * Seconds for a plucked or struck note to fall away by itself, or null for
   * a bowed, blown or sung one that holds until the note ends. This is the
   * difference a listener hears before they hear anything about harmonics.
   */
  decayS: number | null;
  releaseS: number;
  /** Depth in cents, rate in Hz, and the delay before it fades in. */
  vibrato?: { cents: number; hz: number; delayS: number };
}

const PLAIN: Timbre = { partials: [1, 0.32, 0.14], attackS: 0.012, decayS: null, releaseS: 0.09 };

const TIMBRES: Record<string, Timbre> = {
  // Nearly a sine with breath on top: the flute's harmonics fall away fast.
  flute: {
    partials: [1, 0.10, 0.03],
    attackS: 0.055, decayS: null, releaseS: 0.10,
    vibrato: { cents: 8, hz: 5.0, delayS: 0.25 },
  },
  // Odd harmonics only, near enough. A cylindrical bore stopped at one end
  // does not support the even ones, and that absence is the clarinet's sound.
  clarinet_bb: {
    partials: [1, 0.03, 0.42, 0.02, 0.20, 0.015, 0.09],
    attackS: 0.040, decayS: null, releaseS: 0.09,
  },
  // Bright and harmonically dense — the upper partials are most of the tone.
  trumpet_bb: {
    partials: [1, 0.52, 0.42, 0.30, 0.20, 0.12, 0.07],
    attackS: 0.030, decayS: null, releaseS: 0.08,
    vibrato: { cents: 4, hz: 5.5, delayS: 0.35 },
  },
  // Bowed string: every harmonic present, sawtooth-ish, with the vibrato that
  // is most of what separates a violin from a synthesizer playing a sawtooth.
  violin: {
    partials: [1, 0.50, 0.34, 0.26, 0.20, 0.15, 0.11],
    attackS: 0.065, decayS: null, releaseS: 0.11,
    vibrato: { cents: 14, hz: 6.0, delayS: 0.18 },
  },
  cello: {
    partials: [1, 0.46, 0.30, 0.18, 0.11, 0.07],
    attackS: 0.075, decayS: null, releaseS: 0.13,
    vibrato: { cents: 12, hz: 5.0, delayS: 0.20 },
  },
  // Plucked: immediate attack, then it dies on its own whatever the notation
  // says. A held whole note on a guitar is still a decaying one.
  guitar: { partials: [1, 0.44, 0.26, 0.15, 0.09, 0.05], attackS: 0.004, decayS: 2.00, releaseS: 0.04 },
  bass:   { partials: [1, 0.32, 0.14, 0.06],             attackS: 0.006, decayS: 2.80, releaseS: 0.05 },
  // Struck rather than plucked: same decaying shape, longer tail.
  piano:  { partials: [1, 0.40, 0.21, 0.11, 0.06, 0.03], attackS: 0.003, decayS: 3.00, releaseS: 0.05 },
};

/** All four voice types share a timbre; what differs between them is range. */
const VOICE: Timbre = {
  partials: [1, 0.48, 0.28, 0.14, 0.07],
  attackS: 0.050, decayS: null, releaseS: 0.12,
  vibrato: { cents: 16, hz: 5.2, delayS: 0.30 },
};

export function timbreFor(instrument?: string): Timbre {
  if (!instrument) return PLAIN;
  if (instrument.startsWith('voice_')) return VOICE;
  return TIMBRES[instrument] ?? PLAIN;
}

export function playSequence(
  ctx: AudioContext,
  sequence: NoteSequence,
  opts: PlayOptions = {},
): PlaybackHandle {
  const timbre = timbreFor(opts.instrument);
  // Partial sets differ in size and weight, so an un-normalised clarinet
  // (seven partials) would be audibly louder than a flute (three). Level is
  // set by the sum, not by the fundamental.
  const gainScale = 1 / timbre.partials.reduce((a, b) => a + b, 0);

  const master = ctx.createGain();
  master.gain.value = opts.volume ?? 0.22;
  master.connect(ctx.destination);

  const t0 = ctx.currentTime + 0.06;
  const oscillators: OscillatorNode[] = [];
  const timers: number[] = [];
  let stopped = false;

  for (const [index, note] of sequence.notes.entries()) {
    const start = t0 + note.startMs / 1000;
    // Shortened slightly so repeated notes at the same pitch articulate
    // instead of running together into one long tone.
    const end = start + Math.max(0.08, note.durationMs / 1000 - 0.05);
    const hz = midiToHz(note.midi);
    const peak = start + timbre.attackS;

    const env = ctx.createGain();
    const releaseAt = Math.max(peak, end - timbre.releaseS);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(1, peak);
    if (timbre.decayS === null) {
      env.gain.setValueAtTime(1, releaseAt);
    } else {
      // A ramp, not setTargetAtTime. Between two events the Web Audio curve
      // for an exponential ramp is v0 * (v1/v0)^t, so picking v1 to be where
      // the decay should have got to by releaseAt reproduces exactly the
      // exponential a plucked string follows — and, unlike setTargetAtTime,
      // it survives the closing ramp below instead of being overridden by it.
      // Getting this wrong made every plucked instrument decay at the same
      // rate, set by how long the note was rather than by what it was.
      const tau = timbre.decayS / 3;   // decayS is the time to fall to ~5%
      const left = Math.max(0.0002, Math.exp(-(releaseAt - peak) / tau));
      env.gain.exponentialRampToValueAtTime(left, releaseAt);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(master);

    // One LFO per note, shared by its partials. Depth is in cents, so it has
    // to be converted to Hz per partial — a fixed Hz wobble would be a wide
    // vibrato low down and an inaudible one high up.
    let lfo: OscillatorNode | null = null;
    let lfoGain: GainNode | null = null;
    if (timbre.vibrato) {
      lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = timbre.vibrato.hz;
      lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0, start);
      lfoGain.gain.setValueAtTime(0, Math.min(start + timbre.vibrato.delayS, end));
      lfoGain.gain.linearRampToValueAtTime(1, Math.min(start + timbre.vibrato.delayS + 0.15, end));
      lfo.connect(lfoGain);
      lfo.start(start);
      lfo.stop(end + 0.02);
      oscillators.push(lfo);
    }

    timbre.partials.forEach((amp, i) => {
      if (amp <= 0) return;
      const partial = i + 1;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz * partial;
      if (lfoGain && timbre.vibrato) {
        const depthHz = hz * partial * (Math.pow(2, timbre.vibrato.cents / 1200) - 1);
        const perPartial = ctx.createGain();
        perPartial.gain.value = depthHz;
        lfoGain.connect(perPartial).connect(osc.frequency);
      }
      const g = ctx.createGain();
      g.gain.value = amp * gainScale;
      osc.connect(g).connect(env);
      osc.start(start);
      osc.stop(end + 0.02);
      oscillators.push(osc);
    });

    if (opts.onNote) {
      // setTimeout drives only the visual cursor, never the audio — the notes
      // themselves are scheduled on the audio clock above. A few milliseconds
      // of timer jitter moves a highlight, not a pitch.
      timers.push(window.setTimeout(() => { if (!stopped) opts.onNote?.(index); },
        note.startMs + 60));
    }
  }

  const last = sequence.notes[sequence.notes.length - 1];
  const totalMs = last.startMs + last.durationMs;
  timers.push(window.setTimeout(() => {
    if (stopped) return;
    opts.onNote?.(null);
    opts.onEnd?.();
  }, totalMs + 120));

  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const t of timers) window.clearTimeout(t);
    for (const osc of oscillators) {
      try { osc.stop(); } catch { /* already finished */ }
    }
    master.disconnect();
    opts.onNote?.(null);
    opts.onEnd?.();
  };

  return { stop };
}
