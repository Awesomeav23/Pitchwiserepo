/**
 * The current user and their instruments, fetched once and shared.
 *
 * Every screen that touches audio needs the primary instrument before it can
 * configure the engine, which is why API_SPEC §5 embeds instruments in /me
 * rather than making it a second call. This holds that one response so four
 * screens do not each fetch it.
 */
import { createContext, useContext } from 'react';
import type { Me } from './types';

export interface MeState {
  me: Me | null;
  loading: boolean;
  error: string | null;
  /** The user's primary instrument id, or null before onboarding. */
  primaryInstrumentId: string | null;
  reload: () => void;
}

export const MeContext = createContext<MeState>({
  me: null, loading: true, error: null, primaryInstrumentId: null, reload: () => {},
});

export const useMe = (): MeState => useContext(MeContext);

export const primaryOf = (me: Me | null): string | null =>
  me?.instruments.find((i) => i.isPrimary)?.instrumentId
  ?? me?.instruments[0]?.instrumentId
  ?? null;
