export interface ResultPoints {
  playerId: string;
  tournamentId: string;
  date: Date;
  points: number;
  /** e.g. 0.65 for age 14; applied to the base points. */
  multiplier?: number;
  kind: 'singles' | 'doubles';
}

export interface RankingRow {
  playerId: string;
  points: number;
  counted: ResultPoints[];
  rank: number;
}

export interface RankingOptions {
  asOf: Date;
  windowWeeks: number;
  bestSingles: number;
  bestDoubles: number;
  /** Deducted points per player (disciplinary penalties). */
  penalties?: Record<string, number>;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function weightedPoints(r: ResultPoints): number {
  return Math.round(r.points * (r.multiplier ?? 1) * 100) / 100;
}

export function computeRanking(results: readonly ResultPoints[], o: RankingOptions): RankingRow[] {
  const from = o.asOf.getTime() - o.windowWeeks * WEEK_MS;
  const by = new Map<string, ResultPoints[]>();
  for (const r of results) {
    const t = r.date.getTime();
    if (t < from || t > o.asOf.getTime()) continue;
    by.set(r.playerId, [...(by.get(r.playerId) ?? []), r]);
  }
  const rows = [...by.entries()].map(([playerId, rs]) => {
    const top = (kind: 'singles' | 'doubles', n: number) =>
      rs.filter((r) => r.kind === kind).sort((a, b) => weightedPoints(b) - weightedPoints(a)).slice(0, n);
    const counted = [...top('singles', o.bestSingles), ...top('doubles', o.bestDoubles)];
    const raw = counted.reduce((s, r) => s + weightedPoints(r), 0);
    const points = Math.max(0, raw - (o.penalties?.[playerId] ?? 0));
    return { playerId, points: Math.round(points * 100) / 100, counted };
  });
  rows.sort((a, b) => b.points - a.points
    || Math.max(0, ...b.counted.map(weightedPoints)) - Math.max(0, ...a.counted.map(weightedPoints))
    || (a.playerId < b.playerId ? -1 : 1));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
