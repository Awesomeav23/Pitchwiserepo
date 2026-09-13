/** Runtime shapes for the audio path. See docs/AUDIO_PIPELINE.md §4. */

/** Which stage rejected a frame. Carried for gate tuning and debug display. */
export const Reason = {
  Voiced: 0,
  Amplitude: 1,   // Stage B
  Clarity: 2,     // Stage D
  Range: 3,       // Stage E
} as const;
export type Reason = (typeof Reason)[keyof typeof Reason];

/** Emitted from the worklet, one per analysis hop (~94/sec at 48 kHz). */
export interface PitchFrame {
  /** ms since capture start, from the audio clock — never Date.now(). */
  timestamp: number;
  voiced: boolean;
  /** null when unvoiced. */
  hz: number | null;
  clarity: number;
  rms: number;
  reason: Reason;
  /** AudioContext.currentTime of the newest sample in this window, for latency work. */
  captureTime: number;
}

/** A frame after Stage F and Stage G have run on the main thread. */
export interface AnalysedFrame extends PitchFrame {
  /** Stage F output: median of the filter window, or null across a rest. */
  filteredHz: number | null;
  midi: number | null;
  noteName: string | null;
  /** Signed cents from the nearest equal-tempered note. */
  centsOff: number | null;
}

export interface InstrumentProfile {
  id: string;
  displayName: string;
  family: 'voice' | 'woodwind' | 'brass' | 'strings' | 'keys';
  nominalRange: string;
  fMinHz: number;
  fMaxHz: number;
  /** Notation display only — never applied to a detected frequency (ADR-010). */
  transpositionSemitones: number;
  gateThreshold: number;
  /** False while gateThreshold is a placeholder rather than a measurement. */
  isMeasured: boolean;
}

export interface EngineConfig {
  windowSize: number;
  hopSize: number;
  clarityThreshold: number;
  medianWindow: number;
  octaveBand: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  windowSize: 2048,
  hopSize: 512,
  clarityThreshold: 0.9,
  medianWindow: 5,
  octaveBand: 0.03,
};

/**
 * Identifies the detection configuration that produced an attempt.
 * DATA_MODEL.md §3.6: without this, a score from week 2 is not comparable with
 * one from week 4 and progress graphs show tuning changes as improvement.
 * Bump on any change to window, hop, filter or thresholds.
 */
export const ENGINE_VERSION = 'mpm-1.0-w2048-h512-median5';
