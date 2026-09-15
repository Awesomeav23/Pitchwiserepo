/**
 * The restricted Markdown of LEARNING_PLATFORM.md §5: emphasis, inline code,
 * and lists. No raw HTML, and no library — lesson content is authored in this
 * repo, so the parser only has to handle what the authors actually write, and a
 * general Markdown renderer would bring an HTML sanitiser problem with it for
 * no benefit.
 */
import type { JSX } from 'react';

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function inline(text: string): (string | JSX.Element)[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

export function Markdown({ md }: { md: string }) {
  const blocks = md.split(/\n\n+/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');

        if (lines.every((l) => /^\s*-\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*-\s+/, ''))}</li>)}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
          return (
            <ol key={i}>
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>)}
            </ol>
          );
        }
        return <p key={i}>{inline(block)}</p>;
      })}
    </>
  );
}
