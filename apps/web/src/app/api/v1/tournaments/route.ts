import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { apiActor, handlePublic } from '@/lib/api';
import { homeCatalog } from '@/services/catalog';
import { relevantFor } from '@/services/eligibility';
import { myPlayersForRelevance } from '@/services/home';
import { can } from '@/lib/permissions';

/** Public list. With a bearer token, each row also says whether it can apply to any of the user's players (`relevant`). */
export const GET = (req: Request) => handlePublic(async () => {
  const [allTs, actor] = await Promise.all([homeCatalog(db), apiActor(req)]);
  // drafts and cancelled competitions nobody entered are not shown to the public; staff still see them (to publish or restore)
  const ts = actor && can(actor, 'tournament.create') ? allTs : allTs.filter((t) => t.status !== 'DRAFT' && (t.status !== 'CANCELLED' || t.hasEntries));
  const mine = await myPlayersForRelevance(db, actor);
  return ts.map((t) => ({
    id: t.id, name: t.name, status: t.status, format: t.format, startDate: t.startDate, endDate: t.endDate, registrationCloses: t.registrationCloses, feeAgorot: t.feeAgorot, level: t.level, section: t.section,
    relevant: !mine.length || mine.some((p) => relevantFor(p, t, t.cats)),
  }));
});
