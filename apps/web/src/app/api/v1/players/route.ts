import { db } from '@/db';
import { handle } from '@/lib/api';
import { addPlayerProfile } from '@/services/accounts';

/** Body: { first, last, birth: 'YYYY-MM-DD', gender: 'MALE'|'FEMALE', nationalId?, forChild? }. A parent registers a child with forChild: true. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { first?: string; last?: string; birth?: string; gender?: string; nationalId?: string; forChild?: boolean };
  const birth = new Date(String(b.birth ?? ''));
  if (!String(b.first ?? '').trim() || !String(b.last ?? '').trim()) throw new Error('נדרשים שם פרטי ושם משפחה');
  if (Number.isNaN(birth.getTime()) || birth > new Date()) throw new Error('תאריך לידה לא תקין (YYYY-MM-DD)');
  if (b.gender !== 'MALE' && b.gender !== 'FEMALE') throw new Error('נדרש מין');
  const p = await addPlayerProfile(db, actor, {
    firstName: String(b.first), lastName: String(b.last), birthDate: birth, gender: b.gender,
    ...(b.nationalId ? { nationalId: String(b.nationalId) } : {}), forChild: !!b.forChild,
  });
  return { id: p.id };
});
