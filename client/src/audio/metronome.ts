/**
 * Count-in and metronome for a practice take — US-04.
 *
 * Scheduled directly on the capture AudioContext rather than through Tone.js.
 * The reason is the clock: every frame carries a timestamp from the capture
 * context's audio clock, and every note window in a take is measured against
 * those timestamps. Tone.js builds its own AudioContext by default, and two
 * contexts drift. Sharing one clock makes the alignment exact by construction
 * instead of approximately right and slowly wrong. See ADR-014.
 *
 * The click is a short sine burst with an exponential decay, not a sample —
 * no asset to ship, and the pitch can differ between the accent and the beat.
 *
 * A take is at most a few seconds, so every click is scheduled up front. A
 * lookahead scheduler is what you need for an unbounded loop, and this is not
 * one.
 */

export interface ClickPlan {
  /** Context time of the first count-in click. */
  startTime: number;
  /** Context time at which the exercise itself begins — take t = 0. */
  takeZeroTime: number;
  /** Context time after the last scheduled click. */
  endTime: number;
  beatSec: number;
  countInBeats: number;
}

const ACCENT_HZ = 1760;   // A6
const BEAT_HZ = 880;      // A5
const CLICK_SEC = 0.04;

export class Metronome {
  private ctx: AudioContext;
  private gain: GainNode;
  private scheduled: OscillatorNode[] = [];

  constructor(ctx: AudioContext, volume = 0.25) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(ctx.destination);
  }

  set volume(v: number) {
    this.gain.gain.value = v;
  }

  /**
   * Schedule a count-in followed by clicks through the take.
   *
   * `beatsPerBar` drives both the count-in length and which clicks are
   * accented. The count-in is one full bar: long enough to establish the pulse,
   * short enough not to be irritating on the twentieth attempt.
   */
  schedule(opts: {
    bpm: number;
    beatsPerBar: number;
    takeDurationMs: number;
    leadSec?: number;
  }): ClickPlan {
    const beatSec = 60 / opts.bpm;
    const countInBeats = opts.beatsPerBar;

    // Headroom so the first click is scheduled in the future rather than in the
    // past, which the Web Audio API renders as "immediately" and which lands
    // the count-in a beat short.
    const startTime = this.ctx.currentTime + (opts.leadSec ?? 0.15);
    const takeZeroTime = startTime + countInBeats * beatSec;

    for (let i = 0; i < countInBeats; i++) {
      this.click(startTime + i * beatSec, i === 0 ? ACCENT_HZ : BEAT_HZ);
    }

    const takeBeats = Math.ceil(opts.takeDurationMs / 1000 / beatSec);
    for (let j = 0; j < takeBeats; j++) {
      this.click(takeZeroTime + j * beatSec, j % opts.beatsPerBar === 0 ? ACCENT_HZ : BEAT_HZ);
    }

    return {
      startTime,
      takeZeroTime,
      endTime: takeZeroTime + takeBeats * beatSec,
      beatSec,
      countInBeats,
    };
  }

  /** Cancel everything still pending. Safe to call when nothing is scheduled. */
  stop(): void {
    for (const osc of this.scheduled) {
      try { osc.stop(); } catch { /* already stopped */ }
      osc.disconnect();
    }
    this.scheduled = [];
  }

  dispose(): void {
    this.stop();
    this.gain.disconnect();
  }

  private click(at: number, hz: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.value = hz;
    osc.type = 'sine';

    // Ramp from a small non-zero value: exponentialRampToValueAtTime rejects
    // zero, and a linear ramp to zero clicks audibly at the end of the decay.
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(1, at + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, at + CLICK_SEC);

    osc.connect(env).connect(this.gain);
    osc.start(at);
    osc.stop(at + CLICK_SEC + 0.01);
    osc.onended = () => {
      env.disconnect();
      this.scheduled = this.scheduled.filter((o) => o !== osc);
    };
    this.scheduled.push(osc);
  }
}
