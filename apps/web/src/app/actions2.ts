'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { login, SESSION_COOKIE } from '@/lib/auth';
import { guarded, requireActor } from '@/lib/session';
import { addPlayerProfile, signUp } from '@/services/accounts';
import { reviewDocument, uploadDocument } from '@/services/documents';
import { importPlayersCsv, importPointsCsv } from '@/services/imports';
import { registerEntry } from '@/services/entries';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function signUpAction(fd: FormData) {
  let err = '';
  try {
    await signUp(db, { email: s(fd, 'email'), password: s(fd, 'password'), name: s(fd, 'name'), phone: s(fd, 'phone') });
    const r = await login(db, s(fd, 'email'), s(fd, 'password'));
    if (r.ok) (await cookies()).set(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 3600 });
  } catch (e) { err = e instanceof Error ? e.message : 'שגיאה'; }
  redirect(err ? `/register?err=${encodeURIComponent(err)}` : '/me');
}

export async function addPlayerAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/me', async () => {
    await addPlayerProfile(db, a, {
      firstName: s(fd, 'first'), lastName: s(fd, 'last'), birthDate: new Date(s(fd, 'birth')), gender: s(fd, 'gender') as 'MALE', nationalId: s(fd, 'nid') || undefined, forChild: fd.get('child') === '1',
    });
    return 'הפרופיל נוצר';
  });
}

export async function uploadDocAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/me', async () => {
    const f = fd.get('file');
    if (!(f instanceof File)) throw new Error('לא נבחר קובץ');
    const exp = s(fd, 'expires');
    await uploadDocument(db, a, s(fd, 'player'), s(fd, 'type') as 'ID_PHOTO', new Uint8Array(await f.arrayBuffer()), f.type, exp ? new Date(exp) : undefined);
    return 'המסמך הועלה וממתין לאישור';
  });
}

export async function selfRegisterAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/me', async () => { await registerEntry(db, a, s(fd, 'category'), s(fd, 'player')); return 'נרשמתם לקטגוריה'; });
}

export async function reviewDocAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/admin/documents', async () => { await reviewDocument(db, a, s(fd, 'doc'), s(fd, 'decision') as 'APPROVED', s(fd, 'note')); return 'נשמר'; });
}

export async function importAction(fd: FormData) {
  const a = await requireActor();
  let msg = '';
  try {
    const f = fd.get('file');
    const text = f instanceof File && f.size ? await f.text() : s(fd, 'csv');
    const dry = fd.get('dry') === '1';
    const rep = s(fd, 'kind') === 'points' ? await importPointsCsv(db, a, text, { dryRun: dry }) : await importPlayersCsv(db, a, text, { dryRun: dry });
    msg = `ok=${encodeURIComponent(`${dry ? 'בדיקה בלבד: ' : ''}נוצרו ${rep.created}, עודכנו ${rep.updated}, שגיאות ${rep.errors.length}${rep.errors.slice(0, 5).map((e) => ` · שורה ${e.row}: ${e.reason}`).join('')}`)}`;
  } catch (e) { msg = `err=${encodeURIComponent(e instanceof Error ? e.message : 'שגיאה')}`; }
  redirect(`/admin/import?${msg}`);
}
