import { db, schema } from '@/db';
import { apiActor, handlePublic } from '@/lib/api';
import { listTournaments } from '@/services/queries';
import { relevantFor } from '@/services/eligibility';
import { myPlayersForRelevance } from '@/services/home';

/** Public list. With a bearer token, each row also says whether it can apply to any of the user's players (`relevant`). */
export const GET = (req: Request) => handlePublic(async () => {
  const [ts, actor, cats] = await Promise.all([
    listTournaments(db), apiActor(req),
    db.select({ tid: schema.categories.tournamentId, gender: schema.categories.gender, minBirthYear: schema.categories.minBirthYear, maxBirthYear: schema.categories.maxBirthYear }).from(schema.categories),
  ]);
  const mine = await myPlayersForRelevance(db, actor);
  return ts.map((t) => ({
    id: t.id, name: t.name, status: t.status, format: t.format, startDate: t.startDate, endDate: t.endDate, registrationCloses: t.registrationCloses, feeAgorot: t.feeAgorot, level: t.level, section: t.section,
    relevant: !mine.length || mine.some((p) => relevantFor(p, t, cats.filter((c) => c.tid === t.id))),
  }));
});
