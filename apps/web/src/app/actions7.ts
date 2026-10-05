'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LANG_COOKIE } from '@/lib/i18n';

/** Switches between Hebrew and English and returns to the same page. */
export async function setLangAction(fd: FormData) {
  const lang = String(fd.get('lang')) === 'en' ? 'en' : 'he';
  (await cookies()).set(LANG_COOKIE, lang, { path: '/', maxAge: 365 * 86400, sameSite: 'lax' });
  let back = '/';
  try {
    const ref = (await headers()).get('referer');
    if (ref) { const u = new URL(ref); back = u.pathname + u.search; }
  } catch { /* fall back to home */ }
  redirect(back);
}
