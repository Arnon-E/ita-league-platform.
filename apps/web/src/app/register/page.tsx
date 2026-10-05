import { Flash } from '@/components/Shell';
import { signUpAction } from '@/app/actions2';
import { getLang, tr } from '@/lib/i18n';

export default async function Register({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const t = await tr();
  const en = (await getLang()) === 'en';
  return (
    <main dir={en ? 'ltr' : 'rtl'} style={{ maxWidth: 420, paddingTop: 60 }}>
      <h1>{t('הרשמה')}</h1>
      <p className="muted">{t('יצירת חשבון שחקן או הורה')}</p>
      <Flash err={err} />
      <form action={signUpAction} className="card grid">
        <label>{t('שם מלא')}<input name="name" required /></label>
        <label>{t('אימייל')}<input name="email" type="email" required autoComplete="username" /></label>
        <label>{t('טלפון')}<input name="phone" type="tel" /></label>
        <label>{t('סיסמה (10 תווים, אותיות וספרות)')}<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
        <button className="btn">{t('יצירת חשבון')}</button>
        <a className="muted" href="/login">{t('כבר רשומים? כניסה')}</a>
      </form>
    </main>
  );
}
