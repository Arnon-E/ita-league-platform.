import * as SecureStore from 'expo-secure-store';
import en from './en';

/**
 * Languages of the app. Hebrew is the source language: every text in the code is written in Hebrew and passed through tr(),
 * and each other language is one file that maps those Hebrew texts to its own (src/i18n/en.ts).
 *
 * Adding a language: copy en.ts to <code>.ts, translate the values, and add one line below. A text missing from a language
 * file shows in Hebrew, so a partial file never breaks a screen.
 */
export type Lang = { code: string; name: string; short: string; dir: 'rtl' | 'ltr'; locale: string; dict: Record<string, string> | null };
export const LANGS: Lang[] = [
  { code: 'he', name: 'עברית', short: 'עב', dir: 'rtl', locale: 'he-IL', dict: null },
  { code: 'en', name: 'English', short: 'EN', dir: 'ltr', locale: 'en-GB', dict: en },
];

let cur: Lang = LANGS[0]!;
const KEY = 'ita_lang';

/** The text in the current language; {name} placeholders are filled from vars ("{n} שחקנים" -> "12 players"). */
export function tr(he: string, vars?: Record<string, string | number | null | undefined>) {
  const s = cur.dict?.[he] ?? he;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k] ?? '') : m)) : s;
}
export const lang = () => cur;
/** Dates and numbers in the current language's format. */
export const locale = () => cur.locale;
export const isRtl = () => cur.dir === 'rtl';
/** Text alignment at the start of a line: right in Hebrew, left in English. */
export const startAlign = () => ({ textAlign: isRtl() ? 'right' : 'left' }) as const;

export async function loadLang() {
  const saved = await SecureStore.getItemAsync(KEY).catch(() => null);
  cur = LANGS.find((l) => l.code === saved) ?? LANGS[0]!;
  return cur;
}
export async function setLang(code: string) {
  cur = LANGS.find((l) => l.code === code) ?? LANGS[0]!;
  await SecureStore.setItemAsync(KEY, cur.code).catch(() => {});
  return cur;
}
/** The language after the current one (the top-bar button cycles through them). */
export const nextLang = () => LANGS[(LANGS.indexOf(cur) + 1) % LANGS.length]!;
