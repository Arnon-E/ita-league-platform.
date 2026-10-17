// Fresh draws, schedules and results for the competitions that are on right now. Light enough to run every 10-20 minutes:
// it reads only the competitions the site still lists as not finished (a handful), finds their categories in the Loglig app's own list
// and reads just those categories' public draw pages. Only matches and results are updated; the tournament's fee, venue, links and
// registration deadline are left alone (resultsOnly).
//
//   node scripts/loglig-sync/live-results.mjs --url <site>            # dry run: reads Loglig, sends nothing
//   node scripts/loglig-sync/live-results.mjs --push --url <site>
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCategory, parseCategoryPage } from './parse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://loglig.com:8443/api';
const UNION = 38;
const SEASON = 1755;
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };
const site = (opt('--url', env.PUBLIC_URL || '') || '').replace(/\/$/, '');
if (!site) throw new Error('pass --url <site> (or PUBLIC_URL in .env.production.local)');
const push = args.includes('--push');
if (push && !env.CRON_SECRET) throw new Error('CRON_SECRET missing');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, fallback) {
  await sleep(300);
  try { const r = await fetch(url, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}
async function getText(url) {
  await sleep(300);
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}
const norm = (s) => String(s).replace(/מס[׳'’]?\.?\s/g, ' ').replace(/["'`׳״.,\-–]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const live = (await getJson(`${site}/api/v1/tournaments`, [])).filter((t) => !['FINISHED', 'CANCELLED'].includes(t.status));
console.log(`${live.length} tournaments on the site that are not finished`);
if (!live.length) process.exit(0);
const byName = new Map(live.map((t) => [norm(t.name), t]));

const lists = [];
for (const ep of ['CompetitionsYouth', 'CompetitionsSenior', 'CompetitionsAdult', 'CompetitionsDaily']) lists.push(...(await getJson(`${API}/Union/${ep}/${UNION}?seasonId=${SEASON}`, [])));

let sent = 0;
for (const c of lists) {
  const t = byName.get(norm(c.CompetitionTitle));
  if (!t) continue;
  const categories = [];
  for (const k of c.categoriLIstItem ?? []) {
    try {
      const page = parseCategoryPage(await getText(`https://loglig.com:2053/LeagueTable/SchedulesForTennisCompetition/${k.TeamId}?seasonId=${SEASON}`));
      if (!page.matches.length) continue;
      if (page.competition && norm(page.competition) !== norm(c.CompetitionTitle) && !norm(page.competition).includes(norm(c.CompetitionTitle)) && !norm(c.CompetitionTitle).includes(norm(page.competition))) continue;
      const cat = buildCategory(page, '', k.TeamId);
      if (cat && !categories.some((x) => x.name === cat.name)) categories.push(cat);
    } catch { /* a category without a published page yet */ }
  }
  const matches = categories.reduce((n, k) => n + k.matches.length, 0);
  console.log(`${t.name}: ${categories.length} categories with draws, ${matches} matches`);
  if (!categories.length) continue;
  const doc = { kind: 'competition', resultsOnly: true, name: t.name, start: String(t.startDate).slice(0, 10), end: String(t.endDate).slice(0, 10), feeShekel: 0, level: 'NATIONAL', venues: [], categories };
  if (!push) continue;
  const res = await fetch(`${site}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(doc) });
  console.log(res.status, (await res.text()).slice(0, 200));
  sent++;
}
console.log(push ? `sent ${sent} competition(s)` : 'dry run: nothing sent (use --push)');
