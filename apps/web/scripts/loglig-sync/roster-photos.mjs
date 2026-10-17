// Photos and Loglig user ids for players who are in no ranking, from the rosters of ALL competitions (finished ones too).
// Finished competitions' rosters are only partly complete on Loglig, so nothing is created from them: each roster player is matched
// to someone the site already knows and only the photo and user id are filled in.
//
//   node scripts/loglig-sync/roster-photos.mjs --url <site>            # dry run: reads Loglig, sends nothing
//   node scripts/loglig-sync/roster-photos.mjs --push --url <site>
// About 600 requests at ~0.4 s each. Run it now and then (monthly is plenty), not daily.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
async function get(url, fallback) {
  await sleep(400);
  try { const r = await fetch(url, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}

const lists = [];
for (const ep of ['CompetitionsYouth', 'CompetitionsSenior', 'CompetitionsAdult', 'CompetitionsDaily']) lists.push(...(await get(`${API}/Union/${ep}/${UNION}?seasonId=${SEASON}`, [])));
console.log(`${lists.length} competitions`);
const total = { seen: 0, matched: 0, updated: 0, ambiguous: 0, unknown: 0 };
for (const c of lists) {
  const cats = [];
  for (const k of c.categoriLIstItem ?? []) {
    const roster = await get(`${API}/NewUnion/GetTeamRoster/${k.Id}/${k.TeamId}`, { Players: [] });
    const players = (roster.Players ?? []).map((p) => ({ userId: p.UserId, name: String(p.FullName ?? '').trim(), image: p.ProfileImage || null })).filter((p) => p.userId && p.name && p.image);
    if (players.length) cats.push({ teamId: k.TeamId, title: k.Title, players });
  }
  if (!cats.length) continue;
  if (!push) { console.log(`${cats.reduce((n, k) => n + k.players.length, 0)} players with a photo in ${cats.length} categories`); continue; }
  const res = await fetch(`${site}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify({ kind: 'roster-photos', competitions: [{ id: c.categoriLIstItem?.[0]?.Id ?? 0, title: c.CompetitionTitle, start: '2026-01-01', categories: cats }] }) });
  const j = await res.json().catch(() => ({}));
  for (const k of Object.keys(total)) total[k] += Number(j[k]) || 0;
  console.log(res.status, JSON.stringify(j));
}
console.log(push ? `total: ${JSON.stringify(total)}` : 'dry run: nothing sent (use --push)');
