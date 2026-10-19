import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handle } from '@/lib/api';
import { assertCan } from '@/lib/permissions';
import { audit } from '@/services/audit';

export const GET = (req: Request) => handle(req, async (actor) => {
  assertCan(actor, 'courts.manage');
  const venues = await db.select().from(schema.venues).orderBy(asc(schema.venues.name));
  const courts = await db.select().from(schema.courts).orderBy(asc(schema.courts.name));
  return venues.map((v) => ({ id: v.id, name: v.name, city: v.city, courts: courts.filter((c) => c.venueId === v.id).map((c) => c.name) }));
});

/** Body: { op: 'venue', name, city? } | { op: 'courts', venue, names } | { op: 'delete', venue }. */
export const POST = (req: Request) => handle(req, async (actor) => {
  assertCan(actor, 'courts.manage');
  const b = (await req.json().catch(() => ({}))) as { op?: string; name?: string; city?: string; venue?: string; names?: string };
  if (b.op === 'venue') {
    const name = String(b.name ?? '').trim();
    if (!name) throw new Error('חובה למלא שם מתקן');
    const [v] = await db.insert(schema.venues).values({ name, city: String(b.city ?? '').trim() || null }).returning();
    await audit(db, actor, 'venue.create', 'venue', v!.id, { name });
  } else if (b.op === 'courts') {
    const venueId = String(b.venue ?? '');
    const names = [...new Set(String(b.names ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];
    if (!names.length) throw new Error('חובה להזין שמות מגרשים');
    await db.insert(schema.courts).values(names.map((name) => ({ venueId, name }))).onConflictDoNothing();
    await audit(db, actor, 'court.add', 'venue', venueId, { names });
  } else if (b.op === 'delete') {
    const id = String(b.venue ?? '');
    await db.delete(schema.venues).where(eq(schema.venues.id, id));
    await audit(db, actor, 'venue.delete', 'venue', id);
  } else throw new Error('פעולה לא תקינה');
  return { ok: true };
});
