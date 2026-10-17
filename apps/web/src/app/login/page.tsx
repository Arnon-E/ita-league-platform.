import { AuthFrame } from '@/components/AuthFrame';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { login, REMEMBER_SECONDS, SESSION_COOKIE } from '@/lib/auth';
import { getLang, tr } from '@/lib/i18n';

async function doLogin(fd: FormData) {
  'use server';
  const remember = fd.get('remember') === '1';
  const r = await login(db, String(fd.get('email') ?? ''), String(fd.get('password') ?? ''), new Date(), remember);
  if (!r.ok) redirect(`/login?err=${r.reason}`);
  (await cookies()).set(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: remember ? REMEMBER_SECONDS : 12 * 3600 });
  const next = String(fd.get('next') ?? '');
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
}

const MSG: Record<string, string> = { invalid: 'אימייל או סיסמה שגויים', locked: 'החשבון ננעל זמנית. נסו שוב בעוד 15 דקות', inactive: 'החשבון אינו פעיל' };

export default async function Login({ searchParams }: { searchParams: Promise<{ err?: string; next?: string; reset?: string }> }) {
  const { err, next = '', reset } = await searchParams;
  const t = await tr();
  const en = (await getLang()) === 'en';
  return (
    <AuthFrame en={en}>
      <h1>{t('כניסה')}</h1>
      <p className="muted">{t('איגוד הטניס בישראל')}</p>
      {reset && <div className="okmsg">{t('הסיסמה עודכנה. אפשר להיכנס.')}</div>}
      {err && <div className="err" role="alert">{t(MSG[err] ?? 'שגיאה')}</div>}
      <form action={doLogin} className="card grid">
        <input type="hidden" name="next" value={next} />
        <label>{t('אימייל או שם משתמש')}<input name="email" required autoComplete="username" autoCapitalize="none" /></label>
        <label>{t('סיסמה')}<input name="password" type="password" required autoComplete="current-password" /></label>
        <label style={{ flexDirection: 'row', alignItems: 'center', fontWeight: 500 }}><input type="checkbox" name="remember" value="1" defaultChecked style={{ minHeight: 0 }} /> {t('השאר אותי מחובר')}</label>
        <button className="btn">{t('כניסה')}</button>
        <a className="muted" href="/forgot">{t('שכחתי סיסמה')}</a>
        <a className="muted" href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}>{t('אין חשבון? הרשמה')}</a>
      </form>
    </AuthFrame>
  );
}
