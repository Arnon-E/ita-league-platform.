import { sql } from 'drizzle-orm';
import type { Db } from '@/db';

export interface LeagueStanding {
  rank: number; team: string; played: number; points: number; wins: number; losses: number; draws: number;
  setsFor: number; setsAgainst: number; gamesFor: number; gamesAgainst: number;
}
export interface LeagueMatch {
  done: boolean; venue: string; group: string; start: string | null;
  home: { team: string; club: string }; away: { team: string; club: string }; homeScore: number | null; awayScore: number | null;
}
export interface LeagueData {
  groups: { name: string; standings: LeagueStanding[] }[];
  rounds: { name: string; matches: LeagueMatch[] }[];
}
export interface LeagueImport { kind: 'league'; id: string; name: string; gender: 'MALE' | 'FEMALE' | 'OPEN'; data: LeagueData }

const s = (x: unknown, n = 160) => (typeof x === 'string' ? x.trim().slice(0, n) : '');
const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);

export function validateLeagueImport(x: unknown): LeagueImport {
  const b = x as Partial<LeagueImport> | null;
  if (!b || b.kind !== 'league' || !/^\d{1,10}$/.test(String(b.id)) || !s(b.name)) throw new Error('bad payload');
  const d = (b.data ?? {}) as Partial<LeagueData>;
  const groups = (Array.isArray(d.groups) ? d.groups : []).slice(0, 20).map((g) => ({
    name: s(g?.name, 120),
    standings: (Array.isArray(g?.standings) ? g.standings : []).slice(0, 40).map((r) => ({
      rank: n(r.rank), team: s(r.team), played: n(r.played), points: n(r.points), wins: n(r.wins), losses: n(r.losses), draws: n(r.draws),
      setsFor: n(r.setsFor), setsAgainst: n(r.setsAgainst), gamesFor: n(r.gamesFor), gamesAgainst: n(r.gamesAgainst),
    })).filter((r) => r.team),
  }));
  const rounds = (Array.isArray(d.rounds) ? d.rounds : []).slice(0, 60).map((r) => ({
    name: s(r?.name, 80),
    matches: (Array.isArray(r?.matches) ? r.matches : []).slice(0, 60).map((m) => ({
      done: !!m.done, venue: s(m.venue), group: s(m.group), start: typeof m.start === 'string' && !Number.isNaN(Date.parse(m.start)) ? m.start : null,
      home: { team: s(m.home?.team), club: s(m.home?.club) }, away: { team: s(m.away?.team), club: s(m.away?.club) },
      homeScore: m.homeScore == null ? null : n(m.homeScore), awayScore: m.awayScore == null ? null : n(m.awayScore),
    })).filter((m) => m.home.team && m.away.team),
  }));
  return { kind: 'league', id: String(b.id), name: s(b.name), gender: b.gender === 'FEMALE' ? 'FEMALE' : b.gender === 'MALE' ? 'MALE' : 'OPEN', data: { groups, rounds } };
}

/** Stores (or refreshes) one league document. Idempotent: the same id is replaced. */
export async function importLeague(db: Db, input: LeagueImport) {
  await db.execute(sql`
    insert into external_leagues (id, name, gender, data, updated_at)
    values (${input.id}, ${input.name}, ${input.gender}::gender, ${JSON.stringify(input.data)}::jsonb, now())
    on conflict (id) do update set name = excluded.name, gender = excluded.gender, data = excluded.data, updated_at = now()`);
  return { league: input.name, groups: input.data.groups.length, rounds: input.data.rounds.length, matches: input.data.rounds.reduce((a, r) => a + r.matches.length, 0) };
}
