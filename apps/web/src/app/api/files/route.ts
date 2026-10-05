import { getActor } from '@/lib/session';
import { db } from '@/db';
import { getObject, verifySigned } from '@/lib/storage';
import { canReadDocument } from '@/services/documents';
import { schema } from '@/db';
import { eq } from 'drizzle-orm';

/** Serves a private document through a short-lived signed URL, only to someone allowed to see it. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get('key') ?? '';
  if (!verifySigned(key, Number(u.searchParams.get('exp')), u.searchParams.get('sig') ?? '')) return new Response('Expired', { status: 403 });
  const actor = await getActor();
  if (!actor || !(await canReadDocument(db, actor, key))) return new Response('Forbidden', { status: 403 });
  const [d] = await db.select().from(schema.documents).where(eq(schema.documents.storageKey, key));
  const buf = await getObject(key);
  return new Response(new Uint8Array(buf), { headers: { 'content-type': d?.mime ?? 'application/octet-stream', 'cache-control': 'private, no-store', 'content-disposition': 'inline', 'x-content-type-options': 'nosniff' } });
}
