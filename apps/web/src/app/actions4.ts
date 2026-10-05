'use server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import { guarded, requireActor } from '@/lib/session';
import { audit } from '@/services/audit';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const BACK = '/admin/venues';

export async function venueAction(fd: FormData) {
  const a = await requireActor();
  await guarded(BACK, async () => {
    assertCan(a, 'courts.manage');
    const name = s(fd, 'name');
    if (!name) throw new Error('חובה למלא שם מתקן');
    const [v] = await db.insert(schema.venues).values({ name, city: s(fd, 'city') || null }).returning();
    await audit(db, a, 'venue.create', 'venue', v!.id, { name });
    return 'המתקן נוסף';
  });
}

export async function courtsForVenueAction(fd: FormData) {
  const a = await requireActor();
  await guarded(BACK, async () => {
    assertCan(a, 'courts.manage');
    const venueId = s(fd, 'venue');
    const names = [...new Set(s(fd, 'names').split(/[,\n]/).map((x) => x.trim()).filter(Boolean))];
    if (!names.length) throw new Error('חובה להזין שמות מגרשים');
    await db.insert(schema.courts).values(names.map((name) => ({ venueId, name }))).onConflictDoNothing();
    await audit(db, a, 'court.add', 'venue', venueId, { names });
    return `נוספו ${names.length} מגרשים`;
  });
}

export async function deleteVenueAction(fd: FormData) {
  const a = await requireActor();
  await guarded(BACK, async () => {
    assertCan(a, 'courts.manage');
    const id = s(fd, 'venue');
    await db.delete(schema.venues).where(eq(schema.venues.id, id));
    await audit(db, a, 'venue.delete', 'venue', id);
    return 'המתקן נמחק';
  });
}
