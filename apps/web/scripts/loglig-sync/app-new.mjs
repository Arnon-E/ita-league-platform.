// Safety net so no competition on the Loglig app is missed: every hour (8:00-22:00 Israel time), each competition the app lists that
// is not on the site is looked at, and the ones being played are imported. That covers:
//   - a draw published after the 06:30 daily sync (the ITF pre-qualifier in Haifa, out in the afternoon for the next morning)
//   - a daily sync that did not run (the PC asleep) or whose upload failed
//   - a new Loglig season (the seasons come from Loglig, seasons.mjs)
// Started by the 10-minute live sync, before its gate (a new competition may be the only one on).
// Cost: the app's lists (a few small requests to Loglig) and the site's public competition list (memoized, the home page's query).
// A title not on the site is probed with one draw page (Masters are left out: their draws are on tournamentsoftware.com):
//   - all its matches are over: history, remembered for good (app-new-state.json) and never read again
//   - no draw yet: probed again next hour
//   - matches from yesterday on: imported with competitions.mjs, and added to the saved list the gate reads
//
//   node scripts/loglig-sync/app-new.mjs --url <site>         # dry run: lists what it finds, sends nothing
//   node scripts/loglig-sync/app-new.mjs --push --url <site>
//   --force   ignore the hours and the once-an-hour stamp
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCategoryPage, sameCompetition } from './parse.mjs';
import { loglogSeasons } from './seasons.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LOGLIG_DUMP_DIR ? path.resolve(process.env.LOGLIG_DUMP_DIR) : path.resolve(here, '../../.loglig-dump');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const force = args.includes('--force');
const EVERY_MIN = 50; // started every 10 minutes, runs about once an hour
const APP_API = 'https://loglig.com:8443/api/Union';
const APP_LISTS = ['CompetitionsYouth', 'CompetitionsAdult', 'CompetitionsDaily'];
const UA = { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)' };

/**
 * App list groups (each with its `season`) -> { title, season, teamIds } to probe: not a test, not on the site, not history.
 * A title without a draw yet is probed again every hour in the newest season, once a day in an older one (last season's empty entries).
 */
export function newTitles(groups, knownNames, state, newest, now = Date.now()) {
  const byTitle = new Map();
  for (const g of groups) {
    const t = (g?.CompetitionTitle ?? '').trim();
    if (!t || /^(טסט|בדיקה|test)(?=\s|$)/i.test(t)) continue;
    const e = byTitle.get(t) ?? { title: t, season: g.season, teamIds: [] };
    for (const c of g.categoriLIstItem ?? []) if (c?.TeamId && !e.teamIds.includes(c.TeamId)) e.teamIds.push(c.TeamId);
    byTitle.set(t, e);
  }
  const due = ({ title: t, season }) => typeof state[t] !== 'number' || season === newest || now - state[t] >= 24 * 3600e3;
  return [...byTitle.values()].filter((e) => state[e.title] !== 'past' && due(e) && !knownNames.some((n) => n === e.title || sameCompetition(n, e.title)));
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
async function probeDates(teamIds, seasons) {
  for (const id of teamIds.slice(0, 3)) {
    for (const season of seasons) {
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
  const site = opt('--url', '').replace(/\/$/, '');
  if (!site) { console.error('app-new: pass --url <site>'); process.exit(1); }
  mkdirSync(OUT, { recursive: true });
  const stamp = path.join(OUT, 'app-new.stamp');
  if (!force && existsSync(stamp) && now.getTime() - statSync(stamp).mtimeMs < EVERY_MIN * 60000) { console.log(`app-new: last run less than ${EVERY_MIN} minutes ago`); process.exit(0); }
  writeFileSync(stamp, now.toISOString(), 'utf8');

  // what the site has (the source of truth: a failed upload or a skipped daily sync shows here), plus the daily sync's saved list
  let onSite;
  try {
    const r = await fetch(`${site}/api/v1/tournaments`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    onSite = (await r.json()).map((t) => t.name);
  } catch (e) { console.log(`app-new: the site's competition list did not load (${String(e.message).slice(0, 60)}), trying next hour`); process.exit(0); }
  const savedFile = path.join(OUT, 'competitions.json');
  const saved = readJson(savedFile, []);

  const { recent } = await loglogSeasons(now);
  const groups = [];
  for (const season of recent) for (const ep of APP_LISTS) {
    try {
      const r = await fetch(`${APP_API}/${ep}/38?seasonId=${season}`, { headers: UA });
      if (r.ok) groups.push(...(await r.json()).map((g) => ({ ...g, season }))); else console.warn('  app list failed', ep, season, r.status);
    } catch (e) { console.warn('  app list failed', ep, season, String(e.message).slice(0, 60)); }
  }
  const stateFile = path.join(OUT, 'app-new-state.json');
  const state = readJson(stateFile, {});
  const candidates = newTitles(groups, onSite, state, recent[0], now.getTime());
  const current = [];
  for (const c of candidates) {
    const s = drawState(await probeDates(c.teamIds, [c.season, ...recent].filter((x, i, a) => a.indexOf(x) === i)), today);
    if (s === 'current') current.push(c.title); else if (s === 'past') state[c.title] = 'past';
    if (s !== 'none' || !(c.title in state)) console.log(`  ${s}: ${c.title}`);
    if (s === 'none') state[c.title] = now.getTime();
  }
  writeFileSync(stateFile, JSON.stringify(state), 'utf8');
  console.log(`app-new: seasons ${recent.join(', ')}, ${groups.length} app competitions, ${candidates.length} not on the site, ${current.length} being played${current.length ? ': ' + current.join(' | ') : ''}`);
  if (!current.length) process.exit(0);

  // competitions.mjs reads and imports them (into a folder of its own, so the daily sync's saved list is not replaced)
  const sub = path.join(OUT, 'app-new');
  const pass = args.filter((a, i) => a === '--push' || a === '--url' || args[i - 1] === '--url');
  const run = spawnSync(process.execPath, [...process.execArgv, path.join(here, 'competitions.mjs'), '--list', 'national', '--limit', '0', '--app', '--recent', '2', ...current.flatMap((t) => ['--only', t]), ...pass],
    { env: { ...process.env, LOGLIG_DUMP_DIR: sub }, stdio: 'inherit' });
  const found = readJson(path.join(sub, 'competitions.json'), []);
  // the imported ones join the saved list: the gate then knows they are on
  if (run.status === 0 && found.length && args.includes('--push')) {
    for (const d of found) if (!saved.some((x) => x.name === d.name)) saved.push(d);
    writeFileSync(savedFile, JSON.stringify(saved), 'utf8');
  }
  console.log(`app-new: ${found.length} imported${run.status ? ` (competitions.mjs exit ${run.status})` : ''}`);
  process.exit(run.status ?? 1);
}
