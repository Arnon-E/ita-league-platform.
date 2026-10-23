// Decides whether the 10-minute sync should run right now, so it does not wake the database all day for nothing:
//   run only between FROM and TO o'clock (Israel time) and only while a competition is on (or about to start).
// It looks at the competitions the daily sync last saved (competitions.json in the dump folder), so it needs no network and no database.
//
//   node scripts/loglig-sync/gate.mjs [--from 9] [--to 19] [--grace 1] [--dump-dir <folder>]
//   exit code 0 = run the sync, 10 = skip it (the reason is printed; any other code means the gate itself failed, and the .bat files then run the sync anyway).
//   Used by run-rosters-sync.bat and run-dev-rosters-sync.bat.
// If the saved list is missing or more than 3 days old the answer is "run" (inside the hours), so a broken daily sync never silences the live updates.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TZ = 'Asia/Jerusalem';
const DAY = 86400000;
const parts = (now) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
};
const shift = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** `competitions`: items with `start` and `end` as YYYY-MM-DD, or null when the list is unknown (then it runs inside the hours, to be safe). Returns { run, reason }. */
export function shouldSync(now, competitions, { from = 9, to = 19, grace = 1 } = {}) {
  const { date, hour } = parts(now);
  if (hour < from || hour >= to) return { run: false, reason: `outside ${from}:00-${to}:00 (Israel time ${hour}:00)` };
  if (!competitions) return { run: true, reason: 'no recent competition list saved, running to be safe' };
  const on = competitions.filter((c) => c?.start && c?.end && shift(c.start, -grace) <= date && date <= c.end);
  if (!on.length) return { run: false, reason: `no competition on ${date}` };
  return { run: true, reason: `${on.length} competition(s) on: ${on.slice(0, 3).map((c) => c.name).join(' | ')}` };
}

/** Reads the daily sync's saved list; null when it is missing, unreadable or older than 3 days. */
export function readCompetitions(dumpDir, now = new Date()) {
  const file = path.join(dumpDir, 'competitions.json');
  try {
    if (!existsSync(file) || now.getTime() - statSync(file).mtimeMs > 3 * DAY) return null;
    const j = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(j) ? j : Object.values(j);
  } catch { return null; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dumpDir = opt('--dump-dir', process.env.LOGLIG_DUMP_DIR || path.resolve(here, '../../.loglig-dump'));
  const list = readCompetitions(dumpDir);
  const r = shouldSync(new Date(), list, { from: Number(opt('--from', 9)), to: Number(opt('--to', 19)), grace: Number(opt('--grace', 1)) });
  console.log(`${r.run ? 'RUN' : 'SKIP'}: ${r.reason}`);
  process.exit(r.run ? 0 : 10);
}
