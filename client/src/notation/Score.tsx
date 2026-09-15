/**
 * Sheet music for a lesson: engraved notation with a play button.
 *
 * Stage 1 of the notation plan — static engraving that can be heard. The
 * playback cursor (stage 2) is why `renderScore` hands back a note-index to
 * SVG-element map and why the player reports note indices; nothing draws with
 * them yet.
 *
 * VexFlow is loaded on demand rather than imported at the top. It is by far the
 * largest thing in the bundle — bigger than React and the audio engine
 * together — and the tuner and the standalone practice screen never engrave a
 * note. Loading it with the app would make every screen pay for the ones that
 * use notation.
 */

type RenderModule = typeof import('./render');
let pending: Promise<RenderModule> | null = null;
const loadRenderer = (): Promise<RenderModule> => (pending ??= import('./render'));
import { useCallback, useEffect, useRef, useState } from 'react';
import { playSequence } from './player';
import type { PlaybackHandle } from './player';
import type { NoteSequence } from '../exercises/types';

export interface ScoreProps {
  sequence: NoteSequence;
  bpm: number;
  clef?: 'treble' | 'bass';
  timeSignature?: string;
  caption?: string;
  /** False to engrave without a play button. */
  playable?: boolean;
}

export function Score({ sequence, bpm, clef, timeSignature, caption, playable = true }: ScoreProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const handleRef = useRef<PlaybackHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-engrave on resize: VexFlow lays out to a fixed pixel width, so a
  // narrowed window would otherwise keep a stave wider than its container.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    let observer: ResizeObserver | null = null;

    void loadRenderer().then(({ renderScore }) => {
      if (cancelled) return;
      const draw = () => {
        const width = host.clientWidth;
        if (width < 40) return;
        try {
          renderScore(host, sequence, { bpm, clef, timeSignature, width });
          setError(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      };
      draw();
      observer = new ResizeObserver(draw);
      observer.observe(host);
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });

    return () => { cancelled = true; observer?.disconnect(); };
  }, [sequence, bpm, clef, timeSignature]);

  useEffect(() => () => {
    handleRef.current?.stop();
    void ctxRef.current?.close();
  }, []);

  const toggle = useCallback(() => {
    if (playing) {
      handleRef.current?.stop();
      return;
    }
    // Created on the click, not on mount: an AudioContext made without a user
    // gesture starts suspended, and a lesson page full of scores would open a
    // context per example whether or not anyone pressed play.
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    void ctx.resume();
    setPlaying(true);
    handleRef.current = playSequence(ctx, sequence, {
      onEnd: () => { setPlaying(false); handleRef.current = null; },
    });
  }, [playing, sequence]);

  return (
    <figure className="score">
      <div className="score-sheet" ref={hostRef} />
      {error && <p className="alert error">Could not engrave this example: {error}</p>}
      <figcaption>
        {playable && (
          <button className="play" onClick={toggle}>
            {playing ? '■ Stop' : '▶ Hear it'}
          </button>
        )}
        {caption && <span>{caption}</span>}
      </figcaption>
    </figure>
  );
}
