import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { photoUrl } from '@/lib/photos';
import { playerProfile } from '@/services/public';
import { ensureDefaultRuleSet, loadRuleSet } from '@/services/rules';
import { rankingFor } from '@/services/rankings';

/** A player's public profile, as the website's player page: rank, record, recent form, next tournament, tournaments, matches, points history. */
export const GET = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handlePublic(async () => {
  const d = await playerProfile(db, (await ctx.params).id);
  if (!d) throw new Error('not found');
  const { p, club, ents, names, matches, awards, wins, losses, entryIds } = d;
  const rs = await ensureDefaultRuleSet(db);
  const mine = (await rankingFor(db, p.gender, new Date(), await loadRuleSet(db, rs.id))).find((r) => r.playerId === p.id);
  const catOf = new Map(ents.map((x) => [x.c.id, x]));
  const played = matches.filter((m) => m.status !== 'SCHEDULED' && m.status !== 'VOID' && m.winnerEntryId)
    .sort((a, b) => (b.scheduledStart?.getTime() ?? 0) - (a.scheduledStart?.getTime() ?? 0));
  const next = ents.filter(({ t }) => t.endDate.getTime() >= Date.now()).sort((a, b) => a.t.startDate.getTime() - b.t.startDate.getTime())[0];
  const byTournament: { id: string; name: string; startDate: Date; cats: string[] }[] = [];
  for (const { c, t } of ents) {
    const g = byTournament.find((x) => x.id === t.id);
    if (!g) byTournament.push({ id: t.id, name: t.name, startDate: t.startDate, cats: [c.name] });
    else if (!g.cats.includes(c.name)) g.cats.push(c.name);
  }
  return {
    id: p.id, name: `${p.firstName} ${p.lastName}`, gender: p.gender, photo: photoUrl(p.photo),
    age: Math.floor((Date.now() - p.birthDate.getTime()) / (365.25 * 864e5)),
    club: club ? { id: p.clubId, name: club } : null,
    rank: mine?.rank ?? null, points: mine?.points ?? 0, wins, losses,
    recent: played.slice(0, 5).map((m) => entryIds.includes(m.winnerEntryId!)),
    next: next ? { id: next.t.id, name: next.t.name, startDate: next.t.startDate } : null,
    tournaments: byTournament.sort((a, b) => b.startDate.getTime() - a.startDate.getTime()),
    matches: matches.filter((m) => m.aEntryId && m.bEntryId).map((m) => ({
      id: m.id, tournamentId: catOf.get(m.categoryId)?.t.id ?? null, tournament: catOf.get(m.categoryId)?.t.name ?? '', category: catOf.get(m.categoryId)?.c.name ?? '',
      a: names.get(m.aEntryId!) ?? '?', b: names.get(m.bEntryId!) ?? '?', status: m.status, sets: m.sets, start: m.scheduledStart,
      winner: m.winnerEntryId ? (m.winnerEntryId === m.aEntryId ? 'a' : m.winnerEntryId === m.bEntryId ? 'b' : null) : null,
      won: m.winnerEntryId ? entryIds.includes(m.winnerEntryId) : null,
    })),
    awards: awards.map((a) => ({ date: a.date, points: a.points })),
  };
});
