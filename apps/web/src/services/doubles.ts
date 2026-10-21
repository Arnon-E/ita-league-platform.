type SetScore = { a: number; b: number; superTb?: boolean };
export interface DoublesRow { id: string; category: string; stage: string; groupName: string | null; status: string; aName: string; bName: string; sets: unknown; winner: string | null }
export interface DoublesStanding { pair: string; played: number; wins: number; losses: number; setsFor: number; setsAgainst: number; gamesFor: number; gamesAgainst: number; rank: number }
export interface DoublesTable { category: string; group: string; rows: DoublesStanding[] }

/**
 * Group tables of the doubles draws: every pair of a group listed (even before a ball is hit), ranked by wins, then set and game
 * difference. Only matches with a winner count, like the singles tables.
 */
export function doublesTables(ms: DoublesRow[]): DoublesTable[] {
  const groups = new Map<string, DoublesRow[]>();
  for (const m of ms) if (m.stage === 'GROUP') {
    const k = `${m.category}\u0000${m.groupName ?? 'בית 1'}`;
    const l = groups.get(k); if (l) l.push(m); else groups.set(k, [m]);
  }
  const tables: DoublesTable[] = [];
  for (const [k, list] of groups) {
    const [category, group] = k.split('\u0000') as [string, string];
    const by = new Map<string, Omit<DoublesStanding, 'rank'>>();
    const row = (pair: string) => { let r = by.get(pair); if (!r) by.set(pair, r = { pair, played: 0, wins: 0, losses: 0, setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0 }); return r; };
    for (const m of list) {
      const a = row(m.aName), b = row(m.bName);
      if (!m.winner || m.status === 'VOID' || m.status === 'SCHEDULED') continue;
      const sets = (m.sets as SetScore[]) ?? [];
      const sa = sets.filter((s) => s.a > s.b).length, sb = sets.filter((s) => s.b > s.a).length;
      const ga = sets.reduce((n, s) => n + (s.superTb ? Number(s.a > s.b) : s.a), 0), gb = sets.reduce((n, s) => n + (s.superTb ? Number(s.b > s.a) : s.b), 0);
      a.played++; b.played++;
      if (m.winner === 'a') { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
      a.setsFor += sa; a.setsAgainst += sb; b.setsFor += sb; b.setsAgainst += sa;
      a.gamesFor += ga; a.gamesAgainst += gb; b.gamesFor += gb; b.gamesAgainst += ga;
    }
    const sorted = [...by.values()].sort((x, y) => y.wins - x.wins || (y.setsFor - y.setsAgainst) - (x.setsFor - x.setsAgainst) || (y.gamesFor - y.gamesAgainst) - (x.gamesFor - x.gamesAgainst) || x.pair.localeCompare(y.pair, 'he'));
    tables.push({ category, group, rows: sorted.map((r, i) => ({ ...r, rank: i + 1 })) });
  }
  return tables.sort((x, y) => x.category.localeCompare(y.category, 'he') || x.group.localeCompare(y.group, 'he', { numeric: true }));
}
