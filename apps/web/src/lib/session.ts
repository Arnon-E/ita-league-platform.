import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession, type Actor } from './auth';
import { Forbidden } from './permissions';

export async function getActor(): Promise<Actor | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect('/login');
  return a;
}

/** Runs a server action body and turns known errors into a redirect with a message. */
export async function guarded(back: string, fn: () => Promise<void | string>): Promise<never> {
  let msg = '';
  let ok = '';
  try {
    const r = await fn();
    if (typeof r === 'string') ok = r;
  } catch (e) {
    if (e instanceof Error && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')) throw e;
    msg = e instanceof Forbidden ? 'אין הרשאה לפעולה זו' : e instanceof Error ? e.message : 'שגיאה';
  }
  const sep = back.includes('?') ? '&' : '?';
  redirect(msg ? `${back}${sep}err=${encodeURIComponent(msg)}` : ok ? `${back}${sep}ok=${encodeURIComponent(ok)}` : back);
}
