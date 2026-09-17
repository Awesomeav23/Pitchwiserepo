/**
 * The microphone inputs available to this browser.
 *
 * Labels are empty until the user has granted microphone permission — that is
 * a privacy measure, not a bug, and it is why the list often reads "Microphone
 * 1, Microphone 2" before a first take and properly afterwards. The list is
 * re-read on `devicechange`, so plugging in an interface mid-session works.
 */
import { useEffect, useState } from 'react';

export interface AudioInput {
  deviceId: string;
  label: string;
}

export function useAudioInputs(): { inputs: AudioInput[]; labelled: boolean } {
  const [inputs, setInputs] = useState<AudioInput[]>([]);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setInputs(
          devices
            .filter((d) => d.kind === 'audioinput')
            .map((d, i) => ({
              deviceId: d.deviceId,
              label: d.label || `Microphone ${i + 1}`,
            })),
        );
      } catch {
        // Enumerating can throw in a locked-down context. An empty list means
        // the picker hides and the browser's default is used, which is the
        // behaviour before this existed.
      }
    };

    void read();
    navigator.mediaDevices?.addEventListener?.('devicechange', read);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', read);
    };
  }, []);

  return { inputs, labelled: inputs.some((i) => i.label && !i.label.startsWith('Microphone ')) };
}
