// Mirrors public ITA youth competitions (details, categories, players, matches, results) into this app. No login.
//
//   node scripts/loglig-sync/competitions.mjs                       # latest 3 national competitions, dry run (saves JSON only)
//   node scripts/loglig-sync/competitions.mjs --limit 10            # more
//   node scripts/loglig-sync/competitions.mjs --all                 # everything listed
//   node scripts/loglig-sync/competitions.mjs --list national,regional,seniors --all --recent 30
//                                                                   # several listings; --recent N = skip competitions that ended more than N days ago
//   node scripts/loglig-sync/competitions.mjs --push --url http://localhost:3100   # send to a site (CRON_SECRET from env / .env.production.local)
//
// Read-only against ita.co.il and loglig.com: plain GETs, ~1 request/second.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ageOf, genderOf, israelToUtc, koRound, parseCategoryPage, parseCompetitionPage } from './parse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../.loglig-dump');
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
  if (x.includes(y) || y.includes(x)) return true;
  const toks = (t) => new Set(t.split(' ').filter(Boolean));
  const tx = toks(x), ty = toks(y);
  const nums = (t) => [...t].filter((w) => /^\d+$/.test(w)).sort().join(',');
  if (nums(tx) && nums(ty) && nums(tx) !== nums(ty)) return false;
  return [...tx].filter((w) => ty.has(w) && w.length >= 3 && !GENERIC.has(w) && !/^\d+$/.test(w)).length >= 2;
}

// 2) one competition -> normalized document (draws and results when published, otherwise the planned categories)
async function readCompetition({ url, list }) {
  const c = parseCompetitionPage(await get(url), url);
  if (!c.start || !c.end) return { skipped: 'no dates', name: c.name, url };
  if (daysAgo(c.end) > recentDays) return { skipped: 'finished long ago', name: c.name, url };
  const cats = [];
  if (!c.isDoubles) {
    for (const ref of c.categories) {
      const page = parseCategoryPage(await get(`https://loglig.com:2053/LeagueTable/SchedulesForTennisCompetition/${ref.id}?seasonId=${ref.seasonId}`));
      if (!page.matches.length) continue;
      // some competition pages still embed another competition's draws: keep only pages that belong to this one
      if (page.competition && !sameCompetition(page.competition, c.name)) continue;
      const label = ref.section === 'qualifying' ? 'מוקדמות' : ref.section === 'finals' ? 'בית הגמר' : '';
      const name = label && !page.category.includes(label) ? `${page.category} · ${label}` : page.category;
      const hasGroups = page.matches.some((m) => /^בית\s*\d/.test(m.stage));
      // knockout depth: final = 0; classification matches (place > 1) sit in the round of their size
      const ko = page.matches.filter((m) => !/^בית\s*\d/.test(m.stage)).map((m) => koRound(m.slot)).filter(Boolean);
      const maxDepth = ko.length ? Math.max(...ko.map((k) => k.depthFromFinal)) : 0;
      page.matches = page.matches.filter((m) => !m.a.name.includes('/') && !m.b.name.includes('/')); // doubles pairs are not players
      if (!page.matches.length) continue;
      const matches = page.matches.map((m, i) => {
        const group = (m.stage.match(/^בית\s*(\d+)/) ?? [])[1];
        const k = group ? null : koRound(m.slot);
        return {
          stage: group ? 'GROUP' : 'KO', group: group ? `בית ${group}` : undefined,
          round: group ? 1 : k ? maxDepth - k.depthFromFinal + 1 : 1, place: k?.place ?? 1, size: k?.size ?? 0, order: i,
          start: israelToUtc(m.start), kind: m.kind, venue: m.venue, done: m.done,
          a: m.a, b: m.b, sets: m.sets, retired: m.retired, walkover: m.walkover,
        };
      });
      cats.push({ name, source: ref.id, gender: genderOf(page.category), age: ageOf(page.category), format: hasGroups ? 'GROUPS_KNOCKOUT' : 'KNOCKOUT', matches });
    }
  }
  if (!cats.length) for (const p of c.planned) cats.push({ name: p.name, source: '', gender: p.gender, age: p.age, format: 'KNOCKOUT', matches: [] });
  return {
    kind: 'competition', name: c.name, start: c.start, end: c.end, feeShekel: c.feeShekel, level: levelOf(list, c.name), section: LISTS[list]?.section ?? 'YOUTH', sourceUrl: url,
    registerUrl: c.registerUrl, registrationCloses: c.registrationCloses ? israelToUtc(c.registrationCloses) : null,
    doubles: c.isDoubles, venues: c.venues, categories: cats,
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
console.log(failed ? `Done with ${failed} failure(s).` : 'Done.');
process.exit(failed ? 1 : 0);
