// Who is registered in each category of the competitions that have not finished yet, from the same public Loglig endpoints the
// Android app uses (no login): Union/Competitions*/38 lists competitions and categories, NewUnion/GetTeamRoster/<competition>/<category>
// lists the registered players (user id, name, photo file).
//
//   node scripts/loglig-sync/rosters.mjs                          # dry run, saves .loglig-dump/rosters.json
//   node scripts/loglig-sync/rosters.mjs --push --url <site>
//
// Only competitions that exist as not-finished tournaments on the site are read, so it stays a handful of requests.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../.loglig-dump');
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, fallback) {
  await sleep(400);
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}
// the same squeeze the site uses to line up "סבב זוגות מס' 2 2026" (ITA) with "סבב זוגות 2 2026" (Loglig)
const norm = (s) => String(s).replace(/מס[׳'’]?\.?\s/g, ' ').replace(/["'`׳״.,\-–]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

const ours = (await get(`${site}/api/v1/tournaments`, [])).filter((t) => !['FINISHED', 'CANCELLED'].includes(t.status));
console.log(`${ours.length} tournaments on the site that are not finished`);
const byName = new Map(ours.map((t) => [norm(t.name), t]));

const lists = [];
for (const ep of ['CompetitionsYouth', 'CompetitionsSenior', 'CompetitionsAdult', 'CompetitionsDaily']) lists.push(...(await get(`${API}/Union/${ep}/${UNION}?seasonId=${SEASON}`, [])));

const competitions = [];
for (const c of lists) {
  const t = byName.get(norm(c.CompetitionTitle));
  if (!t) continue;
  const cats = [];
  for (const k of c.categoriLIstItem ?? []) {
    const roster = await get(`${API}/NewUnion/GetTeamRoster/${k.Id}/${k.TeamId}`, { Players: [] });
    cats.push({
      teamId: k.TeamId, title: k.Title,
      players: (roster.Players ?? []).map((p) => ({ userId: p.UserId, name: String(p.FullName ?? '').trim(), image: p.ProfileImage || null })).filter((p) => p.userId && p.name),
    });
  }
  competitions.push({ id: c.categoriLIstItem?.[0]?.Id ?? 0, title: c.CompetitionTitle, start: String(t.startDate).slice(0, 10), categories: cats });
  console.log(`${c.CompetitionTitle}: ${cats.map((k) => `${k.title.split(' - ').pop()} ${k.players.length}`).join(', ')}`);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, 'rosters.json'), JSON.stringify({ kind: 'rosters', competitions }, null, 1));
if (!args.includes('--push')) { console.log('dry run: saved .loglig-dump/rosters.json (use --push to send)'); process.exit(0); }
if (!env.CRON_SECRET) throw new Error('CRON_SECRET missing');
for (const comp of competitions) {
  const res = await fetch(`${site}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify({ kind: 'rosters', competitions: [comp] }) });
  console.log(comp.title, res.status, (await res.text()).slice(0, 300));
}
