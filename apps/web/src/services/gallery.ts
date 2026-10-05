import { desc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import type { Actor } from '@/lib/auth';
import { assertCan } from '@/lib/permissions';
import { MAX_BYTES, putObject, sniff } from '@/lib/storage';
import { audit } from './audit';
import { scopeFor } from './tournaments';

const { galleryItems } = schema;
const IMAGE_MIME = ['image/jpeg', 'image/png'];

/** Staff (tournament managers and assigned referees) add photos. The real file type is checked, not the extension. */
export async function addPhoto(db: Db, actor: Actor, tournamentId: string, data: Uint8Array, caption?: string) {
  assertCan(actor, 'result.enter', await scopeFor(db, actor, tournamentId));
  if (data.byteLength === 0 || data.byteLength > MAX_BYTES) throw new Error('הקובץ ריק או גדול מדי (עד 8MB)');
  const mime = sniff(data);
  if (!mime || !IMAGE_MIME.includes(mime)) throw new Error('ניתן להעלות תמונות JPG או PNG בלבד');
  const key = await putObject(`gallery/${tournamentId}`, data);
  const [row] = await db.insert(galleryItems).values({
    tournamentId, storageKey: key, mime, caption: caption?.trim().slice(0, 200) || null, uploadedById: actor.id,
  }).returning();
  await audit(db, actor, 'gallery.add', 'tournament', tournamentId, { id: row!.id });
  return row!;
}

export async function listPhotos(db: Db, tournamentId: string) {
  return db.select().from(galleryItems).where(eq(galleryItems.tournamentId, tournamentId)).orderBy(desc(galleryItems.createdAt));
}

export async function removePhoto(db: Db, actor: Actor, photoId: string) {
  const [p] = await db.select().from(galleryItems).where(eq(galleryItems.id, photoId));
  if (!p) throw new Error('התמונה לא נמצאה');
  assertCan(actor, 'tournament.manage', await scopeFor(db, actor, p.tournamentId));
  await db.delete(galleryItems).where(eq(galleryItems.id, photoId));
  await audit(db, actor, 'gallery.remove', 'tournament', p.tournamentId, { id: photoId });
}
