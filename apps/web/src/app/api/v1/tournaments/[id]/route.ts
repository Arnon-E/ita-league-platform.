import { db } from '@/db';
import { handle } from '@/lib/api';
import { tournamentDetail } from '@/services/queries';

export const GET = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(req, async () => {
  const d = await tournamentDetail(db, (await ctx.params).id);
  if (!d) throw new Error('not found');
  const nm = (id: string | null) => (id ? d.names.get(id) ?? null : null);
  return {
    tournament: { id: d.t.id, name: d.t.name, status: d.t.status, startDate: d.t.startDate, endDate: d.t.endDate },
    categories: d.cats.map((c) => ({ id: c.id, name: c.name, gender: c.gender })),
    matches: d.ms.map((m) => ({
      id: m.id, categoryId: m.categoryId, stage: m.stage, round: m.round, status: m.status,
      a: { id: m.aEntryId, name: nm(m.aEntryId) }, b: { id: m.bEntryId, name: nm(m.bEntryId) },
      sets: m.sets, winnerEntryId: m.winnerEntryId, court: m.courtLabel, start: m.scheduledStart, notBefore: m.notBefore,
    })),
  };
});
