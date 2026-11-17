// Competitions that appear on the Loglig app during the day (a draw published in the afternoon for the next morning, like the ITF
// pre-qualifiers that are only on the app): the daily sync runs at 06:30, so without this they would show up only on their first day.
// Meant to be started by the 10-minute live sync, before its gate (a new competition may be the only one on): it does anything only
// about once an hour, 8:00-22:00 Israel time. It reads the app's lists (3 small requests, no database) and compares them with the
// daily sync's saved list (competitions.json, the last 21 days). A title not there is probed with one draw page:
//   - all its matches are over: history, remembered for good (app-new-state.json) and never read again
//   - no draw yet: looked at again after 6 hours
//   - matches from yesterday on: imported with competitions.mjs and added to the saved list
//
//   node scripts/loglig-sync/app-new.mjs                      # dry run: lists what it finds, sends nothing
//   node scripts/loglig-sync/app-new.mjs --push --url <site>
//   --force   ignore the hours and the once-an-hour stamp
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCategoryPage, sameCompetition } from './parse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LOGLIG_DUMP_DIR ? path.resolve(process.env.LOGLIG_DUMP_DIR) : path.resolve(here, '../../.loglig-dump');
const args = process.argv.slice(2);
const force = args.includes('--force');
const EVERY_MIN = 50; // started every 10 minutes, runs about once an hour
const RECHECK_MS = 6 * 3600e3;
const APP_API = 'https://loglig.com:8443/api/Union';
// Masters draws are on tournamentsoftware.com (the daily sync and masters-live.mjs), not on Loglig
const APP_LISTS = ['CompetitionsYouth', 'CompetitionsAdult', 'CompetitionsDaily'];
const CURRENT_SEASON = 1755; // the same seasons as competitions.mjs
const SEASONS = [CURRENT_SEASON, 1671];
const UA = { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)' };

/** App list groups -> { title, teamIds } worth probing: not a test, not in the saved list, not history, not probed in the last 6 hours. */
export function newTitles(groups, knownNames, state, now = Date.now()) {
  const byTitle = new Map();
  for (const g of groups) {
    const t = (g?.CompetitionTitle ?? '').trim();
    if (!t || /^(טסט|בדיקה|test)(?=\s|$)/i.test(t)) continue;
    const e = byTitle.get(t) ?? { title: t, teamIds: [] };
    for (const c of g.categoriLIstItem ?? []) if (c?.TeamId && !e.teamIds.includes(c.TeamId)) e.teamIds.push(c.TeamId);
    byTitle.set(t, e);
  }
  return [...byTitle.values()].filter(({ title: t }) => !knownNames.some((n) => n === t || sameCompetition(n, t))
    && state[t] !== 'past' && !(typeof state[t] === 'number' && now - state[t] < RECHECK_MS));
}

/** Match dates (YYYY-MM-DD, Loglig's empty 1753 date left out) -> 'none' | 'past' | 'current'. Over = everything before yesterday. */
export function drawState(dates, today) {
  const real = dates.filter((d) => d >= '2000').sort();
  if (!real.length) return 'none';
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  return real[real.length - 1] < yesterday ? 'past' : 'current';
}

const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The match dates of the first draw page of these categories that has any (a few requests at most). */
async function probeDates(teamIds) {
  for (const id of teamIds.slice(0, 6)) {
    for (const season of SEASONS) {
      await sleep(700);
      try {
        const r = await fetch(`https://loglig.com:2053/LeagueTable/SchedulesForTennisCompetition/${id}?seasonId=${season}`, { headers: UA });
        if (!r.ok) continue; // not this season's page (HTTP 500)
        const dates = parseCategoryPage(await r.text()).matches.map((m) => String(m.start ?? '').slice(0, 10));
        if (dates.length) return dates;
      } catch { /* try the next one */ }
    }
  }
  return [];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const now = new Date();
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  const hour = Number(p.hour), today = `${p.year}-${p.month}-${p.day}`;
  if (!force && (hour < 8 || hour >= 22)) { console.log(`app-new: outside 8:00-22:00 (Israel time ${hour}:00)`); process.exit(0); }
  mkdirSync(OUT, { recursive: true });
  const stamp = path.join(OUT, 'app-new.stamp');
  if (!force && existsSync(stamp) && now.getTime() - statSync(stamp).mtimeMs < EVERY_MIN * 60000) { console.log(`app-new: last run less than ${EVERY_MIN} minutes ago`); process.exit(0); }
  writeFileSync(stamp, now.toISOString(), 'utf8');

  const savedFile = path.join(OUT, 'competitions.json');
  const saved = readJson(savedFile, null);
  if (!Array.isArray(saved)) { console.log('app-new: no saved competition list (the daily sync has not run), skipping'); process.exit(0); }
  const groups = [];
  for (const ep of APP_LISTS) {
    try {
      const r = await fetch(`${APP_API}/${ep}/38?seasonId=${CURRENT_SEASON}`, { headers: UA });
      if (r.ok) groups.push(...(await r.json())); else console.warn('  app list failed', ep, r.status);
    } catch (e) { console.warn('  app list failed', ep, String(e.message).slice(0, 60)); }
  }
  const stateFile = path.join(OUT, 'app-new-state.json');
  const state = readJson(stateFile, {});
  const candidates = newTitles(groups, saved.map((d) => d.name), state, now.getTime());
  const current = [];
  for (const c of candidates) {
    const s = drawState(await probeDates(c.teamIds), today);
    if (s === 'current') current.push(c.title); else state[c.title] = s === 'past' ? 'past' : now.getTime();
    console.log(`  ${s}: ${c.title}`);
  }
  writeFileSync(stateFile, JSON.stringify(state), 'utf8');
  console.log(`app-new: ${groups.length} app competitions, ${candidates.length} probed, ${current.length} to import${current.length ? ': ' + current.join(' | ') : ''}`);
  if (!current.length) process.exit(0);

  // competitions.mjs reads and imports them (into a folder of its own, so the daily sync's saved list is not replaced)
  const sub = path.join(OUT, 'app-new');
  const pass = args.filter((a, i) => a === '--push' || a === '--url' || args[i - 1] === '--url');
  const run = spawnSync(process.execPath, [...process.execArgv, path.join(here, 'competitions.mjs'), '--list', 'national', '--limit', '0', '--app', '--recent', '2', ...current.flatMap((t) => ['--only', t]), ...pass],
    { env: { ...process.env, LOGLIG_DUMP_DIR: sub }, stdio: 'inherit' });
  const found = readJson(path.join(sub, 'competitions.json'), []);
  // the imported ones join the saved list: the gate then knows they are on, and the next run does not read them again
  if (run.status === 0 && found.length && args.includes('--push')) {
    for (const d of found) if (!saved.some((x) => x.name === d.name)) saved.push(d);
    writeFileSync(savedFile, JSON.stringify(saved), 'utf8');
  }
  console.log(`app-new: ${found.length} imported${run.status ? ` (competitions.mjs exit ${run.status})` : ''}`);
  process.exit(run.status ?? 1);
}
