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
  redirect(r.configured ? '/forgot?sent=1' : '/forgot?off=1');
}

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string; off?: string }> }) {
  const { sent, off } = await searchParams;
  const t = await tr();
  const en = (await getLang()) === 'en';
  return (
    <main dir={en ? 'ltr' : 'rtl'} style={{ maxWidth: 380, paddingTop: 80 }}>
      <h1>{t('שכחתי סיסמה')}</h1>
      <p className="muted">{t('נשלח קישור לבחירת סיסמה חדשה לכתובת האימייל שלכם.')}</p>
      {sent && <div className="okmsg">{t('אם הכתובת רשומה, נשלח אליה קישור. בדקו גם בתיקיית הספאם.')}</div>}
      {off && <div className="err" role="alert">{t('שליחת אימייל עדיין לא מוגדרת באתר. פנו לאיגוד לאיפוס הסיסמה.')}</div>}
      <form action={forgot} className="card grid">
        <label>{t('אימייל')}<input name="email" type="email" required autoComplete="username" /></label>
        <button className="btn">{t('שליחת קישור')}</button>
        <a className="muted" href="/login">{t('חזרה לכניסה')}</a>
      </form>
    </main>
  );
}
