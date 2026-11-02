import type { DrawMatch, ResultDraw, ResultMatch } from '@/services/abroad';

/** The event page is shown one category at a time: boys, girls or doubles (any doubles draw, boys', girls' or mixed). */
export type AbroadCat = 'B' | 'G' | 'D';
export type AbroadTab = 'm' | 'd' | 'r';
export const CATS: AbroadCat[] = ['B', 'G', 'D'];
export const TABS: AbroadTab[] = ['m', 'd', 'r'];

/** "BS12 - Boys Singles 12 Qualifying", "GD14 - ...", "BS12" (an acceptance list label): which category it belongs to; null when it cannot be told. */
export function catOf(name: string): AbroadCat | null {
  const s = name.trim();
  if (/doubles|^(BD|GD|XD|MD|WD)\b/i.test(s) || /^(BD|GD|XD)\d/i.test(s)) return 'D';
  if (/^B/i.test(s)) return 'B';
  if (/^G/i.test(s)) return 'G';
  return null;
}

/** A stored draw: rows saved before groups were told apart from trees have no `kind` (they are trees). */
export type DrawLike = Pick<ResultDraw, 'n' | 'name' | 'rounds'> & { kind?: 'KO' | 'RR' };

const ISR = (m: DrawMatch) => [...m.a.cc, ...m.b.cc].includes('ISR');
/** A match that is set (both sides known), has an Israeli side and no winner yet. */
const pending = (m: DrawMatch) => ISR(m) && m.a.names.length > 0 && m.b.names.length > 0 && !m.a.won && !m.b.won;

/** A draw an Israeli is still playing in. */
export const drawActive = (d: DrawLike) => d.rounds.some((round) => round.some(pending));

/** Knockout trees first, then the groups: the trees are what people look for. */
export const sortDraws = <T extends DrawLike>(draws: T[]) => [...draws].sort((a, b) => Number(a.kind === 'RR') - Number(b.kind === 'RR') || a.n - b.n);

/** A match of an Israeli with no result yet. */
export const matchPending = (m: ResultMatch) => !m.sets.length && !m.a.won && !m.b.won;

/** The categories that have anything to show, in the fixed order boys, girls, doubles. */
export function catsPresent(names: string[]): AbroadCat[] {
  const have = new Set(names.map(catOf));
  return CATS.filter((c) => have.has(c));
}

/** The category to open first: one where an Israeli is still to play, else the first that has anything. */
export function pickCategory(cats: AbroadCat[], matches: ResultMatch[], draws: DrawLike[], asked?: string): AbroadCat | null {
  if (asked && (cats as string[]).includes(asked)) return asked as AbroadCat;
  return cats.find((c) => matches.some((m) => catOf(m.draw) === c && matchPending(m)) || draws.some((d) => catOf(d.name) === c && drawActive(d))) ?? cats[0] ?? null;
}

/** The tab to open first: today's matches when there are matches, else the draws, else who is registered. */
export function pickTab(available: AbroadTab[], asked?: string): AbroadTab | null {
  if (asked && (available as string[]).includes(asked)) return asked as AbroadTab;
  return available[0] ?? null;
}
