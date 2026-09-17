/**
 * Sheet music for a lesson: engraved notation with a play button.
 *
 * Stages 1 and 2 of the notation plan: a static engraving that can be heard,
 * with the sounding note highlighted as it plays. Both halves of that were
 * built in stage 1 and left unused — the renderer already returned a
 * note-index to element map, and the player already reported note indices.
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
  /**
   * Stage 3: the note being played right now, during a take, and how it is
   * going. Distinct from playback highlighting — that follows the reference
   * audio, this follows the performer.
   */
  live?: { index: number | null; band: 'green' | 'amber' | 'red' | null };
  bpm: number;
  clef?: 'treble' | 'bass';
  timeSignature?: string;
  caption?: string;
  /** False to engrave without a play button. */
  playable?: boolean;
}

export function Score({ sequence, bpm, clef, timeSignature, caption, playable = true, live }: ScoreProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const handleRef = useRef<PlaybackHandle | null>(null);
  /** note index → its engraved element, handed back by the renderer. */
  const elementsRef = useRef<Map<number, SVGElement>>(new Map());
  const litRef = useRef<SVGElement | null>(null);
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
          const { elementFor } = renderScore(host, sequence, { bpm, clef, timeSignature, width });
          // Re-engraving replaces every element, so the old map points at nodes
          // no longer in the document. Anything highlighted is gone with them.
          elementsRef.current = elementFor;
          litRef.current = null;
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

  /**
   * Moves the highlight to the sounding note, or clears it when passed null.
   *
   * A class on the engraved element rather than a separate overlay: VexFlow
   * decides where a note ends up, and anything drawn on top would have to
   * recompute that layout and then stay in step with it through every resize.
   */
  const light = useCallback((index: number | null) => {
    litRef.current?.classList.remove('vf-playing');
    const next = index === null ? null : elementsRef.current.get(index) ?? null;
    next?.classList.add('vf-playing');
    litRef.current = next;
  }, []);

  /**
   * Live feedback during a take. Driven from props rather than from the
   * player, because the thing being followed is the performer rather than the
   * reference audio, and the two can be nowhere near each other.
   */
  const liveIndex = live?.index ?? null;
  const liveBand = live?.band ?? null;
  const liveRef = useRef<SVGElement | null>(null);

  useEffect(() => {
    liveRef.current?.classList.remove('vf-live', 'vf-green', 'vf-amber', 'vf-red');
    if (liveIndex === null) { liveRef.current = null; return; }
    const el = elementsRef.current.get(liveIndex) ?? null;
    if (el) {
      el.classList.add('vf-live');
      if (liveBand) el.classList.add(`vf-${liveBand}`);
    }
    liveRef.current = el;
  }, [liveIndex, liveBand]);

  const toggle = useCallback(() => {
    if (playing) {
      handleRef.current?.stop();
      light(null);
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
      onNote: light,
      onEnd: () => { setPlaying(false); handleRef.current = null; light(null); },
    });
  }, [playing, sequence, light]);

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
