/** Renders one lesson content block. LEARNING_PLATFORM.md §5. */
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
      // Assets resolve by id, never by URL, so a missing one degrades to its
      // caption rather than a broken image (LEARNING_PLATFORM §5.2). No diagram
      // set has been drawn yet, so every one of these degrades today.
      return (
        <figure className="diagram missing">
          <div className="diagram-slot">Diagram: {block.id}</div>
          <figcaption>{block.caption}</figcaption>
        </figure>
      );

    case 'callout':
      return (
        <aside className={`callout ${block.tone}`}>
          <strong>{CALLOUT_LABEL[block.tone]}</strong>
          <Markdown md={block.md} />
        </aside>
      );
  }
}
