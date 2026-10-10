// Parsing helpers for the team leagues (Winner league): standings tables and the fixtures list. Pure functions, no network.
import { strip } from './parse.mjs';

const rowsOf = (tableHtml) => (tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? []).map((tr) => (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(strip));
const num = (x) => { const n = Number(String(x ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };

/** Team league "table" page -> { name, groups: [{ name, standings[] }] } (the cross-tables of results are skipped). */
export function parseLeagueDetails(html) {
  const heads = [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)].map((m) => strip(m[1])).filter(Boolean);
  const name = (heads.find((h) => /טבלת דירוג/.test(h)) ?? '').replace(/\s*-\s*טבלת דירוג.*$/, '');
  const names = heads.filter((h) => !/טבלת דירוג|^שלב/.test(h));
  const groups = [];
  for (const t of html.match(/<table[\s\S]*?<\/table>/gi) ?? []) {
    const rows = rowsOf(t);
    if (!rows[0]?.some((c) => c.includes('שם קבוצה'))) continue;
    groups.push({
      name: names[groups.length] ?? `בית ${groups.length + 1}`,
      standings: rows.slice(1).filter((r) => r.length >= 10).map((r) => ({
        rank: num(r[0]), team: r[1], played: num(r[2]), points: num(r[3]), wins: num(r[4]), losses: num(r[5]), draws: num(r[6]),
        setsFor: num(r[7]), setsAgainst: num(r[8]), gamesFor: num(r[9]), gamesAgainst: num(r[10]),
      })),
    });
  }
  return { name, groups };
}

const teamOf = (cell) => {
  const m = (cell ?? '').match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  return m ? { team: m[1].trim(), club: m[2].trim() } : { team: (cell ?? '').trim(), club: '' };
};

/** Team league "schedule" page -> rounds[{ name, matches[] }]; a team match's score is the number of individual matches won. */
export function parseLeagueSchedule(html) {
  const rounds = [];
  for (const r of rowsOf(html)) {
    if (r.length <= 3 && r[0]) { rounds.push({ name: r[0], matches: [] }); continue; }
    if (r.length < 11 || !rounds.length) continue;
    const when = (r[4] ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    const home = teamOf(r[6]), away = teamOf(r[10]);
    if (!home.team || !away.team) continue;
    rounds[rounds.length - 1].matches.push({
      done: r[0] === 'נגמר', venue: r[1], group: r[2], start: when ? `${when[3]}-${when[2]}-${when[1]}T${when[4]}:${when[5]}` : null,
      home, away, homeScore: r[7] === '' ? null : num(r[7]), awayScore: r[8] === '' ? null : num(r[8]),
    });
  }
  return rounds.filter((x) => x.matches.length);
}
