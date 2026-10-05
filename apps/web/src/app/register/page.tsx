import { Flash } from '@/components/Shell';
import { signUpAction } from '@/app/actions2';

export default async function Register({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  return (
    <main style={{ maxWidth: 420, paddingTop: 60 }}>
      <h1>הרשמה</h1>
      <p className="muted">יצירת חשבון שחקן או הורה</p>
      <Flash err={err} />
      <form action={signUpAction} className="card grid">
        <label>שם מלא<input name="name" required /></label>
        <label>אימייל<input name="email" type="email" required autoComplete="username" /></label>
        <label>טלפון<input name="phone" type="tel" /></label>
        <label>סיסמה (10 תווים, אותיות וספרות)<input name="password" type="password" required minLength={10} autoComplete="new-password" /></label>
        <button className="btn">יצירת חשבון</button>
        <a className="muted" href="/login">כבר רשומים? כניסה</a>
      </form>
    </main>
  );
}
