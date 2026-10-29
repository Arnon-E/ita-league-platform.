// Mirrors public ITA youth competitions (details, categories, players, matches, results) into this app. No login.
//
//   node scripts/loglig-sync/competitions.mjs                       # latest 3 national competitions, dry run (saves JSON only)
//   node scripts/loglig-sync/competitions.mjs --limit 10            # more
//   node scripts/loglig-sync/competitions.mjs --all                 # everything listed
//   node scripts/loglig-sync/competitions.mjs --list national,regional,seniors --all --recent 30
//                                                                   # several listings; --recent N = skip competitions that ended more than N days ago
//   node scripts/loglig-sync/competitions.mjs --push --url http://localhost:3100   # send to a site (CRON_SECRET from env / .env.production.local)
//   ... --only "סוכות 2026" --only "קיץ 1 2026"                                  # just these competitions (a repair)
//
// Read-only against ita.co.il and loglig.com: plain GETs, ~1 request/second.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ageOf, buildCategory, buildDoubles, genderOf, israelToUtc, koRound, parseCategoryPage, parseCompetitionPage } from './parse.mjs';

import { ORG_URL, buildTsCompetition, parseOrgList, readTournament, sameMasters, session as tsSession } from './tournamentsoftware.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LOGLIG_DUMP_DIR ? path.resolve(process.env.LOGLIG_DUMP_DIR) : path.resolve(here, '../../.loglig-dump'); // LOGLIG_DUMP_DIR: where the development syncs keep their data
const slug = (s) => 'https://ita.co.il/' + encodeURI(s) + '/';
// every competition listing on ita.co.il: key -> { url, level, section }
const LISTS = {
  national: { url: slug('תחרויות-נוער-ארציות'), level: 'NATIONAL', section: 'YOUTH' },
  regional: { url: slug('תחרויות-נוער-אזוריות'), level: 'REGIONAL', section: 'YOUTH' },
  'youth-intl': { url: slug('תחרויות-נוער-בינלאומיות'), level: 'INTERNATIONAL', section: 'YOUTH' },
  u10: { url: slug('תחרויות-נוער-סבב-גילאי-10'), level: 'CIRCUIT', section: 'YOUTH' },
  'masters-national': { url: slug('תחרויות-סניורים-לאומיות'), level: 'NATIONAL', section: 'MASTERS' },
  'masters-intl': { url: slug('תחרויות-סניורים-בינלאומיות'), level: 'INTERNATIONAL', section: 'MASTERS' },
  'masters-other': { url: slug('תחרויות-סניורים-תחרויות-נוספות'), level: 'NATIONAL', section: 'MASTERS' },
  'adults-national': { url: slug('תחרויות-בוגרים-לאומיות'), level: 'NATIONAL', section: 'ADULTS' },
  'adults-itf': { url: slug('תחרויות-בוגרים-itf'), level: 'INTERNATIONAL', section: 'ADULTS' },
  'adults-atp': { url: slug('תחרויות-בוגרים-atp'), level: 'INTERNATIONAL', section: 'ADULTS' },
  'adults-special': { url: slug('תחרויות-בוגרים-אירועים-מיוחדים'), level: 'NATIONAL', section: 'OTHER' },
};

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const push = args.includes('--push');
const limit = args.includes('--all') ? Infinity : Number(opt('--limit', 3));
const listArg = opt('--list', 'national');
const listNames = listArg === 'all' ? Object.keys(LISTS) : listArg.split(',');
const recentDays = args.includes('--recent') ? Number(opt('--recent', 30)) : Infinity;
// --only "name part" (repeatable): import just the competitions whose name contains one of them (a targeted repair)
const only = args.flatMap((a, i) => (a === '--only' && args[i + 1] ? [args[i + 1]] : []));

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    await sleep(700 * i);
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)' } });
      if (r.ok) return r.text();
      if (r.status < 500 || i >= tries) throw new Error(`${r.status} ${url}`);
    } catch (e) {
      if (i >= tries || /^\d{3} /.test(String(e.message))) throw e;
    }
  }
}

