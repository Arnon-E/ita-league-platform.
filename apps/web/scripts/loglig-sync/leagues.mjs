// Mirrors the adult team leagues (Winner league men / women): standings per group and every fixture with its score. No login.
//
//   node scripts/loglig-sync/leagues.mjs                                  # dry run, saves .loglig-dump/leagues.json
//   node scripts/loglig-sync/leagues.mjs --push --url http://localhost:3100
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { israelToUtc } from './parse.mjs';
import { parseLeagueDetails, parseLeagueSchedule } from './leagues-parse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../.loglig-dump');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const LEAGUES = [{ id: '14352', gender: 'MALE' }, { id: '14355', gender: 'FEMALE' }];
const SEASON = 1755;

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };
const get = async (url) => {
  await new Promise((r) => setTimeout(r, 700));
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};

mkdirSync(OUT, { recursive: true });
const docs = [];
for (const l of LEAGUES) {
  const d = parseLeagueDetails(await get(`https://loglig.com:2053/LeagueTable/TennisLeagueDetails?id=${l.id}&seasonId=${SEASON}`));
  const rounds = parseLeagueSchedule(await get(`https://loglig.com:2053/LeagueTable/Schedules/${l.id}?seasonId=${SEASON}`))
    .map((r) => ({ ...r, matches: r.matches.map((m) => ({ ...m, start: m.start ? israelToUtc(m.start) : null })) }));
  const doc = { kind: 'league', id: l.id, name: d.name || `ליגת ווינר ${l.gender === 'MALE' ? 'גברים' : 'נשים'}`, gender: l.gender, data: { groups: d.groups, rounds } };
  console.log(`- ${doc.name}: ${d.groups.length} groups, ${d.groups.reduce((n, g) => n + g.standings.length, 0)} teams, ${rounds.reduce((n, r) => n + r.matches.length, 0)} matches`);
  docs.push(doc);
}
writeFileSync(path.join(OUT, 'leagues.json'), JSON.stringify(docs), 'utf8');
if (!args.includes('--push')) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }

const base = opt('--url', env.PUBLIC_URL ?? '').replace(/\/$/, '');
if (!base || !env.CRON_SECRET) { console.error('--push needs a site URL and CRON_SECRET.'); process.exit(1); }
let failed = 0;
for (const d of docs) {
  const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(d) });
  console.log(`push ${d.name}: ${res.status} ${(await res.text()).slice(0, 160)}`);
  if (!res.ok) failed++;
}
process.exit(failed ? 1 : 0);
