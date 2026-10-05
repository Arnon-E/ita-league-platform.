import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { login, SESSION_COOKIE } from '@/lib/auth';
import { getLang, tr } from '@/lib/i18n';

async function doLogin(fd: FormData) {
  'use server';
  const r = await login(db, String(fd.get('email') ?? ''), String(fd.get('password') ?? ''));
  if (!r.ok) redirect(`/login?err=${r.reason}`);
  (await cookies()).set(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 3600 });
  redirect('/');
}

const MSG: Record<string, string> = { invalid: 'אימייל או סיסמה שגויים', locked: 'החשבון ננעל זמנית. נסו שוב בעוד 15 דקות', inactive: 'החשבון אינו פעיל' };

export default async function Login({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const t = await tr();
  const en = (await getLang()) === 'en';
  return (
    <main dir={en ? 'ltr' : 'rtl'} style={{ maxWidth: 380, paddingTop: 80 }}>
      <h1>{t('כניסה')}</h1>
      <p className="muted">{t('איגוד הטניס בישראל')}</p>
      {err && <div className="err" role="alert">{t(MSG[err] ?? 'שגיאה')}</div>}
      <form action={doLogin} className="card grid">
        <label>{t('אימייל')}<input name="email" type="email" required autoComplete="username" /></label>
        <label>{t('סיסמה')}<input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="btn">{t('כניסה')}</button>
        <a className="muted" href="/register">{t('אין חשבון? הרשמה')}</a>
      </form>
    </main>
  );
}
