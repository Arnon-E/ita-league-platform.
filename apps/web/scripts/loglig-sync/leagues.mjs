// Mirrors every team league the Loglig app lists (adult leagues, youth leagues, Winner league, champions, Final 4):
// standings per group (public table page) and every fixture with its score and the individual matches of each tie (app API). No login.
//
//   node scripts/loglig-sync/leagues.mjs                                  # dry run, saves .loglig-dump/leagues.json
//   node scripts/loglig-sync/leagues.mjs --push --url http://localhost:3100
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { israelToUtc } from './parse.mjs';
import { parseLeagueDetails, parseLeagueSchedule } from './leagues-parse.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.LOGLIG_DUMP_DIR ? path.resolve(process.env.LOGLIG_DUMP_DIR) : path.resolve(here, '../../.loglig-dump'); // LOGLIG_DUMP_DIR: where the development syncs keep their data
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const API = 'https://loglig.com:8443/api';
const SEASON = 1755;

function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
}
const env = { ...loadEnv(path.resolve(here, '../../.env.production.local')), ...process.env };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getText(url) {
  await sleep(500);
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (ITA data mirror, read-only)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}
const getJson = async (p, fallback) => { try { return JSON.parse(await getText(`${API}/${p}`)); } catch (e) { if (fallback !== undefined) return fallback; throw e; } };

const genderOf = (t) => (/נשים|נערות|ילדות/.test(t) ? 'FEMALE' : /גברים|נערים|ילדים/.test(t) ? 'MALE' : 'OPEN');
const localIso = (s) => (s ? israelToUtc(String(s).slice(0, 16)) : null);

/** App games -> rounds (one per round number, with the individual matches of each tie). */
function roundsFromApi(games, clubOf) {
  const stages = new Set(games.map((g) => g.StageNameHeb ?? g.StageName));
  const byKey = new Map();
  for (const g of games) {
    const stage = g.StageNameHeb ?? g.StageName ?? '';
    const key = `${stage}|${g.RoundNum}`;
    if (!byKey.has(key)) byKey.set(key, { name: stages.size > 1 ? `${stage} · מחזור ${g.RoundNum}` : `מחזור ${g.RoundNum}`, order: (stage || '') + String(g.RoundNum).padStart(3, '0'), matches: [] });
    const ended = g.GameStatus === 'ended' || g.TechnicalWinnerId != null;
    byKey.get(key).matches.push({
      done: ended, venue: g.AuditoriumName ?? '', group: g.GroupName ?? '', start: localIso(g.StartDate),
      home: { team: g.HomeTeamName ?? '', club: clubOf.get(g.HomeTeamId) ?? '' }, away: { team: g.GuestTeamName ?? '', club: clubOf.get(g.GuestTeamId) ?? '' },
      homeScore: ended ? g.HomeTeamScore ?? 0 : null, awayScore: ended ? g.GuestTeamScore ?? 0 : null,
      rubbers: (g.TennisLeagueGamesInfo ?? []).map((x) => {
        const pair = !!(x.HomePairPlayerName || x.GuestPairPlayerName);
        return {
          n: x.GameNumber, doubles: pair,
          home: [x.HomePlayerName, x.HomePairPlayerName].filter(Boolean), away: [x.GuestPlayerName, x.GuestPairPlayerName].filter(Boolean),
          sets: (x.Scores ?? []).filter((s) => s.HomeScore || s.GuestScore).map((s) => ({ h: s.HomeScore, g: s.GuestScore, tb: !!s.IsTieBreak })),
          winner: x.WinnerId == null && x.WinnerPairId == null ? null : (x.WinnerId === x.HomePlayerId || x.WinnerPairId === x.HomePairPlayerId) ? 'home' : 'away',
          done: !!x.IsEnded,
        };
      }),
    });
  }
  return [...byKey.values()].sort((a, b) => a.order.localeCompare(b.order)).map(({ name, matches }) => ({ name, matches: matches.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '')) }));
}

mkdirSync(OUT, { recursive: true });
const list = await getJson('Union/LeaguesList/38');
const docs = [];
for (const l of list) {
  try {
    const details = parseLeagueDetails(await getText(`https://loglig.com:2053/LeagueTable/TennisLeagueDetails?id=${l.Id}&seasonId=${SEASON}`));
    const teams = await getJson(`NewUnion/GetTennisLeagueTeams/${l.Id}`, []);
    const clubOf = new Map(teams.map((t) => [t.TeamId, t.ClubName]));
    const ev = await getJson(`NewUnion/GetLeagueGamesEvents/${l.Id}`, { Games: [] });
    let rounds = roundsFromApi(ev.Games ?? [], clubOf);
    if (!rounds.length) {
      rounds = parseLeagueSchedule(await getText(`https://loglig.com:2053/LeagueTable/Schedules/${l.Id}?seasonId=${SEASON}`))
        .map((r) => ({ ...r, matches: r.matches.map((m) => ({ ...m, start: m.start ? israelToUtc(m.start) : null })) }));
    }
    // knockout-only leagues (champions, Final 4) have no standings page: list the teams as one group so they are still visible
    const groups = details.groups.length ? details.groups
      : teams.length ? [{ name: l.Title, standings: teams.map((t, i) => ({ rank: i + 1, team: t.TeamName, played: 0, points: 0, wins: 0, losses: 0, draws: 0, setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0 })) }] : [];
    const matches = rounds.reduce((n, r) => n + r.matches.length, 0);
    console.log(`- ${l.Title}: ${groups.length} groups, ${groups.reduce((n, g) => n + g.standings.length, 0)} teams, ${matches} matches`);
    docs.push({ kind: 'league', id: String(l.Id), name: l.Title, gender: genderOf(l.Title), data: { groups, rounds } });
  } catch (e) { console.warn(`  failed ${l.Id} ${l.Title}: ${String(e.message).slice(0, 80)}`); }
}
writeFileSync(path.join(OUT, 'leagues.json'), JSON.stringify(docs), 'utf8');
if (!args.includes('--push')) { console.log('Dry run (nothing sent). Add --push --url <site> to import.'); process.exit(0); }

const base = opt('--url', env.PUBLIC_URL ?? '').replace(/\/$/, '');
if (!base || !env.CRON_SECRET) { console.error('--push needs a site URL and CRON_SECRET.'); process.exit(1); }
let failed = 0;
for (const d of docs) {
  const res = await fetch(`${base}/api/sync/loglig`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.CRON_SECRET}` }, body: JSON.stringify(d) });
  console.log(`push ${d.name}: ${res.status} ${(await res.text()).slice(0, 100)}`);
  if (!res.ok) failed++;
}
process.exit(failed ? 1 : 0);
