/**
 * Checks that every day of work reached the change log in docs/MANIFEST.md.
 *
 *   node scripts/check-changelog.mjs
 *
 * Written because it happened twice: a day's deployment preparation and a
 * catalog fix both shipped without an entry, and both were found by reading
 * back rather than by anything catching it. Remembering is not a mechanism.
 *
 * What it can and cannot do. It cannot tell whether an entry *describes* a
 * commit — that is a judgement about prose, and a check that tried would
 * either be fooled by a vague entry or complain about a good one. What it can
 * do is notice that a date has commits and no entries at all, which is the
 * failure that actually occurred both times.
 *
 * Commits touching only the change log itself are ignored: recording the day's
 * work is not itself work that needs recording.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8' }).trim();

// ---- commits by date ---------------------------------------------------

const commits = git("log --pretty=format:%h%x09%ad%x09%s --date=short")
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [hash, date, ...rest] = line.split('\t');
    return { hash, date, subject: rest.join('\t') };
  });

/** True when a commit changed nothing but the change log. */
const onlyChangelog = (hash) => {
  const files = git(`show --pretty=format: --name-only ${hash}`).split('\n').filter(Boolean);
  return files.length > 0 && files.every((f) => f === 'docs/MANIFEST.md');
};

const byDate = new Map();
for (const c of commits) {
  if (onlyChangelog(c.hash)) continue;
  if (!byDate.has(c.date)) byDate.set(c.date, []);
  byDate.get(c.date).push(c);
}

// ---- entries by date ---------------------------------------------------

const manifest = readFileSync(join(root, 'docs/MANIFEST.md'), 'utf8');
const entries = new Map();
for (const line of manifest.split('\n')) {
  const m = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/.exec(line);
  if (!m) continue;
  entries.set(m[1], (entries.get(m[1]) ?? 0) + 1);
}

// ---- report ------------------------------------------------------------

const dates = [...new Set([...byDate.keys(), ...entries.keys()])].sort();
let problems = 0;

console.log('date         commits  entries');
for (const date of dates) {
  const n = byDate.get(date)?.length ?? 0;
  const e = entries.get(date) ?? 0;
  let flag = '';
  if (n > 0 && e === 0) { flag = '  <- work with no change log entry'; problems++; }
  // An entry with no commit is usually a dated decision rather than an error,
  // so it is shown and not counted against.
  else if (n === 0 && e > 0) flag = '  (entries only — a decision or a note)';
  console.log(`${date}   ${String(n).padStart(6)}   ${String(e).padStart(6)}${flag}`);
}

if (problems > 0) {
  console.log(`\n${problems} day(s) of work missing from the change log:\n`);
  for (const date of dates) {
    if ((byDate.get(date)?.length ?? 0) > 0 && !entries.has(date)) {
      for (const c of byDate.get(date)) console.log(`  ${date}  ${c.hash}  ${c.subject}`);
    }
  }
  console.log('\nAdd entries to the Change Log in docs/MANIFEST.md.');
  process.exitCode = 1;
} else {
  console.log('\nEvery day with commits has at least one change log entry.');
}
