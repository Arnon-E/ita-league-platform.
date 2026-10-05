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

import { assertCan } from '@/lib/permissions';
import { parseRuleData, hydrate, latestRuleSet } from '@/services/rules';
import { publishRuleSetVersion } from '@/services/rules';
import { audit } from '@/services/audit';

export async function publishRulesAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/admin/rules', async () => {
    assertCan(a, 'ruleset.manage');
    const data = parseRuleData(s(fd, 'json'));
    const cur = await latestRuleSet(db);
    const row = await publishRuleSetVersion(db, cur.key, s(fd, 'name') || cur.name, hydrate(cur.key, cur.version + 1, data));
    await audit(db, a, 'ruleset.publish', 'ruleset', row.id, { version: row.version, verified: data.verified });
    return `פורסמה גרסה ${row.version}. תחרויות חדשות ישתמשו בה; תחרויות קיימות נשארות על הגרסה שלהן`;
  });
}

import { startCheckout } from '@/services/checkout';

export async function payAction(fd: FormData) {
  const a = await requireActor();
  let url = '';
  let err = '';
  try { url = (await startCheckout(db, a, s(fd, 'entry'))).url; } catch (e) { err = e instanceof Error ? e.message : 'שגיאה'; }
  redirect(err ? `/me?err=${encodeURIComponent(err)}` : url);
}

import { importFromLogligDb } from '@/services/loglig-db';

export async function importDbAction(fd: FormData) {
  const a = await requireActor();
  let q = '';
  try {
    const dry = fd.get('dry') === '1';
    const r = await importFromLogligDb(db, a, { url: s(fd, 'url'), playersSql: s(fd, 'playersSql'), pointsSql: s(fd, 'pointsSql'), dryRun: dry });
    const f = (n: string, x?: { created: number; updated: number; errors: { row: number; reason: string }[] }) => (x ? `${n}: נוצרו ${x.created}, עודכנו ${x.updated}, שגיאות ${x.errors.length}${x.errors.slice(0, 3).map((e) => ` (שורה ${e.row}: ${e.reason})`).join('')}` : '');
    q = `ok=${encodeURIComponent(`${dry ? 'בדיקה בלבד · ' : ''}${[f('שחקנים', r.players), f('נקודות', r.points)].filter(Boolean).join(' · ')}`)}`;
  } catch (e) { q = `err=${encodeURIComponent(e instanceof Error ? e.message : 'שגיאה')}`; }
  redirect(`/admin/import?${q}`);
}
