import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { tournamentDetail } from '@/services/queries';
import { effectiveMaxBirthYear } from '@/services/eligibility';
import { doublesTables } from '@/services/doubles';
import { photoUrl } from '@/lib/photos';

export const GET = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handlePublic(async () => {
  const d = await tournamentDetail(db, (await ctx.params).id);
  if (!d) throw new Error('not found');
  const nm = (id: string | null) => (id ? d.names.get(id) ?? null : null);
  return {
    tournament: { id: d.t.id, name: d.t.name, status: d.t.status, startDate: d.t.startDate, endDate: d.t.endDate, registrationCloses: d.t.registrationCloses, registerUrl: d.t.registerUrl, contacts: d.t.contacts ?? [] },
    participants: d.ents.filter((x) => x.e.status === 'CONFIRMED').map((x) => ({ categoryId: x.e.categoryId, id: x.p.id, name: `${x.p.firstName} ${x.p.lastName}`, club: x.club, photo: photoUrl(x.p.photo), fromLoglig: x.e.source === 'loglig' })),
    categories: d.cats.map((c) => ({ id: c.id, name: c.name, gender: c.gender, minBirthYear: c.minBirthYear, maxBirthYear: effectiveMaxBirthYear(c, d.t) })),
    matches: d.ms.map((m) => ({
      id: m.id, categoryId: m.categoryId, stage: m.stage, round: m.round, index: m.index, status: m.status,
      a: { id: m.aEntryId, name: nm(m.aEntryId) }, b: { id: m.bEntryId, name: nm(m.bEntryId) },
      sets: m.sets, winnerEntryId: m.winnerEntryId, court: m.courtLabel, start: m.scheduledStart, kind: m.scheduleKind, notBefore: m.notBefore,
    })),
    doubles: d.doubles.map((m) => ({
      id: m.id, category: m.category, stage: m.stage, group: m.groupName, round: m.round, status: m.status,
      a: m.aName.split(' / '), b: m.bName.split(' / '), sets: m.sets, winner: m.winner, court: m.court, start: m.scheduledStart, kind: m.scheduleKind,
    })),
    doublesTables: doublesTables(d.doubles),
    doublesBrackets: d.doublesBrackets.map((b) => ({ category: b.category, tree: b.tree })),
  };
});