// 1) which competitions exist (per listing, so each keeps its level)
async function listCompetitions(name) {
  const listUrl = LISTS[name]?.url ?? name;
  const found = [];
  for (let page = 1; page <= 15; page++) {
    let html;
    try { html = await get(page === 1 ? listUrl : `${listUrl}?jsf=jet-engine&pagenum=${page}`); } catch (e) { if (page === 1) throw e; break; }
    const links = [...new Set([...html.matchAll(/href="(https:\/\/ita\.co\.il\/competitions\/[^"#?]+\/?)"/g)].map((m) => m[1]))];
    const fresh = links.filter((l) => !found.includes(l));
    if (!fresh.length) break;
    found.push(...fresh);
    if (found.length >= limit) break;
  }
  return found.slice(0, limit).map((url) => ({ url, list: name }));
}

const levelOf = (list, name) => (/^סבב/.test(name) ? 'CIRCUIT' : LISTS[list]?.level ?? 'NATIONAL');
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (d) => Math.floor((Date.parse(today) - Date.parse(d)) / 86400000);

const GENERIC = new Set(['תחרות', 'לאומית', 'אזורית', 'ארצית', 'אליפות', 'ישראל', 'לנוער', 'גברים', 'נשים', 'מאסטרס', 'עש', 'של', 'על']);
/** Same event? Equal/contained names, or the same numbers and at least two shared distinctive words (names differ between pages). */
function sameCompetition(a, b) {
  const norm = (x) => x.replace(/["'״׳`]/g, '').replace(/[.,:\-–/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const x = norm(a), y = norm(b);
  const toks = (t) => new Set(t.split(' ').filter(Boolean));
  const tx = toks(x), ty = toks(y);
  const nums = (t) => [...t].filter((w) => /^\d+$/.test(w)).sort().join(',');
  // contained names are the same event only with the same numbers: "אליפות ישראל לנוער" is not "אליפות ישראל לנוער סוכות 2026"
  if (x.includes(y) || y.includes(x)) return nums(tx) === nums(ty);
  if (nums(tx) && nums(ty) && nums(tx) !== nums(ty)) return false;
  return [...tx].filter((w) => ty.has(w) && w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w)).length >= 2;
}

/** A parsed category page -> normalized category (knockout rounds numbered from the first round, groups as round 1). */
// 2) one competition -> normalized document (draws and results when published, otherwise the planned categories)
async function readCompetition({ url, list }) {
  const c = parseCompetitionPage(await get(url), url);
  if (only.length && !only.some((o) => c.name.includes(o))) return { skipped: 'not in --only', name: c.name, url };
  if (!c.start || !c.end) return { skipped: 'no dates', name: c.name, url };
  if (daysAgo(c.end) > recentDays) return { skipped: 'finished long ago', name: c.name, url };
  const cats = [], doubles = [];
  {
    for (const ref of c.categories) {
      const page = parseCategoryPage(await get(`https://loglig.com:2053/LeagueTable/SchedulesForTennisCompetition/${ref.id}?seasonId=${ref.seasonId}`));
      if (!page.matches.length) continue;
      // some competition pages still embed another competition's draws: keep only pages that belong to this one
      if (page.competition && !sameCompetition(page.competition, c.name)) continue;
      const label = ref.section === 'qualifying' ? 'מוקדמות' : ref.section === 'finals' ? 'בית הגמר' : '';
      const cat = buildCategory(page, label, ref.id);
      if (cat) cats.push(cat);
      const dbl = buildDoubles(page, label, ref.id);
      if (dbl) doubles.push(dbl);
    }
  }
  if (!cats.length) for (const p of c.planned) cats.push({ name: p.name, source: '', gender: p.gender, age: p.age, format: 'KNOCKOUT', matches: [] });
  return {
    kind: 'competition', name: c.name, start: c.start, end: c.end, feeShekel: c.feeShekel, level: levelOf(list, c.name), section: LISTS[list]?.section ?? 'YOUTH', sourceUrl: url,
    registerUrl: c.registerUrl, registrationCloses: c.registrationCloses ? israelToUtc(c.registrationCloses) : null,
    isDoubles: c.isDoubles, venues: c.venues, contacts: c.contacts, categories: cats, doubles,
  };
}

mkdirSync(OUT, { recursive: true });
const urls = [];
for (const n of listNames) {
  console.log('Listing competitions from', decodeURI(LISTS[n]?.url ?? n));
  for (const x of await listCompetitions(n)) if (!urls.some((u) => u.url === x.url)) urls.push(x);
}
console.log(`${urls.length} competition(s)
`);

const docs = [];
for (const url of urls) {
  try {
    const d = await readCompetition(url);
    if (d.skipped) { console.log(`- skipped (${d.skipped}): ${d.name}`); continue; }
    const matchCount = d.categories.reduce((n, c) => n + c.matches.length, 0);
    const players = new Set(d.categories.flatMap((c) => c.matches.flatMap((m) => [m.a.name, m.b.name])));
    console.log(`- ${d.name}  ${d.start}..${d.end}  fee ${d.feeShekel}  ${d.categories.length} categories  ${matchCount} matches  ${players.size} players`);
    docs.push(d);
  } catch (e) { console.warn('  failed', decodeURI(url.url), String(e.message).slice(0, 80)); }
}
// 3) the Loglig app's lists (what the app shows under Youth / Adults / Masters / Daily), read from the same public endpoint the app calls.
//    Each category carries a TeamId = the id of its public draw page, so this also finds draws the ITA site does not link correctly.
const APP_API = 'https://loglig.com:8443/api/Union';
const APP_LISTS = [['CompetitionsYouth', 'YOUTH'], ['CompetitionsAdult', 'ADULTS'], ['CompetitionsSenior', 'MASTERS'], ['CompetitionsDaily', 'OTHER']];
const appLevel = (name) => (/^סבב/.test(name) ? 'CIRCUIT' : /אזורית/.test(name) ? 'REGIONAL' : /ITF|בינלאומ|ATP/.test(name) ? 'INTERNATIONAL' : 'NATIONAL');
const CURRENT_SEASON = 1755;

async function readAppCompetitions(seasonIds) {
  const byTitle = new Map();
  for (const season of seasonIds) for (const [ep, section] of APP_LISTS) {
    let groups = [];
    try { groups = JSON.parse(await get(`${APP_API}/${ep}/38?seasonId=${season}`)); } catch (e) { console.warn('  app list failed', ep, season, String(e.message).slice(0, 60)); continue; }
    for (const g of groups) {
      const title = (g.CompetitionTitle ?? '').trim();
      if (!title || /^(טסט|בדיקה|test)\b/i.test(title)) continue;
      const entry = byTitle.get(title) ?? { title, section, season, categories: [], players: 0 };
      for (const c of g.categoriLIstItem ?? []) if (c.TeamId && !entry.categories.some((x) => x.TeamId === c.TeamId)) entry.categories.push(c);
      entry.players = Math.max(entry.players, g.categoriPlayersNum ?? 0);
      byTitle.set(title, entry);
    }
  }
  return [...byTitle.values()];
}

/** Sorted ISO dates without stragglers: from each end, dates separated from the next by more than 14 days are cut. */
function trimOutliers(dates) {
  const gap = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
  let lo = 0, hi = dates.length - 1;
  while (hi - lo >= 2 && gap(dates[hi - 1], dates[hi]) > 14) hi--;
  while (hi - lo >= 2 && gap(dates[lo], dates[lo + 1]) > 14) lo++;
  return dates.slice(lo, hi + 1);
}

async function mergeAppCompetitions(docs) {
  // --seasons all: every season the app knows (history); default: the current season only
  let seasonIds = [CURRENT_SEASON];
  if (opt('--seasons', 'current') === 'all') {
    try { seasonIds = JSON.parse(await get(`https://loglig.com:8443/api/Leauges/AthleticsSeasons/38`)).map((x) => x.Id); } catch { /* keep current */ }
  }
  const apps = await readAppCompetitions(seasonIds);
  console.log(`\nLoglig app: ${apps.length} competitions`);
  let added = 0, enriched = 0;
  for (const a of apps) {
    if (only.length && !only.some((o) => a.title.includes(o)) && !docs.some((d) => sameCompetition(d.name, a.title))) continue;
    try {
      const doc = docs.find((d) => sameCompetition(d.name, a.title));
      if (doc && daysAgo(doc.end) > recentDays) continue;
      const cats = [], dbls = [];
      for (const c of a.categories) {
        let page = null;
        for (const season of [a.season, CURRENT_SEASON, 1671].filter((x, i, arr) => arr.indexOf(x) === i)) {
          try {
            const p = parseCategoryPage(await get(`https://loglig.com:2053/LeagueTable/SchedulesForTennisCompetition/${c.TeamId}?seasonId=${season}`, 1));
            if (p.matches.length) { page = p; break; }
          } catch { /* the page does not exist for this season (HTTP 500): try the next one */ }
        }
        if (!page) continue;
        if (page.competition && !sameCompetition(page.competition, a.title) && !(doc && sameCompetition(page.competition, doc.name))) continue;
        const dbl = buildDoubles(page, '', c.TeamId);
        if (dbl && !dbls.some((x) => x.source === dbl.source)) dbls.push(dbl);
        const cat = buildCategory(page, '', c.TeamId);
        if (cat && !cats.some((x) => x.name === cat.name)) cats.push(cat);
      }
      if (doc) {
        doc.section = a.section;
        // add the app's draws to the competition page's, one category per Loglig draw page (`source`; the two sites label the same
        // draw differently, "בנים 12 · בית הגמר" / "בנים 12"): the version with more matches wins, the app's on a tie; never fewer than before
        let changed = false;
        for (const cat of cats) {
          let i = doc.categories.findIndex((x) => x.source && x.source === cat.source);
          if (i < 0) i = doc.categories.findIndex((x) => x.name === cat.name);
          if (i < 0) { doc.categories.push(cat); changed = true; } else if (cat.matches.length >= doc.categories[i].matches.length) { doc.categories[i] = cat; changed = true; }
        }
        // the doubles the same way, one per draw page
        doc.doubles = doc.doubles ?? [];
        for (const dbl of dbls) {
          const i = doc.doubles.findIndex((x) => x.source === dbl.source || x.name === dbl.name);
          if (i < 0) { doc.doubles.push(dbl); changed = true; } else if (dbl.matches.length >= doc.doubles[i].matches.length) { doc.doubles[i] = dbl; changed = true; }
        }
        // a name now used twice (two draw pages): keep the larger
        doc.categories = doc.categories.filter((x, k, all) => !all.some((y, j) => j !== k && y.name === x.name && (y.matches.length > x.matches.length || (y.matches.length === x.matches.length && j < k))));
        if (changed) { doc.categories = doc.categories.filter((x) => x.matches.length || !doc.categories.some((y) => y.matches.length)); enriched++; }
        continue;
      }
      // Loglig's empty date (01/01/1753) is not a date; an app-only competition that ended long ago is history, same as on the ita.co.il path
      // one mistyped match date (a month after everything else) must not stretch the competition: dates cut off by a gap of over 14 days are dropped
      const all = trimOutliers([...cats, ...dbls].flatMap((c) => c.matches.map((m) => m.start)).filter((d) => d >= '2000').sort());
      if (!all.length) { console.log(`- app only, no dates yet: ${a.title}`); continue; }
      if (daysAgo(all[all.length - 1].slice(0, 10)) > recentDays) continue;
      docs.push({
        kind: 'competition', name: a.title, start: all[0].slice(0, 10), end: all[all.length - 1].slice(0, 10), feeShekel: 0, level: appLevel(a.title), section: a.section,
        sourceUrl: '', registerUrl: '', registrationCloses: null, isDoubles: false, venues: [], categories: cats, doubles: dbls,
      });
      added++;
      console.log(`- + from the app: ${a.title}  ${cats.length} categories  ${cats.reduce((n, c) => n + c.matches.length, 0)} matches`);
    } catch (e) { console.warn('  app competition failed', a.title, String(e.message).slice(0, 80)); }
  }
  console.log(`Loglig app: ${added} added, ${enriched} enriched with draws\n`);
}

if (listArg === 'all' || args.includes('--app')) await mergeAppCompetitions(docs);
// 4) Masters competitions: their draws, schedules and results live on tournamentsoftware.com (the Israel Masters Tennis Tour), not on Loglig.
//    Each tournament there is matched to its ita.co.il page by city and year, so the name, dates, venue and links stay the ita.co.il ones.
let itaMasters = null; // lazily read: the newest national Masters competitions of ita.co.il, as documents without draws
async function itaMastersIndex() {
  if (itaMasters) return itaMasters;
  itaMasters = [];
  for (const { url } of (await listCompetitions('masters-national')).slice(0, 16)) {
    try {
      const c = parseCompetitionPage(await get(url), url);
      if (c.name && c.start && c.end) itaMasters.push({ kind: 'competition', name: c.name, start: c.start, end: c.end, feeShekel: c.feeShekel, level: 'NATIONAL', section: 'MASTERS', sourceUrl: url, registerUrl: c.registerUrl, registrationCloses: c.registrationCloses ? israelToUtc(c.registrationCloses) : null, isDoubles: false, venues: c.venues, contacts: c.contacts, categories: [], doubles: [] });
    } catch (e) { console.warn('  ita masters page failed', decodeURI(url), String(e.message).slice(0, 60)); }
  }
  return itaMasters;
}

async function mergeTournamentSoftware(docs) {
  const since = Number(opt('--ts-since', 2025));
  const ts = tsSession();
  const org = parseOrgList(await ts.get(ORG_URL)).filter((t) => Number(t.end.slice(0, 4)) >= since && daysAgo(t.end) <= recentDays);
  console.log(`
Tournamentsoftware: ${org.length} Masters tournament(s) since ${since}`);
  let filled = 0;
  for (const t of org) {
    try {
      const same = (n) => sameMasters(t.name, n);
      let doc = docs.find((d) => d.section === 'MASTERS' && same(d.name));
      if (!doc && only.length && !only.some((o) => t.name.includes(o))) continue;
      const data = await readTournament(ts, t.id);
      const { categories, doubles } = buildTsCompetition(data.raw, data.draws);
      // what the hourly refresh (masters-live.mjs) starts from: it then re-reads only the current day
      mkdirSync(path.join(OUT, 'ts-cache'), { recursive: true });
      writeFileSync(path.join(OUT, 'ts-cache', `${t.id}.json`), JSON.stringify({ at: Date.now(), raw: data.raw, draws: data.draws }), 'utf8');
      if (!categories.length && !doubles.length) { console.log(`- no matches yet: ${t.name}`); continue; }
      if (!doc) {
        const ita = (await itaMastersIndex()).find((d) => same(d.name));
        doc = ita ? { ...ita } : { kind: 'competition', name: t.name, start: t.start, end: t.end, feeShekel: 0, level: 'NATIONAL', section: 'MASTERS', sourceUrl: '', registerUrl: '', registrationCloses: null, isDoubles: false, venues: [], contacts: [], categories: [], doubles: [] };
        docs.push(doc);
      }
      doc.section = 'MASTERS';
      doc.categories = categories; doc.doubles = doubles;
      filled++;
      console.log(`- + from tournamentsoftware: ${doc.name} <- ${t.name}  ${categories.length} categories, ${doubles.length} doubles, ${data.raw.length} matches`);
    } catch (e) { console.warn('  tournamentsoftware failed', t.name, String(e.message).slice(0, 80)); }
  }
  console.log(`Tournamentsoftware: ${filled} filled
`);
}

if (listArg === 'all' || args.includes('--ts')) await mergeTournamentSoftware(docs);
writeFileSync(path.join(OUT, 'competitions.json'), JSON.stringify(docs), 'utf8');
console.log(`\nSaved ${docs.length} competition(s) to ${OUT}\\competitions.json`);
if (!push) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }

const base = (opt('--url', env.PUBLIC_URL ?? '')).replace(/\/$/, '');
if (!base || !env.CRON_SECRET) { console.error('--push needs a site URL and CRON_SECRET (env or apps/web/.env.production.local).'); process.exit(1); }
let failed = 0;
for (const d of docs) {
  const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(d) });
  console.log(`push ${d.name}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  if (!res.ok) failed++;
}
// 5) planned competitions from the federation's Gantt (Tennis Europe, ITF, leagues, qualifiers...): after the real ones, so those it covers are skipped
if ((listArg === 'all' || args.includes('--calendar')) && !only.length) {
  try {
    const { readPlanned, pushCalendar } = await import('./calendar.mjs');
    const planned = await readPlanned();
    console.log(`
Gantt: ${planned.length} planned competition(s)`);
    if (!(await pushCalendar(planned, base, env.CRON_SECRET))) failed++;
  } catch (e) { console.warn('  gantt failed', String(e.message).slice(0, 100)); }
}
console.log(failed ? `Done with ${failed} failure(s).` : 'Done.');
process.exit(failed ? 1 : 0);
