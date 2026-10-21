import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { liveFeed } from '@/services/public';

/** ?u=<upcoming rows> &r=<result rows>: "show more" raises them, 15 at a time up to 150. */
export const GET = (req: Request) => handlePublic(async () => {
  const q = new URL(req.url).searchParams;
  const size = (v: string | null) => Math.min(150, Math.max(15, Number(v) || 15));
  const f = await liveFeed(db, { upcoming: size(q.get('u')), results: size(q.get('r')) });
  const nm = (id: string | null) => (id ? f.names.get(id) ?? null : null);
  const row = ({ m, c, t }: (typeof f.upcoming)[number]) => ({
    id: m.id, tournament: t.name, category: c.name, status: m.status, a: nm(m.aEntryId), b: nm(m.bEntryId),
    sets: m.sets, court: m.courtLabel, start: m.scheduledStart,
    winner: m.winnerEntryId ? (m.winnerEntryId === m.aEntryId ? 'a' : m.winnerEntryId === m.bEntryId ? 'b' : null) : null,
  });
  return { live: f.live.map(row), upcoming: f.upcoming.map(row), results: f.results.map(row), moreUpcoming: f.moreUpcoming, moreResults: f.moreResults };
}, 10);
