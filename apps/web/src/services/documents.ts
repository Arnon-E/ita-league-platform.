import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';
import { ALLOWED_MIME, MAX_BYTES, putObject, sniff } from '@/lib/storage';
import { audit } from './audit';
import { ownedPlayerIds } from './entries';
import { notifyPlayer } from './notifications';

const { documents, players } = schema;
type DocType = (typeof documents.$inferInsert)['type'];

export async function uploadDocument(db: Db, actor: Actor, playerId: string, type: DocType, data: Uint8Array, declaredMime: string, expiresAt?: Date) {
  const mine = await ownedPlayerIds(db, actor);
  assertCan(actor, 'document.upload', { ownedPlayerIds: mine, playerId });
  if (data.byteLength === 0) throw new Error('הקובץ ריק');
  if (data.byteLength > MAX_BYTES) throw new Error('הקובץ גדול מדי (עד 8MB)');
  const real = sniff(data);
  if (!real || !ALLOWED_MIME.includes(real) || (declaredMime && declaredMime !== real)) throw new Error('סוג קובץ לא נתמך (JPG, PNG או PDF בלבד)');
  const key = await putObject(`players/${playerId}`, data);
  const [row] = await db.insert(documents).values({ playerId, type, storageKey: key, mime: real, expiresAt: expiresAt ?? null }).returning();
  await audit(db, actor, 'document.upload', 'document', (row as NonNullable<typeof row>).id, { playerId, type });
  return row as NonNullable<typeof row>;
}

export async function reviewDocument(db: Db, actor: Actor, documentId: string, decision: 'APPROVED' | 'REJECTED', note?: string) {
  assertCan(actor, 'document.review');
  if (decision === 'REJECTED' && !note?.trim()) throw new Error('חובה לציין סיבת דחייה');
  const [d] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!d) throw new Error('Document not found');
  await db.update(documents).set({ status: decision, reviewNote: note ?? null, reviewedById: actor.id, reviewedAt: new Date() }).where(eq(documents.id, documentId));
  await audit(db, actor, `document.${decision.toLowerCase()}`, 'document', documentId, { note });
  const label = { ID_PHOTO: 'תמונת תעודת זהות', PARENT_CONSENT: 'אישור הורים', MEDICAL_CERTIFICATE: 'אישור רפואי', OTHER: 'מסמך' }[d.type];
  await notifyPlayer(db, d.playerId, 'document.review', decision === 'APPROVED' ? `${label} אושר` : `${label} נדחה`, decision === 'APPROVED' ? 'המסמך אושר.' : `סיבה: ${note}`);
}

export async function pendingDocuments(db: Db, actor: Actor) {
  assertCan(actor, 'document.review');
  return db.select({ d: documents, p: players }).from(documents).innerJoin(players, eq(players.id, documents.playerId))
    .where(eq(documents.status, 'PENDING')).orderBy(desc(documents.createdAt));
}

export async function playerDocuments(db: Db, actor: Actor, playerId: string) {
  const mine = await ownedPlayerIds(db, actor);
  if (!mine.includes(playerId)) assertCan(actor, 'document.review');
  return db.select().from(documents).where(eq(documents.playerId, playerId)).orderBy(desc(documents.createdAt));
}

/** Authorises reading a stored file: the owner/guardian or a reviewer. */
export async function canReadDocument(db: Db, actor: Actor, storageKey: string): Promise<boolean> {
  const [d] = await db.select().from(documents).where(eq(documents.storageKey, storageKey));
  if (!d) return false;
  if ((await ownedPlayerIds(db, actor)).includes(d.playerId)) return true;
  try { assertCan(actor, 'document.review'); return true; } catch { return false; }
}

export { and };
