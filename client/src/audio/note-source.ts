/**
 * The boundary between "something is producing notes" and everything that
 * scores, draws or records them. ADR-013.
 *
 * There is exactly one implementation: `PitchEngine`, which analyses microphone
 * audio. A `MidiSource` is deliberately **not** built — see ADR-013 for why the
 * seam exists anyway. The short version is that it is cheapest to place while
 * there is one implementation and one caller, which is true today and will stop
 * being true as soon as the practice-take screen exists.
 *
 * The one rule this interface has to obey: **it must not assume frames.** Audio
 * analysis produces a continuous stream of pitch estimates roughly every 10 ms
 * whether or not a note is sounding; MIDI produces discrete events only at note
 * boundaries. An interface shaped around either one cannot express the other, so
 * `Observation` is a union and consumers declare which members they need.
 */
import type { AnalysedFrame } from './types';

/**
 * Maps 1:1 to `attempts.input_source` (DATA_MODEL.md §11.7). A detected note is
 * an estimate and a MIDI note is exact; an attempt has to record which it was,
 * or score history silently mixes the two.
 */
export type InputSource = 'audio' | 'midi';

export interface SourceCapabilities {
  /**
   * Reports pitch continuously, between note boundaries as well as at them.
   * True for audio analysis, false for MIDI. A live pitch trace needs this.
   */
  continuousPitch: boolean;
  /** Can report more than one note sounding at once. False for audio (ADR-004). */
  polyphonic: boolean;
  /** Reports how hard a note was struck. */
  velocity: boolean;
  /**
   * Deviation from equal temperament is meaningful. False for sources whose
   * notes are exact by construction — scoring a MIDI note in cents would
   * measure nothing and always read 0.0.
   */
  cents: boolean;
}

interface ObservationBase {
  /**
   * Milliseconds since this source started, on the source's own clock.
   * For audio that is the audio clock, never `Date.now()` (AUDIO_PIPELINE §4).
   * Present on every member so a consumer can order a timeline without
   * branching on `type`.
   */
  timeMs: number;
}

/** A continuous pitch estimate. Emitted by audio sources only. */
export interface PitchObservation extends ObservationBase {
  type: 'pitch';
  /**
   * The full analysed frame, carried rather than flattened so that gate
   * reasons, clarity and RMS survive to consumers that tune against them.
   */
  frame: AnalysedFrame;
}

/** A note began. Emitted by note-reporting sources only. No producer today. */
export interface NoteOnObservation extends ObservationBase {
  type: 'noteOn';
  midi: number;
  /** 0–1, or null where the source does not report it. */
  velocity: number | null;
}

/** A note ended. Emitted by note-reporting sources only. No producer today. */
export interface NoteOffObservation extends ObservationBase {
  type: 'noteOff';
  midi: number;
}

export type Observation = PitchObservation | NoteOnObservation | NoteOffObservation;

export type Unsubscribe = () => void;

export interface NoteSource {
  /** Recorded on every attempt this source produces. */
  readonly inputSource: InputSource;
  readonly capabilities: SourceCapabilities;
  readonly running: boolean;
  /**
   * Identifies the configuration that produced these observations, for
   * `attempts.engine_version` (DATA_MODEL.md §3.6).
   */
  readonly version: string;

  /**
   * Takes no arguments on purpose. What a source needs to open — a microphone
   * device, a MIDI port — differs per implementation and is configured on the
   * implementation before starting.
   */
  start(): Promise<void>;
  stop(): Promise<void>;

  /** Returns an unsubscribe function. Multiple listeners are supported. */
  subscribe(listener: (o: Observation) => void): Unsubscribe;
}

/**
 * Subscribe to pitch frames alone, for consumers that have no use for note
 * events — the tuner readout, the live trace. Saves every such consumer writing
 * the same `if (o.type !== 'pitch') return`.
 */
export function onPitchFrames(
  source: NoteSource,
  fn: (frame: AnalysedFrame) => void,
): Unsubscribe {
  return source.subscribe((o) => {
    if (o.type === 'pitch') fn(o.frame);
  });
}

/**
 * Throw if a source cannot drive a continuous pitch display. Called by screens
 * that are meaningless without one, so that handing them a note-only source
 * fails at the point of the mistake rather than rendering an empty canvas.
 */
export function assertContinuousPitch(source: NoteSource): void {
  if (!source.capabilities.continuousPitch) {
    throw new Error(
      `This view needs a continuous pitch stream; the ${source.inputSource} source does not provide one.`,
    );
  }
}
