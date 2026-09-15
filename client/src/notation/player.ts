/**
 * Plays a NoteSequence so a learner can hear what the notation says.
 *
 * Web Audio rather than Tone.js, for the same reason as ADR-014 and one more:
 * Tone.js earns its size with samplers and a transport, and this needs neither.
 * A sampled piano would sound better than any synthesis here, but samples are
 * audio files to host, which is the cost the content format was chosen to
 * avoid (LEARNING_PLATFORM §5). A short additive tone with a soft envelope is
 * what is left, and it is in tune by construction — it derives from the same
 * MIDI numbers the scoring does, so the reference a learner hears and the
 * target they are scored against cannot disagree.
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
}

/** Partial amplitudes. A little second and third harmonic reads as an
 *  instrument rather than a test tone, without needing a sample. */
const PARTIALS = [1, 0.32, 0.14];
const ATTACK = 0.012;
const RELEASE = 0.09;

export function playSequence(
  ctx: AudioContext,
  sequence: NoteSequence,
  opts: PlayOptions = {},
): PlaybackHandle {
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

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(1, start + ATTACK);
    env.gain.setValueAtTime(1, Math.max(start + ATTACK, end - RELEASE));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(master);

    PARTIALS.forEach((amp, partial) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = hz * (partial + 1);
      const g = ctx.createGain();
      g.gain.value = amp;
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
