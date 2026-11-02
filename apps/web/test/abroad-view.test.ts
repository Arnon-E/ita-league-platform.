import { describe, expect, it } from 'vitest';
import { catOf, catsPresent, drawActive, matchPending, pickCategory, pickTab, sortDraws } from '@/services/abroad-view';
import type { DrawMatch, ResultDraw, ResultMatch } from '@/services/abroad';

const side = (cc: string, won = false, names = ['X Y']) => ({ names, cc: names.map(() => cc), won, msg: '' });
const dm = (a: ReturnType<typeof side>, b: ReturnType<typeof side>, sets: number[][] = []): DrawMatch => ({ a: { names: a.names, cc: a.cc, won: a.won }, b: { names: b.names, cc: b.cc, won: b.won }, sets, date: '' });
const rm = (draw: string, sets: number[][], won = false): ResultMatch => ({ day: '2026-11-01', draw, stage: '', court: '', time: '', a: side('ISR', won), b: side('GRE'), sets });

describe('abroad event page view', () => {
  it('tells the category from a draw name or an acceptance label', () => {
    expect(catOf('BS12 - Boys Singles 12 Qualifying')).toBe('B');
    expect(catOf('GS12 - Group C')).toBe('G');
    expect(catOf('BS12')).toBe('B');
    expect(catOf('BD12 - Boys Doubles 12 Main Draw')).toBe('D');
    expect(catOf('GD14')).toBe('D');
    expect(catOf('XD16 - Mixed')).toBe('D');
    expect(catOf('Playoff')).toBeNull();
  });

  it('lists the categories present in a fixed order', () => {
    expect(catsPresent(['GS12 - Group A', 'BD12 - Doubles', 'BS12'])).toEqual(['B', 'G', 'D']);
    expect(catsPresent(['GS12'])).toEqual(['G']);
  });

  it('knows a draw an Israeli is still playing in', () => {
    const live: ResultDraw = { n: 1, name: 'BS12', kind: 'KO', rounds: [[dm(side('ISR'), side('GRE'))]] };
    const done: ResultDraw = { n: 2, name: 'BS12 B', kind: 'KO', rounds: [[dm(side('ISR', true), side('GRE'), [[6, 1]])]] };
    const empty: ResultDraw = { n: 3, name: 'BS12 C', kind: 'KO', rounds: [[dm(side('ISR'), { names: [], cc: [], won: false, msg: '' })]] };
    expect(drawActive(live)).toBe(true);
    expect(drawActive(done)).toBe(false);
    expect(drawActive(empty)).toBe(false);
  });

  it('puts knockout trees before groups', () => {
    const d = (n: number, kind: 'KO' | 'RR'): ResultDraw => ({ n, name: `d${n}`, kind, rounds: [] });
    expect(sortDraws([d(1, 'RR'), d(10, 'KO'), d(2, 'RR')]).map((x) => x.n)).toEqual([10, 1, 2]);
  });

  it('opens the category where an Israeli still plays, unless one is asked for', () => {
    const matches = [rm('BS12 - Group A', [[6, 1]], true), rm('GS12 - Group B', [])];
    expect(matchPending(matches[0]!)).toBe(false);
    expect(pickCategory(['B', 'G'], matches, [])).toBe('G');
    expect(pickCategory(['B', 'G'], matches, [], 'B')).toBe('B');
    expect(pickCategory(['B', 'G'], matches, [], 'D')).toBe('G');
    expect(pickCategory(['B', 'G'], [], [])).toBe('B');
    expect(pickCategory([], [], [])).toBeNull();
  });

  it('opens the first tab that has content', () => {
    expect(pickTab(['d', 'r'])).toBe('d');
    expect(pickTab(['m', 'd'], 'd')).toBe('d');
    expect(pickTab(['m'], 'r')).toBe('m');
    expect(pickTab([])).toBeNull();
  });
});
