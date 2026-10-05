'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { SESSION_COOKIE, type Role } from '@/lib/auth';
import { guarded, requireActor } from '@/lib/session';
import { impersonate, setUserActive, setUserRole } from '@/services/users';
import { issueRefund } from '@/services/payments';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function roleAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/admin/users', async () => {
    if (s(fd, 'op') === 'active') await setUserActive(db, a, s(fd, 'user'), s(fd, 'value') === '1');
    else await setUserRole(db, a, s(fd, 'user'), s(fd, 'role') as Role);
    return 'נשמר';
  });
}

export async function impersonateAction(fd: FormData) {
  const a = await requireActor();
  let tok = '';
  let err = '';
  try { tok = await impersonate(db, a, s(fd, 'user')); } catch (e) { err = e instanceof Error ? e.message : 'שגיאה'; }
  if (err) redirect(`/admin/users?err=${encodeURIComponent(err)}`);
  const c = await cookies();
  c.set('ita_admin_return', c.get(SESSION_COOKIE)?.value ?? '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  c.set(SESSION_COOKIE, tok, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 });
  redirect('/');
}

export async function stopImpersonationAction() {
  const c = await cookies();
  const back = c.get('ita_admin_return')?.value;
  if (back) c.set(SESSION_COOKIE, back, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 12 * 3600 });
  c.delete('ita_admin_return');
  redirect('/admin/users');
}

export async function refundAction(fd: FormData) {
  const a = await requireActor();
  const tid = s(fd, 'id');
  await guarded(`/tournaments/${tid}?tab=entries`, async () => {
    await issueRefund(db, a, s(fd, 'payment'), Math.round(Number(s(fd, 'amount')) * 100), s(fd, 'reason'));
    return 'ההחזר נרשם';
  });
}
