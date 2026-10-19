import { db } from '@/db';
import { handle } from '@/lib/api';
import type { Role } from '@/lib/auth';
import { listUsers, setUserActive, setUserRole } from '@/services/users';

export const GET = (req: Request) => handle(req, async (actor) =>
  (await listUsers(db, actor)).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active })));

/** Body: { id, role } or { id, active }. The services check who may change what. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { id?: string; role?: string; active?: boolean };
  if (typeof b.active === 'boolean') await setUserActive(db, actor, String(b.id ?? ''), b.active);
  else await setUserRole(db, actor, String(b.id ?? ''), String(b.role ?? '') as Role);
  return { ok: true };
});
