import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { matchDetail } from '@/services/queries';

export const GET = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handlePublic(async () => {
  const d = await matchDetail(db, (await ctx.params).id);
  if (!d) throw new Error('not found');
  const { m, c, t, names } = d;
  const nm = (id: string | null) => (id ? names.get(id) ?? '?' : null);
  return {
    id: m.id, tournamentId: t.id, tournament: t.name, category: c.name, stage: m.stage, round: m.round, status: m.status, live: m.live,
    a: nm(m.aEntryId), b: nm(m.bEntryId), sets: m.sets, court: m.courtLabel, start: m.scheduledStart, setsToWin: t.setsToWin, decider: t.decider,
    winner: m.winnerEntryId ? (m.winnerEntryId === m.aEntryId ? 'a' : m.winnerEntryId === m.bEntryId ? 'b' : null) : null,
  };
});
