import { redirect } from 'next/navigation';
import { db } from '@/db';
import { applyPasswordReset } from '@/lib/password-reset';
import { getLang, tr } from '@/lib/i18n';

async function reset(fd: FormData) {
  'use server';
  const token = String(fd.get('token') ?? '');
  const r = await applyPasswordReset(db, token, String(fd.get('password') ?? ''));
  if (r === 'ok') redirect('/login?reset=1');
  const msg = r === 'invalid' ? 'invalid' : encodeURIComponent(r.weak);
  redirect(`/reset?token=${encodeURIComponent(token)}&err=${msg}`);
}

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string; err?: string }> }) {
  const { token = '', err } = await searchParams;
  const t = await tr();
  const en = (await getLang()) === 'en';
  return (
    <main dir={en ? 'ltr' : 'rtl'} style={{ maxWidth: 380, paddingTop: 80 }}>
      <h1>{t('בחירת סיסמה חדשה')}</h1>
      {err === 'invalid' && <div className="err" role="alert">{t('הקישור פג תוקף או כבר נוצל. אפשר לבקש קישור חדש.')} <a href="/forgot"><u>{t('בקשת קישור חדש')}</u></a></div>}
      {err && err !== 'invalid' && <div className="err" role="alert">{err}</div>}
      <form action={reset} className="card grid">
        <input type="hidden" name="token" value={token} />
        <label>{t('סיסמה חדשה (10 תווים, אותיות וספרות)')}<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
        <button className="btn">{t('שמירה וכניסה')}</button>
      </form>
    </main>
  );
}
