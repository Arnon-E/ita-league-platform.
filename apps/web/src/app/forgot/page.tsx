import { AuthFrame } from '@/components/AuthFrame';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { requestPasswordReset } from '@/lib/password-reset';
import { getLang, tr } from '@/lib/i18n';

async function forgot(fd: FormData) {
  'use server';
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const r = await requestPasswordReset(db, String(fd.get('email') ?? ''), `${proto}://${host}`);
  redirect(r.failed ? '/forgot?fail=1' : r.configured ? '/forgot?sent=1' : '/forgot?off=1');
}

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string; off?: string; fail?: string }> }) {
  const { sent, off, fail } = await searchParams;
  const t = await tr();
  const en = (await getLang()) === 'en';
  return (
    <AuthFrame en={en}>
      <h1>{t('שכחתי סיסמה')}</h1>
      <p className="muted">{t('נשלח קישור לבחירת סיסמה חדשה לכתובת האימייל שלכם.')}</p>
      {sent && <div className="okmsg">{t('אם הכתובת רשומה, נשלח אליה קישור. בדקו גם בתיקיית הספאם.')}</div>}
      {fail && <div className="err" role="alert">{t('שליחת האימייל נכשלה. נסו שוב מאוחר יותר או פנו לאיגוד.')}</div>}
      {off && <div className="err" role="alert">{t('שליחת אימייל עדיין לא מוגדרת באתר. פנו לאיגוד לאיפוס הסיסמה.')}</div>}
      <form action={forgot} className="card grid">
        <label>{t('אימייל')}<input name="email" type="email" required autoComplete="username" /></label>
        <button className="btn">{t('שליחת קישור')}</button>
        <a className="muted" href="/login">{t('חזרה לכניסה')}</a>
      </form>
    </AuthFrame>
  );
}
