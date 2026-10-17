import { db } from '@/db';
import { handle } from '@/lib/api';
import { removeProfile, updateProfile } from '@/services/profiles';

type Ctx = { params: Promise<{ id: string }> };

/** Fix a profile. Body: { first, last, birth: 'YYYY-MM-DD', gender }. Allowed for the parent or the owning account. */
export const PATCH = (req: Request, ctx: Ctx) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { first?: string; last?: string; birth?: string; gender?: string };
  return updateProfile(db, actor, (await ctx.params).id, { firstName: String(b.first ?? ''), lastName: String(b.last ?? ''), birthDate: new Date(String(b.birth ?? '')), gender: b.gender as 'MALE' });
});

/** Remove a profile from the account: deleted outright if it has no history, otherwise detached and kept in the league's records. */
export const DELETE = (req: Request, ctx: Ctx) => handle(req, async (actor) => removeProfile(db, actor, (await ctx.params).id));
