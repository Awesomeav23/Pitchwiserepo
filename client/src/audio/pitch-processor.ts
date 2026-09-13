/**
 * Stages A–E, running on the audio thread. docs/AUDIO_PIPELINE.md §2, ADR-002.
 *
 * These stages live here rather than on the main thread because they must not
 * be blocked by React rendering. Stage F onward runs in engine.ts, where the
 * median filter needs only a short history and the result is consumed by
 * rendering anyway.
 *
 * Audio-thread discipline (§3 Stage A): no allocation, no console, no try/catch
 * in process(). Anything that triggers GC here causes dropouts. Buffers are
 * built once in the constructor and the outbound message object is reused —
 * postMessage structured-clones synchronously, so one object serves every frame.
 */
import { PitchDetector } from 'pitchy';
import { RingAnalyzer, rms } from './ring-analyzer';
import { Reason } from './types';
import type { InstrumentProfile } from './types';

interface ProcessorOptions {
  windowSize: number;
  hopSize: number;
  clarityThreshold: number;
  profile: InstrumentProfile;
}

interface OutboundFrame {
  type: 'frame';
  timestamp: number;
  voiced: boolean;
  hz: number | null;
  clarity: number;
  rms: number;
  reason: number;
  captureTime: number;
}

class PitchProcessor extends AudioWorkletProcessor {
  private readonly analyzer: RingAnalyzer;
  private readonly detector: PitchDetector<Float32Array>;
  private readonly windowSize: number;
  private profile: InstrumentProfile;
  private clarityThreshold: number;
  private alive = true;

  private readonly msg: OutboundFrame = {
    type: 'frame', timestamp: 0, voiced: false, hz: null,
    clarity: 0, rms: 0, reason: Reason.Voiced, captureTime: 0,
  };

  constructor(options?: { processorOptions?: unknown }) {
    super();
    const o = options?.processorOptions as ProcessorOptions;
    this.windowSize = o.windowSize;
    this.profile = o.profile;
    this.clarityThreshold = o.clarityThreshold;
    this.analyzer = new RingAnalyzer(o.windowSize, o.hopSize);
    this.detector = PitchDetector.forFloat32Array(o.windowSize);

    this.port.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.type === 'config') {
        if (d.profile) this.profile = d.profile;
        if (typeof d.clarityThreshold === 'number') this.clarityThreshold = d.clarityThreshold;
      } else if (d.type === 'reset') {
        this.analyzer.reset();
      } else if (d.type === 'stop') {
        this.alive = false;
      }
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) return this.alive;

    this.analyzer.push(channel);
    const blockStart = this.analyzer.totalSamples - channel.length;

    while (this.analyzer.hasFrame()) {
      const frame = this.analyzer.takeFrame();
      const m = this.msg;

      // Stage B — amplitude gate. Below threshold the frame is unvoiced and
      // detection is skipped entirely, which also saves CPU during rests.
      const level = rms(frame, this.windowSize);
      m.rms = level;
      m.hz = null;
      m.clarity = 0;
      m.voiced = false;

      if (level <= this.profile.gateThreshold) {
        m.reason = Reason.Amplitude;
      } else {
        // Stage C — detection (ADR-003).
        const [hz, clarity] = this.detector.findPitch(frame, sampleRate);
        m.clarity = clarity;

        if (clarity < this.clarityThreshold) {
          // Stage D — catches loud but unpitched input: a chair scrape, a
          // breath, a consonant at the start of a sung syllable.
          m.reason = Reason.Clarity;
        } else if (hz <= 0 || hz < this.profile.fMinHz || hz > this.profile.fMaxHz) {
          // Stage E — per-instrument range clamp (ADR-010). The cheapest single
          // reduction in octave-error rate available.
          m.reason = Reason.Range;
        } else {
          m.hz = hz;
          m.voiced = true;
          m.reason = Reason.Voiced;
        }
      }

      // Audio clock only — a main-thread clock drifts against it and would
      // corrupt timing scores (§4 "On timestamps").
      m.timestamp = (this.analyzer.frameEnd / sampleRate) * 1000;
      m.captureTime = currentTime + (this.analyzer.frameEnd - blockStart) / sampleRate;
      this.port.postMessage(m);
    }

    return this.alive;
  }
}

registerProcessor('pitch-processor', PitchProcessor);
