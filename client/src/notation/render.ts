/**
 * NoteSequence → engraved notation, via VexFlow (ADR-008, ADR-015).
 *
 * The input is the same `NoteSequence` the scoring layer uses, so a lesson's
 * sheet music and the exercise a learner is scored against cannot drift apart.
 * There is one authored source — the compact note string of ADR-011 — and this
 * is one of its two renderings.
 *
 * Deliberately not supported: ties across barlines, beaming of eighths, and
 * multiple voices. The seed library is quarter notes and halves in 4/4, and
 * notation that engraves what is actually there beats notation that engraves a
 * general case badly.
 */
import { Accidental, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import { noteName } from '../audio/pitch';
import type { NoteSequence } from '../exercises/types';

export interface ScoreOptions {
  bpm: number;
  clef?: 'treble' | 'bass';
  timeSignature?: string;
  /** Rendered width in CSS pixels. */
  width: number;
}

/** Quarter-note beats, from a duration in ms at a given tempo. */
const toBeats = (ms: number, bpm: number): number => ms / (60000 / bpm);

/**
 * VexFlow duration codes. Anything that is not a clean power-of-two note value
 * falls back to the nearest shorter one: engraving a wrong-but-readable
 * rhythm is better than throwing on a sequence the library can still teach.
 */
function durationCode(beats: number): { duration: string; dots: number } {
  const table: Array<[number, string]> = [
    [4, 'w'], [3, 'h'], [2, 'h'], [1.5, 'q'], [1, 'q'], [0.75, '8'], [0.5, '8'], [0.25, '16'],
  ];
  for (const [value, code] of table) {
    if (beats >= value - 1e-6) {
      const dotted = value === 3 || value === 1.5 || value === 0.75;
      return { duration: code, dots: dotted ? 1 : 0 };
    }
  }
  return { duration: '16', dots: 0 };
}

/** "C#4" → "c#/4", which is the key format VexFlow expects. */
function toVexKey(midi: number): { key: string; accidental: string | null } {
  const name = noteName(midi);
  const letter = name[0].toLowerCase();
  const accidental = name.includes('#') ? '#' : null;
  const octave = name.replace(/[^-\d]/g, '');
  return { key: `${letter}${accidental ?? ''}/${octave}`, accidental };
}

interface Cell {
  note: StaveNote;
  beats: number;
  /** Index into sequence.notes, or null for a rest. */
  index: number | null;
}

function toCells(sequence: NoteSequence, bpm: number, clef: string): Cell[] {
  const cells: Cell[] = [];
  let cursor = 0;

  sequence.notes.forEach((n, index) => {
    // A gap before this note is a rest — rests are implicit in the data
    // (DATA_MODEL §4) and have to be made explicit to engrave them.
    const gap = toBeats(n.startMs - cursor, bpm);
    if (gap > 0.1) {
      const { duration } = durationCode(gap);
      cells.push({
        note: new StaveNote({ keys: ['b/4'], duration: `${duration}r`, clef }),
        beats: gap,
        index: null,
      });
    }

    const beats = toBeats(n.durationMs, bpm);
    const { duration, dots } = durationCode(beats);
    const { key, accidental } = toVexKey(n.midi);
    const note = new StaveNote({ keys: [key], duration, clef });
    if (accidental) note.addModifier(new Accidental('#'), 0);
    for (let d = 0; d < dots; d++) note.addModifier(new Dot(), 0);
    cells.push({ note, beats, index });
    cursor = n.startMs + n.durationMs;
  });

  return cells;
}

export interface RenderedScore {
  /** Maps a sequence note index to its rendered SVG element, for highlighting. */
  elementFor: Map<number, SVGElement>;
  heightPx: number;
  /** What the staff actually needed, which may be less than the space offered. */
  widthPx: number;
}

/**
 * Draw `sequence` into `host`, replacing anything already there.
 * Returns a map from note index to SVG element so a later playback cursor can
 * highlight notes without re-engraving.
 */
export function renderScore(
  host: HTMLDivElement,
  sequence: NoteSequence,
  opts: ScoreOptions,
): RenderedScore {
  host.innerHTML = '';

  const clef = opts.clef ?? 'treble';
  const timeSignature = opts.timeSignature ?? '4/4';
  const beatsPerBar = Number(timeSignature.split('/')[0]) || 4;

  const cells = toCells(sequence, opts.bpm, clef);

  // Chunk into bars. A note that would cross a barline stays in the bar it
  // started in, making that bar over-full; the voice is non-strict so VexFlow
  // engraves it rather than refusing. Ties are not drawn — noted above.
  const bars: Cell[][] = [];
  let bar: Cell[] = [];
  let beats = 0;
  for (const cell of cells) {
    if (beats >= beatsPerBar - 1e-6 && bar.length) {
      bars.push(bar);
      bar = [];
      beats = 0;
    }
    bar.push(cell);
    beats += cell.beats;
  }
  if (bar.length) bars.push(bar);

  // Wrap onto systems. Four bars per line at full width, fewer when narrow, so
  // a phone does not get four bars crushed into 360 px.
  const barsPerLine = opts.width < 520 ? 2 : 4;
  const lines: Cell[][][] = [];
  for (let i = 0; i < bars.length; i += barsPerLine) lines.push(bars.slice(i, i + barsPerLine));

  // VexFlow reserves 4 line-spaces (40px) above and below the staff for ledger
  // lines and stems. Three is enough for this library — nothing reaches further
  // than one ledger line — and it stops a five-line staff sitting in a box more
  // than twice its height.
  const SPACE_LN = 3;
  const STAVE_H = SPACE_LN * 10 * 2 + 40;   // space above + 4 line gaps + space below
  const SYSTEM_GAP = 14;
  const PAD_TOP = 8;
  const heightPx = PAD_TOP * 2 + lines.length * STAVE_H + (lines.length - 1) * SYSTEM_GAP;

  // A short example does not need the full column. One note stretched across
  // 1100px of staff reads as a mistake rather than as an example.
  const noteCount = cells.filter((c) => c.index !== null).length;
  const width = Math.min(opts.width, 150 + noteCount * 78);

  const renderer = new Renderer(host, Renderer.Backends.SVG);
  renderer.resize(width, heightPx);
  const ctx = renderer.getContext();

  const elementFor = new Map<number, SVGElement>();
  const usableWidth = width - 2;

  lines.forEach((line, lineIndex) => {
    const y = PAD_TOP + lineIndex * (STAVE_H + SYSTEM_GAP);
    // The first bar of the first line carries the clef and time signature, so
    // it needs more room than the others or its notes crowd the signature.
    let x = 1;

    // Width in proportion to what each bar holds, not split evenly. A final
    // bar with one held note was getting the same width as a bar of four,
    // which crammed that note against the barline and left most of its bar
    // empty.
    const lineBeats = line.map((bar) => bar.reduce((sum, c) => sum + c.beats, 0));
    const totalLineBeats = lineBeats.reduce((a, b) => a + b, 0) || 1;
    const signatureRoom = lineIndex === 0 ? 46 : 0;
    const shareable = usableWidth - signatureRoom;

    line.forEach((barCells, barIndex) => {
      const isFirst = lineIndex === 0 && barIndex === 0;
      // A time signature on a one-note example answers a question nobody asked;
      // the clef stays, because on these it is the point.
      const withMeter = isFirst && noteCount > 1;
      const extra = isFirst ? signatureRoom : 0;
      // A floor, so a single short note still gets a readable bar.
      const share = Math.max(0.18, lineBeats[barIndex] / totalLineBeats);
      const barWidth = Math.floor(shareable * share) + extra;

      const stave = new Stave(x, y, barWidth, {
        spaceAboveStaffLn: SPACE_LN,
        spaceBelowStaffLn: SPACE_LN,
      });
      if (isFirst) {
        stave.addClef(clef);
        if (withMeter) stave.addTimeSignature(timeSignature);
      }
      stave.setContext(ctx).draw();

      const voice = new Voice({ numBeats: beatsPerBar, beatValue: 4 });
      voice.setStrict(false);
      voice.addTickables(barCells.map((c) => c.note));
      new Formatter().joinVoices([voice]).format([voice], barWidth - (isFirst ? (withMeter ? 62 : 44) : 16));
      voice.draw(ctx, stave);

      for (const cell of barCells) {
        if (cell.index == null) continue;
        const el = cell.note.getSVGElement();
        if (el) elementFor.set(cell.index, el as unknown as SVGElement);
      }

      x += barWidth;
    });
  });

  return { elementFor, heightPx, widthPx: width };
}
