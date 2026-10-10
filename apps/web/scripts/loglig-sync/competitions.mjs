// Mirrors public ITA youth competitions (details, categories, players, matches, results) into this app. No login.
//
//   node scripts/loglig-sync/competitions.mjs                       # latest 3 national competitions, dry run (saves JSON only)
//   node scripts/loglig-sync/competitions.mjs --limit 10            # more
//   node scripts/loglig-sync/competitions.mjs --all                 # everything listed
//   node scripts/loglig-sync/competitions.mjs --list regional       # national | regional | <full listing url>
//   node scripts/loglig-sync/competitions.mjs --push --url http://localhost:3100   # send to a site (CRON_SECRET from env / .env.production.local)
//
// Read-only against ita.co.il and loglig.com: plain GETs, ~1 request/second.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ageOf, genderOf, israelToUtc, koRound, parseCategoryPage, parseCompetitionPage } from './parse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../.loglig-dump');
const LISTS = { national: 'https://ita.co.il/' + encodeURI('תחרויות-נוער-ארציות') + '/', regional: 'https://ita.co.il/' + encodeURI('תחרויות-נוער-אזוריות') + '/' };

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const push = args.includes('--push');
const limit = args.includes('--all') ? Infinity : Number(opt('--limit', 3));
const listArg = opt('--list', 'national');
const listUrl = LISTS[listArg] ?? listArg;
const level = listArg === 'regional' ? 'REGIONAL' : 'NATIONAL';

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  await sleep(900);
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

// 1) which competitions exist
async function listCompetitions() {
  const found = [];
  for (let page = 1; page <= 15; page++) {
    const html = await get(page === 1 ? listUrl : `${listUrl}?jsf=jet-engine&pagenum=${page}`);
    const links = [...new Set([...html.matchAll(/href="(https:\/\/ita\.co\.il\/competitions\/[^"#?]+\/?)"/g)].map((m) => m[1]))];
    const fresh = links.filter((l) => !found.includes(l));
    if (!fresh.length) break;
    found.push(...fresh);
    if (found.length >= limit) break;
  }
  return found.slice(0, limit);
}

// 2) one competition -> normalized document
async function readCompetition(url) {
  const c = parseCompetitionPage(await get(url), url);
  if (c.isDoubles) return { skipped: 'doubles', name: c.name, url };
  if (!c.start || !c.end) return { skipped: 'no dates', name: c.name, url };
  const cats = [];
  for (const ref of c.categories) {
    const page = parseCategoryPage(await get(`https://loglig.com:2053/LeagueTable/SchedulesForTennisCompetition/${ref.id}?seasonId=${ref.seasonId}`));
    if (!page.matches.length) continue;
    const label = ref.section === 'qualifying' ? 'מוקדמות' : ref.section === 'finals' ? 'בית הגמר' : '';
    const name = label && !page.category.includes(label) ? `${page.category} · ${label}` : page.category;
    const hasGroups = page.matches.some((m) => /^בית\s*\d/.test(m.stage));
    // knockout depth: final = 0; classification matches (place > 1) sit in the round of their size
    const ko = page.matches.filter((m) => !/^בית\s*\d/.test(m.stage)).map((m) => koRound(m.slot)).filter(Boolean);
    const maxDepth = ko.length ? Math.max(...ko.map((k) => k.depthFromFinal)) : 0;
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
  return { kind: 'competition', name: c.name, start: c.start, end: c.end, feeShekel: c.feeShekel, level, sourceUrl: url, venues: c.venues, categories: cats };
}

mkdirSync(OUT, { recursive: true });
console.log('Listing competitions from', decodeURI(listUrl));
const urls = await listCompetitions();
console.log(`${urls.length} competition(s)\n`);

const docs = [];
for (const url of urls) {
  try {
    const d = await readCompetition(url);
    if (d.skipped) { console.log(`- skipped (${d.skipped}): ${d.name}`); continue; }
    const matchCount = d.categories.reduce((n, c) => n + c.matches.length, 0);
    const players = new Set(d.categories.flatMap((c) => c.matches.flatMap((m) => [m.a.name, m.b.name])));
    console.log(`- ${d.name}  ${d.start}..${d.end}  fee ${d.feeShekel}  ${d.categories.length} categories  ${matchCount} matches  ${players.size} players`);
    docs.push(d);
  } catch (e) { console.warn('  failed', decodeURI(url), String(e.message).slice(0, 80)); }
}
writeFileSync(path.join(OUT, 'competitions.json'), JSON.stringify(docs), 'utf8');
console.log(`\nSaved ${docs.length} competition(s) to ${OUT}\\competitions.json`);
if (!push) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }

const base = (opt('--url', env.PUBLIC_URL ?? '')).replace(/\/$/, '');
if (!base || !env.CRON_SECRET) { console.error('--push needs a site URL and CRON_SECRET (env or apps/web/.env.production.local).'); process.exit(1); }
for (const d of docs) {
  const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(d) });
  console.log(`push ${d.name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  if (!res.ok) process.exit(1);
}
console.log('Done.');
