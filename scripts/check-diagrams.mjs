/**
 * Checks the lesson diagrams in client/public/diagrams.
 *
 *   node scripts/check-diagrams.mjs
 *
 * Three things, all of which have gone wrong at least once:
 *
 * 1. **Labels falling outside the canvas.** The piano's "middle C" lost its
 *    first letter to a three-pixel overflow, and the guitar's "nut" was cut in
 *    half by the top edge. An earlier version of this check missed the second,
 *    because it compared the baseline against zero and text ascends *above* its
 *    baseline. Both directions are measured now.
 *
 * 2. **Inconsistent scale.** Each diagram is stretched to the same display
 *    width, so one drawn in a narrower coordinate space renders its text
 *    larger. They were ranging from 13.6px to 24.7px for the same font-size.
 *
 * 3. **Orphans in either direction** — an id a lesson references with no file,
 *    or a file no lesson uses.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'client/public/diagrams');

const CH = 0.6;        // monospace advance, as a fraction of font-size
const ASCENT = 0.78;   // how far a capital reaches above the baseline
const DESCENT = 0.22;
const DISPLAY_W = 520; // .diagram-img max-width

let problems = 0;
const fail = (msg) => { problems++; console.log(`  FAIL  ${msg}`); };

const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
const textSizes = new Map();

for (const file of files) {
  const svg = readFileSync(join(dir, file), 'utf8');

  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!vb) { fail(`${file}: no viewBox`); continue; }
  const [vw, vh] = [Number(vb[1]), Number(vb[2])];

  const scaleMatch = /<g transform="scale\(([\d.]+)\)">/.exec(svg);
  const k = scaleMatch ? Number(scaleMatch[1]) : 1;

  for (const m of svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)) {
    const [, attrs, text] = m;
    const x = Number(/x="([-\d.]+)"/.exec(attrs)[1]) * k;
    const y = Number(/y="([-\d.]+)"/.exec(attrs)[1]) * k;
    const size = Number(/font-size="([\d.]+)"/.exec(attrs)[1]) * k;
    const anchor = (/text-anchor="(\w+)"/.exec(attrs) ?? [, 'start'])[1];

    const w = text.length * size * CH;
    const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    const top = y - size * ASCENT;          // text rises above its baseline
    const bottom = y + size * DESCENT;

    if (left < -0.5) fail(`${file}: ${JSON.stringify(text)} runs off the left (${left.toFixed(1)})`);
    if (left + w > vw + 0.5) fail(`${file}: ${JSON.stringify(text)} runs off the right`);
    if (top < -0.5) fail(`${file}: ${JSON.stringify(text)} clipped at the top (${top.toFixed(1)})`);
    if (bottom > vh + 0.5) fail(`${file}: ${JSON.stringify(text)} clipped at the bottom`);

    textSizes.set(file, Math.round((size * DISPLAY_W / vw) * 10) / 10);
  }
}

const sizes = [...new Set(textSizes.values())].sort((a, b) => a - b);
if (sizes.length && sizes[sizes.length - 1] / sizes[0] > 1.35) {
  fail(`text renders at inconsistent sizes across diagrams: ${sizes.join(', ')}px`);
}

// Referenced-vs-present, both directions.
const content = readFileSync(join(root, 'client/src/learning/content.ts'), 'utf8');
const referenced = new Set([...content.matchAll(/id: '([a-z0-9-]+)', caption:/g)].map((m) => m[1]));
const present = new Set(files.map((f) => f.replace(/\.svg$/, '')));

for (const id of referenced) if (!present.has(id)) fail(`lesson references "${id}" with no file`);
for (const id of present) if (!referenced.has(id)) fail(`"${id}.svg" is not referenced by any lesson`);

console.log(`\n  ${files.length} diagrams, ${referenced.size} referenced`);
console.log(problems === 0 ? '  all checks pass' : `\n  ${problems} problem(s)`);
if (problems > 0) process.exitCode = 1;
