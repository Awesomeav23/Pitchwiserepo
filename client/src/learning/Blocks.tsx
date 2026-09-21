/** Renders one lesson content block. LEARNING_PLATFORM.md §5. */
import { useState } from 'react';
import { buildExercise } from '../exercises/build';
import { Score } from '../notation/Score';
import { Markdown } from './Markdown';
import type { Block } from './types';

const CALLOUT_LABEL: Record<string, string> = {
  note: 'Note',
  warning: 'Careful',
  limitation: 'Not graded',
};

export function BlockView({ block, live }: {
  block: Block;
  /** Passed through to a score block so the staff a learner is reading is the
   *  one that lights up during a take. */
  live?: { index: number | null; band: 'green' | 'amber' | 'red' | null };
}) {
  switch (block.kind) {
    case 'prose':
      return <div className="prose"><Markdown md={block.md} /></div>;

    case 'score': {
      const { noteSequence } = buildExercise(block.spec, { bpm: block.bpm });
      return (
        <Score
          sequence={noteSequence}
          bpm={block.bpm}
          clef={block.clef}
          timeSignature={block.timeSignature}
          caption={block.caption}
          playable={block.playable !== false}
          instrument={block.instrumentId}
          live={live}
        />
      );
    }

    case 'diagram':
      return <Diagram id={block.id} caption={block.caption} />;

    case 'callout':
      return (
        <aside className={`callout ${block.tone}`}>
          {/* Its own class, not a bare <strong>: the body is Markdown and may
              contain bold of its own, which was being turned into a second
              uppercase label mid-sentence. */}
          <span className="callout-label">{CALLOUT_LABEL[block.tone]}</span>
          <Markdown md={block.md} />
        </aside>
      );
  }
}


/**
 * Diagrams resolve by id, never by URL, so an asset can move without a data
 * migration — and a missing one degrades to its caption rather than a broken
 * image icon (LEARNING_PLATFORM §5.2). That fallback is not theoretical: the
 * set is incomplete, and a lesson referencing a drawing nobody has made yet
 * should still read.
 */
function Diagram({ id, caption }: { id: string; caption: string }) {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return (
      <figure className="diagram missing">
        <div className="diagram-slot">Diagram: {id}</div>
        <figcaption>{caption}</figcaption>
      </figure>
    );
  }

  return (
    <figure className="diagram">
      <img
        className="diagram-img"
        src={`${import.meta.env.BASE_URL}diagrams/${id}.svg`}
        alt={caption}
        onError={() => setMissing(true)}
      />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
