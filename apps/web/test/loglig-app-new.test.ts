import { describe, expect, it } from 'vitest';
import { drawState, newTitles } from '../scripts/loglig-sync/app-new.mjs';
import { pickSeasons } from '../scripts/loglig-sync/seasons.mjs';

const g = (title: string, season: number, ...ids: number[]) => ({ CompetitionTitle: title, season, categoriLIstItem: ids.map((TeamId) => ({ TeamId })) });

describe('app-new: competitions on the Loglig app that the site lacks', () => {
  const now = Date.parse('2026-11-17T17:00:00Z');
  const groups = [g('קדם מוקדמות ITF חיפה בנים', 1755, 46505), g('קדם מוקדמות ITF רמת השרון בנים', 1755, 46364), g('טסט', 1755, 1), g('ארצית פורים 2026', 1755, 2, 3), g('סבב המושבה 1', 1755, 4), g('סבב קיסריה 1', 1671, 5)];
  it('probes the titles the site lacks that are not history', () => {
    const r = newTitles(groups, ['קדם מוקדמות ITF רמת השרון בנים'], { 'ארצית פורים 2026': 'past' }, 1755, now);
    expect(r.map((x) => x.title)).toEqual(['קדם מוקדמות ITF חיפה בנים', 'סבב המושבה 1', 'סבב קיסריה 1']);
    expect(r[0]).toEqual({ title: 'קדם מוקדמות ITF חיפה בנים', season: 1755, teamIds: [46505] });
  });
  it('a title without a draw: every hour in the newest season, once a day in an older one', () => {
    const state = { 'סבב המושבה 1': now - 3600e3, 'סבב קיסריה 1': now - 3600e3 };
    const titles = (s: Record<string, number>) => newTitles(groups, ['קדם מוקדמות ITF חיפה בנים', 'קדם מוקדמות ITF רמת השרון בנים', 'ארצית פורים 2026'], s, 1755, now).map((x) => x.title);
    expect(titles(state)).toEqual(['סבב המושבה 1']);
    expect(titles({ ...state, 'סבב קיסריה 1': now - 25 * 3600e3 })).toEqual(['סבב המושבה 1', 'סבב קיסריה 1']);
  });
  it('a competition on the site under the other site\'s title is not new', () => {
    expect(newTitles([g('אליפות ישראל לנוער - סוכות 2026', 1755, 9)], ['אליפות ישראל לנוער סוכות 2026'], {}, 1755, now)).toEqual([]);
  });
  it('tells a draw that is on from one that is over or not out yet', () => {
    expect(drawState(['2026-11-18', '2026-11-18'], '2026-11-17')).toBe('current');
    expect(drawState(['2026-11-15', '2026-11-16'], '2026-11-17')).toBe('current');
    expect(drawState(['2026-11-11', '2026-11-13'], '2026-11-17')).toBe('past');
    expect(drawState(['1753-01-01'], '2026-11-17')).toBe('none');
    expect(drawState([], '2026-11-17')).toBe('none');
  });
});

describe('Loglig seasons', () => {
  const list = [{ Id: 1671, startDate: '2025-01-01T00:00:00' }, { Id: 1755, startDate: '2026-01-15T21:45:00' }, { Id: 1559, startDate: '2024-01-01T00:00:00' }];
  it('reads the two newest, and the one under way', () => {
    expect(pickSeasons(list, new Date('2026-11-17'))).toEqual({ recent: [1755, 1671], active: 1755 });
  });
  it('follows a new season on its own, also when it is opened before it starts', () => {
    const next = [...list, { Id: 1900, startDate: '2027-01-14T22:00:00' }];
    expect(pickSeasons(next, new Date('2026-12-20'))).toEqual({ recent: [1900, 1755], active: 1755 });
    expect(pickSeasons(next, new Date('2027-01-20'))).toEqual({ recent: [1900, 1755], active: 1900 });
  });
  it('an empty or broken answer falls back to the 2026 ids', () => {
    expect(pickSeasons([], new Date('2026-11-17'))).toEqual({ recent: [1755, 1671], active: 1755 });
  });
});
