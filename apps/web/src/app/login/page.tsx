import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { login, SESSION_COOKIE } from '@/lib/auth';

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
  return (
    <main style={{ maxWidth: 380, paddingTop: 80 }}>
      <h1>כניסה</h1>
      <p className="muted">איגוד הטניס בישראל</p>
      {err && <div className="err" role="alert">{MSG[err] ?? 'שגיאה'}</div>}
      <form action={doLogin} className="card grid">
        <label>אימייל<input name="email" type="email" required autoComplete="username" /></label>
        <label>סיסמה<input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="btn">כניסה</button>
        <a className="muted" href="/register">אין חשבון? הרשמה</a>
      </form>
    </main>
  );
}
