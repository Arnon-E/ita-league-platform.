// Planned competitions from the federation's yearly Gantt (the .xlsx linked from its "לוח תחרויות" pages): name and dates only,
// for competitions ita.co.il has not published yet (Tennis Europe, ITF, leagues, qualifiers, finals...). Real competitions replace them.
//
//   node scripts/loglig-sync/calendar.mjs                          # dry run: prints what would be sent
//   node scripts/loglig-sync/calendar.mjs --push --url http://localhost:3100
//   node scripts/loglig-sync/calendar.mjs --file gantt.xlsx --year 2026   # a local copy instead of downloading
//
// Also runs at the end of `competitions.mjs --list all --push` (after the real competitions, so the ones they cover are skipped).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findGanttUrl, ganttYear, plannedFromGantt } from './gantt.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)' };

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}

async function getText(url) { await sleep(700); const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); }
async function getBytes(url) { await sleep(700); const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${url}`); return Buffer.from(await r.arrayBuffer()); }

/** The Gantt's planned competitions, from `opts.file` or the newest file on the federation's site. Today's date and later only. */
export async function readPlanned(opts = {}) {
  const today = new Date().toISOString().slice(0, 10);
  let buf;
  if (opts.file) buf = readFileSync(opts.file);
  else {
    const url = await findGanttUrl(getText);
    if (!url) throw new Error('no Gantt file linked from the calendar pages');
    console.log('Gantt:', decodeURIComponent(url));
    buf = await getBytes(url);
  }
  return plannedFromGantt(buf, Number(opts.year ?? ganttYear(buf) ?? today.slice(0, 4)), today);
}

export async function pushCalendar(events, base, secret) {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` }, body: JSON.stringify({ kind: 'calendar', events: events.map(({ name, start, end, level, section }) => ({ name, start, end, level, section })) }) });
  console.log(`push calendar: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.ok;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
  const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };
  const events = await readPlanned({ file: opt('--file'), year: opt('--year') });
  for (const e of events) console.log(`${e.start}..${e.end}  ${e.section.padEnd(7)} ${e.level.padEnd(13)} ${e.name}`);
  console.log(`${events.length} planned competition(s)`);
  if (!args.includes('--push')) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }
  const base = opt('--url', env.PUBLIC_URL ?? '');
  if (!base || !env.CRON_SECRET) { console.error('--push needs a site URL and CRON_SECRET (env or apps/web/.env.production.local).'); process.exit(1); }
  process.exit((await pushCalendar(events, base, env.CRON_SECRET)) ? 0 : 1);
}
