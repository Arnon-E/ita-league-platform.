import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { liveFeed } from '@/services/public';

export const GET = () => handlePublic(async () => {
  const f = await liveFeed(db);
  const nm = (id: string | null) => (id ? f.names.get(id) ?? null : null);
  const row = ({ m, c, t }: (typeof f.upcoming)[number]) => ({
    id: m.id, tournament: t.name, category: c.name, status: m.status, a: nm(m.aEntryId), b: nm(m.bEntryId),
    sets: m.sets, court: m.courtLabel, start: m.scheduledStart,
  });
  return { upcoming: f.upcoming.map(row), results: f.results.slice(0, 50).map(row) };
});
