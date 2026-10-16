import { AuthFrame } from '@/components/AuthFrame';
import { Flash } from '@/components/Shell';
import { signUpAction } from '@/app/actions2';
import { getLang, tr } from '@/lib/i18n';

export default async function Register({ searchParams }: { searchParams: Promise<{ err?: string; next?: string }> }) {
  const { err, next = '' } = await searchParams;
  const t = await tr();
  const en = (await getLang()) === 'en';
  return (
    <AuthFrame en={en}>
      <h1>{t('הרשמה')}</h1>
      <p className="muted">{t('יצירת חשבון שחקן, הורה או אוהד. אפשר לעקוב אחרי שחקנים ולקבל התראות.')}</p>
      <Flash err={err} />
      <form action={signUpAction} className="card grid">
        <input type="hidden" name="next" value={next} />
        <label>{t('שם מלא')}<input name="name" required /></label>
        <label>{t('אימייל')}<input name="email" type="email" required autoComplete="username" /></label>
        <label>{t('טלפון')}<input name="phone" type="tel" /></label>
        <label>{t('סיסמה (10 תווים, אותיות וספרות)')}<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
        <button className="btn">{t('יצירת חשבון')}</button>
        <a className="muted" href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>{t('כבר רשומים? כניסה')}</a>
      </form>
    </AuthFrame>
  );
}
