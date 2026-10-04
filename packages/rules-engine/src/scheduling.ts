/** Times are integer minutes from the tournament day start (or any epoch). */
export interface SchedMatch {
  id: string;
  players: string[];
  durationMin: number;
  /** "Not before" time. */
  notBefore?: number;
  /** Exact time (and optionally a specific court). Honoured as a hard assignment. */
  exact?: { start: number; courtId?: string };
  /** Match ids that must finish first (previous rounds). */
  after?: string[];
}

export interface Court {
  id: string; // identifying number/name controlled by the tournament manager
  /** Court available from/to (minutes). Defaults to the whole window. */
  from?: number;
  to?: number;
}

export interface Assignment { matchId: string; courtId: string; start: number; end: number }

export interface ScheduleResult {
  assignments: Assignment[];
  unassigned: { matchId: string; reason: string }[];
  conflicts: { matchId: string; reason: string }[];
}

export interface ScheduleOptions {
  windowStart: number;
  windowEnd: number;
  slotMin?: number; // granularity
  restMin?: number; // minimum rest between a player's matches
}

export function scheduleMatches(matches: readonly SchedMatch[], courts: readonly Court[], o: ScheduleOptions): ScheduleResult {
  const slot = o.slotMin ?? 15;
  const rest = o.restMin ?? 0;
  const res: ScheduleResult = { assignments: [], unassigned: [], conflicts: [] };
  const byCourt = new Map<string, Assignment[]>(courts.map((c) => [c.id, []]));
  const playerEnd = new Map<string, Assignment[]>();
  const endOf = new Map<string, number>();

  const courtFree = (c: Court, s: number, e: number): boolean => {
    if (s < Math.max(o.windowStart, c.from ?? -Infinity) || e > Math.min(o.windowEnd, c.to ?? Infinity)) return false;
    return (byCourt.get(c.id) as Assignment[]).every((a) => e <= a.start || s >= a.end);
  };
  const playersFree = (m: SchedMatch, s: number, e: number): boolean =>
    m.players.every((p) => (playerEnd.get(p) ?? []).every((a) => e + rest <= a.start || s >= a.end + rest));

  const commit = (m: SchedMatch, courtId: string, s: number) => {
    const a: Assignment = { matchId: m.id, courtId, start: s, end: s + m.durationMin };
    res.assignments.push(a);
    (byCourt.get(courtId) as Assignment[]).push(a);
    m.players.forEach((p) => playerEnd.set(p, [...(playerEnd.get(p) ?? []), a]));
    endOf.set(m.id, a.end);
  };

  // 1) exact times first (hard constraints), flag conflicts
  const exact = matches.filter((m) => m.exact);
  for (const m of exact) {
    const ex = m.exact as { start: number; courtId?: string };
    const candidates = ex.courtId ? courts.filter((c) => c.id === ex.courtId) : courts;
    if (ex.courtId && candidates.length === 0) { res.conflicts.push({ matchId: m.id, reason: `Court ${ex.courtId} is not allocated to this tournament` }); continue; }
    const s = ex.start;
    const e = s + m.durationMin;
    if (!playersFree(m, s, e)) { res.conflicts.push({ matchId: m.id, reason: 'A player is already scheduled at that time' }); continue; }
    const c = candidates.find((x) => courtFree(x, s, e));
    if (!c) { res.conflicts.push({ matchId: m.id, reason: 'Court is not free at the exact time' }); continue; }
    commit(m, c.id, s);
  }

  // 2) the rest greedily in input order (callers pass matches round by round)
  const rem = matches.filter((m) => !m.exact);
  const pending = rem.slice();
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const m = pending[i] as SchedMatch;
      const deps = (m.after ?? []);
      if (deps.some((d) => !endOf.has(d))) {
        if (deps.some((d) => !matches.find((x) => x.id === d))) { res.unassigned.push({ matchId: m.id, reason: `Unknown dependency` }); pending.splice(i--, 1); progress = true; }
        continue;
      }
      let t = Math.max(o.windowStart, m.notBefore ?? o.windowStart, ...deps.map((d) => endOf.get(d) as number));
      t = Math.ceil((t - o.windowStart) / slot) * slot + o.windowStart;
      let placed = false;
      for (; t + m.durationMin <= o.windowEnd && !placed; t += slot) {
        if (!playersFree(m, t, t + m.durationMin)) continue;
        const c = courts.find((x) => courtFree(x, t, t + m.durationMin));
        if (c) { commit(m, c.id, t); placed = true; }
      }
      pending.splice(i--, 1);
      progress = true;
      if (!placed) res.unassigned.push({ matchId: m.id, reason: 'No free court within the time window' });
    }
  }
  pending.forEach((m) => res.unassigned.push({ matchId: m.id, reason: 'Waiting on an unscheduled earlier match' }));
  res.assignments.sort((a, b) => a.start - b.start || a.courtId.localeCompare(b.courtId));
  return res;
}
