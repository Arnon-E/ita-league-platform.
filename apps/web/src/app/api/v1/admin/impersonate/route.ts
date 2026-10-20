import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handle } from '@/lib/api';
import { impersonate } from '@/services/users';

/** Super admin only (the service checks, and refuses nested impersonation). Body: { id }. Returns a 1-hour session for that user; the audit log records who started it. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const id = String(((await req.json().catch(() => ({}))) as { id?: string }).id ?? '');
  const token = await impersonate(db, actor, id);
  const [u] = await db.select({ name: schema.users.name, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, id));
  return { token, name: u?.name ?? '', role: u?.role ?? 'PLAYER' };
});
