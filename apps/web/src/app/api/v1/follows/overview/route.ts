import { db } from '@/db';
import { handle } from '@/lib/api';
import { followedOverview } from '@/services/follows';

/** Who the signed-in user follows, with each player's rank, latest results and next match, plus followed clubs and tournaments. */
export const GET = (req: Request) => handle(req, async (actor) => {
  const o = await followedOverview(db, actor.id);
  return {
    players: o.players.map((p) => ({ id: p.id, name: p.name, club: p.club, rank: p.rank, points: p.points, recent: p.recent.map((r) => ({ won: r.won, vs: r.vs, score: r.score, competition: r.competition })), next: p.next ? { vs: p.next.vs, competition: p.next.competition, when: p.next.when, court: p.next.court } : null })),
    clubs: o.clubs.map((c) => ({ id: c.id, name: c.name })),
    tournaments: o.tournaments.map((t) => ({ id: t.id, name: t.name, status: t.status, startDate: t.startDate, endDate: t.endDate })),
  };
});
