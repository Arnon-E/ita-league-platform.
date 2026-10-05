import { eq, gte } from 'drizzle-orm';
import { computeRanking, type RankingRow, type RuleSet } from '@ita/rules-engine';
import type { Db } from '@/db';
import { schema } from '@/db';

const { pointsAwards, players } = schema;

export async function rankingFor(db: Db, gender: 'MALE' | 'FEMALE' | 'OPEN', asOf: Date, rules: RuleSet): Promise<RankingRow[]> {
  const from = new Date(asOf.getTime() - rules.ranking.windowWeeks * 7 * 86400000);
  const rows = await db.select({ a: pointsAwards, g: players.gender }).from(pointsAwards)
    .innerJoin(players, eq(players.id, pointsAwards.playerId)).where(gte(pointsAwards.date, from));
  const results = rows.filter((r) => gender === 'OPEN' || r.g === gender).map(({ a }) => ({
    playerId: a.playerId, tournamentId: a.tournamentId ?? '', date: a.date, points: a.points,
    multiplier: a.multiplier, kind: (a.kind === 'doubles' ? 'doubles' : 'singles') as 'singles' | 'doubles',
  }));
  return computeRanking(results, {
    asOf, windowWeeks: rules.ranking.windowWeeks, bestSingles: rules.ranking.bestSingles, bestDoubles: rules.ranking.bestDoubles,
  });
}

export async function rankMap(db: Db, gender: 'MALE' | 'FEMALE' | 'OPEN', asOf: Date, rules: RuleSet): Promise<Map<string, number>> {
  return new Map((await rankingFor(db, gender, asOf, rules)).map((r) => [r.playerId, r.rank]));
}

/** Round reached -> base points. Keys: W, F, SF, QF, R16, R32, R64, R128, G (group stage exit). */
export type PointsTable = Record<string, number>;

export function roundKey(roundsFromFinal: number): string {
  return ['F', 'SF', 'QF', 'R16', 'R32', 'R64', 'R128'][roundsFromFinal] ?? `R${2 ** (roundsFromFinal + 1)}`;
}
