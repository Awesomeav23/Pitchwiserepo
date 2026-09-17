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

export function BlockView({ block }: { block: Block }) {
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
        />
      );
    }

    case 'diagram':
      return <Diagram id={block.id} caption={block.caption} />;

    case 'callout':
      return (
        <aside className={`callout ${block.tone}`}>
          <strong>{CALLOUT_LABEL[block.tone]}</strong>
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
