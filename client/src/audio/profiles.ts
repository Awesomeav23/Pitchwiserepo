import type { InstrumentProfile } from './types';

/**
 * Instrument profiles from docs/AUDIO_PIPELINE.md §6, per ADR-010.
 *
 * fMin/fMax include margin beyond the nominal playing range so a legitimately
 * sharp or flat top note is not rejected by the Stage E clamp.
 *
 * transpositionSemitones is written pitch minus sounding pitch, per
 * AUDIO_PIPELINE.md §6. A B flat clarinet's written C sounds B flat, so +2; a
 * guitar's written C4 sounds C3, so +12. Both instruments sound below written
 * pitch, so both signs point the same way.
 *
 * PLACEHOLDER_GATE is not a measurement. Every profile ships isMeasured: false
 * and must be measured per instrument with a real microphone in a real room —
 * the dynamic range between a flute and a trumpet into the same laptop mic is
 * large, and a single global value will not work. This mirrors
 * instruments.is_measured in DATA_MODEL.md §3.2, which exists so seed data
 * cannot silently masquerade as tuned values.
 */
const PLACEHOLDER_GATE = 0.01;

const p = (
  id: string,
  displayName: string,
  family: InstrumentProfile['family'],
  nominalRange: string,
  fMinHz: number,
  fMaxHz: number,
  transpositionSemitones = 0,
): InstrumentProfile => ({
  id, displayName, family, nominalRange, fMinHz, fMaxHz,
  transpositionSemitones, gateThreshold: PLACEHOLDER_GATE, isMeasured: false,
});

export const INSTRUMENT_PROFILES: InstrumentProfile[] = [
  p('voice_soprano', 'Voice — soprano', 'voice', 'C4–C6', 240, 1100),
  p('voice_alto', 'Voice — alto', 'voice', 'F3–F5', 165, 750),
  p('voice_tenor', 'Voice — tenor', 'voice', 'C3–C5', 120, 550),
  p('voice_bass', 'Voice — bass', 'voice', 'E2–E4', 75, 350),
  p('flute', 'Flute', 'woodwind', 'C4–C7', 240, 2200),
  p('clarinet_bb', 'Clarinet (B♭)', 'woodwind', 'E3–C7', 140, 2200, 2),
  p('trumpet_bb', 'Trumpet (B♭)', 'brass', 'F#3–D6', 170, 1200, 2),
  p('violin', 'Violin', 'strings', 'G3–A7', 185, 3600),
  p('cello', 'Cello', 'strings', 'C2–C6', 60, 1100),
  p('guitar', 'Guitar (melody)', 'strings', 'E2–E6', 75, 1350, 12),
  p('bass', 'Bass (melody)', 'strings', 'E1–G4', 38, 420, 12),
  p('piano', 'Piano (melody)', 'keys', 'A0–C8', 25, 4200),
];

export const profileById = (id: string): InstrumentProfile =>
  INSTRUMENT_PROFILES.find((x) => x.id === id) ?? INSTRUMENT_PROFILES[2];

/**
 * Lowest frequency a given window can resolve: the integration window is half
 * the analysis window, so the largest evaluable lag is windowSize/2 - 1.
 * Measured against the spike: 46.9 Hz at 2048 / 48 kHz (MANIFEST OQ3).
 */
export const detectionFloorHz = (windowSize: number, sampleRate: number): number =>
  sampleRate / (windowSize / 2 - 1);

/** True when a profile's bottom notes fall below what this window can resolve. */
export const profileBelowFloor = (
  profile: InstrumentProfile,
  windowSize: number,
  sampleRate: number,
): boolean => profile.fMinHz < detectionFloorHz(windowSize, sampleRate);
