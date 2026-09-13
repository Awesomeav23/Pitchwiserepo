/**
 * Main-thread half of the audio path: worklet lifecycle, then Stages F and G.
 * docs/AUDIO_PIPELINE.md §2. Stages A–E live in pitch-processor.ts.
 */
import { MedianOctaveFilter } from './median-filter';
import { nearestNote } from './pitch';
import { DEFAULT_CONFIG, Reason } from './types';
import type { AnalysedFrame, EngineConfig, InstrumentProfile, PitchFrame } from './types';

export type SourceKind = 'mic' | 'synth';

/** Built by `npm run build:worklet` into public/, so the path is stable. */
const WORKLET_URL = `${import.meta.env.BASE_URL}pitch-processor.js`;

/**
 * These three must be off. Auto-gain rescales the signal, which makes the §6
 * gate thresholds meaningless; noise suppression alters the waveform, which
 * corrupts both pitch accuracy and the §7 latency figures. Browsers accept the
 * request and sometimes ignore it, so the engine reports back what the track
 * actually settled on rather than assuming.
 */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

export interface TrackReport {
  label: string;
  sampleRate: number;
  /** Constraints the browser did not honour. Empty means clean. */
  ignored: string[];
}

export class MicrophoneError extends Error {
  readonly kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.name = 'MicrophoneError';
    this.kind = kind;
  }
}

const MIC_MESSAGES: Record<string, string> = {
  NotAllowedError: 'Microphone permission was denied. Allow access from the icon in the address bar.',
  NotFoundError: 'No microphone found. Check that one is connected and selected in system settings.',
  NotReadableError: 'The microphone is in use by another application.',
  OverconstrainedError: 'This device cannot provide the requested audio settings.',
  SecurityError: 'Microphone access needs a secure origin (https or localhost).',
};

export function describeMicError(err: unknown): MicrophoneError {
  const name = err instanceof DOMException ? err.name : 'UnknownError';
  return new MicrophoneError(name, MIC_MESSAGES[name] ?? `Could not open the microphone (${name}).`);
}

export interface EngineEvents {
  onFrame?: (frame: AnalysedFrame) => void;
  onTrack?: (report: TrackReport) => void;
}

export class PitchEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private source: AudioNode | null = null;
  private osc: OscillatorNode | null = null;
  private filter: MedianOctaveFilter;

  private config: EngineConfig = { ...DEFAULT_CONFIG };
  private profile: InstrumentProfile;

  readonly events: EngineEvents = {};

  constructor(profile: InstrumentProfile) {
    this.profile = profile;
    this.filter = new MedianOctaveFilter(this.config.medianWindow, this.config.octaveBand);
  }

  get running(): boolean {
    return this.node !== null;
  }

  get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  /** Base + output latency in ms, as reported by the context. Input side is not exposed. */
  get reportedLatencyMs(): number | null {
    if (!this.ctx) return null;
    return (this.ctx.baseLatency + (this.ctx.outputLatency ?? 0)) * 1000;
  }

  setProfile(profile: InstrumentProfile): void {
    this.profile = profile;
    this.filter.reset();
    this.node?.port.postMessage({ type: 'config', profile });
  }

  setClarityThreshold(value: number): void {
    this.config.clarityThreshold = value;
    this.node?.port.postMessage({ type: 'config', clarityThreshold: value });
  }

  async start(kind: SourceKind, deviceId?: string): Promise<void> {
    if (this.running) return;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    await ctx.resume();

    // An AudioWorkletGlobalScope has no DOM and cannot resolve module
    // specifiers, so this file must arrive fully bundled with Pitchy inlined.
    // Vite's `?worker&url` does that for the production build but serves the
    // module unbundled in dev, so the worklet is built separately by esbuild
    // (see package.json build:worklet) and served as a static asset. Identical
    // bytes in dev and production — this is the build complication ADR-002
    // anticipated.
    await ctx.audioWorklet.addModule(WORKLET_URL);

    if (kind === 'mic') {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { ...MIC_CONSTRAINTS, deviceId: { exact: deviceId } } : MIC_CONSTRAINTS,
        });
      } catch (err) {
        await this.stop();
        throw describeMicError(err);
      }
      this.stream = stream;
      const track = stream.getAudioTracks()[0];
      this.events.onTrack?.(inspectTrack(track, ctx.sampleRate));
      this.source = ctx.createMediaStreamSource(stream);
    } else {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 261.6256;      // C4
      const gain = ctx.createGain();
      gain.gain.value = 0.25;
      osc.connect(gain);
      osc.start();
      this.osc = osc;
      this.source = gain;
    }

    const node = new AudioWorkletNode(ctx, 'pitch-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        windowSize: this.config.windowSize,
        hopSize: this.config.hopSize,
        clarityThreshold: this.config.clarityThreshold,
        profile: this.profile,
      },
    });
    node.port.onmessage = (e: MessageEvent) => this.handleFrame(e.data as PitchFrame);

    // A muted sink keeps the node pulled without routing input to the speakers,
    // which on a live microphone would feed back.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.source.connect(node);
    node.connect(sink).connect(ctx.destination);

    this.node = node;
    this.filter.reset();
  }

  async stop(): Promise<void> {
    this.node?.port.postMessage({ type: 'stop' });
    this.node?.disconnect();
    this.node = null;
    this.osc?.stop();
    this.osc = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    await this.ctx?.close();
    this.ctx = null;
  }

  private handleFrame(frame: PitchFrame): void {
    // Stage F, then Stage G.
    const filteredHz = this.filter.push(frame.voiced ? frame.hz : null);
    let midi: number | null = null;
    let name: string | null = null;
    let centsOff: number | null = null;
    if (filteredHz != null) {
      const n = nearestNote(filteredHz);
      midi = n.midi;
      name = n.name;
      centsOff = n.cents;
    }
    this.events.onFrame?.({ ...frame, filteredHz, midi, noteName: name, centsOff });
  }
}

function inspectTrack(track: MediaStreamTrack, contextRate: number): TrackReport {
  const s = track.getSettings();
  const wanted: Array<keyof MediaTrackSettings> = [
    'echoCancellation', 'noiseSuppression', 'autoGainControl',
  ];
  const ignored = wanted.filter((k) => s[k] === true).map(String);
  return { label: track.label || 'Microphone', sampleRate: s.sampleRate ?? contextRate, ignored };
}

export { Reason };
