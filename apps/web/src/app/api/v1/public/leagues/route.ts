import { desc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handlePublic } from '@/lib/api';
import type { LeagueData } from '@/services/loglig-leagues';

export const GET = () => handlePublic(async () => {
  const rows = await db.select().from(schema.externalLeagues).orderBy(desc(schema.externalLeagues.updatedAt));
  return rows.map((l) => {
    const d = l.data as LeagueData;
    return {
      id: l.id, name: l.name, gender: l.gender, teams: d.groups.reduce((n, g) => n + g.standings.length, 0),
      played: d.rounds.reduce((n, r) => n + r.matches.filter((m) => m.done).length, 0), total: d.rounds.reduce((n, r) => n + r.matches.length, 0),
    };
  });
});
