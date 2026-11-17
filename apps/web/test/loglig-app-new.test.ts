import { describe, expect, it } from 'vitest';
import { drawState, newTitles } from '../scripts/loglig-sync/app-new.mjs';

const g = (title: string, ...ids: number[]) => ({ CompetitionTitle: title, categoriLIstItem: ids.map((TeamId) => ({ TeamId })) });

describe('app-new: competitions that appear on the app during the day', () => {
  const groups = [g('קדם מוקדמות ITF חיפה בנים', 46505), g('קדם מוקדמות ITF רמת השרון בנים', 46364), g('טסט', 1), g('ארצית פורים 2026', 2, 3), g('סבב המושבה 1', 4)];
  it('probes only titles the saved list lacks, that are not history and not probed in the last 6 hours', () => {
    const now = Date.parse('2026-11-17T17:00:00Z');
    const r = newTitles(groups, ['קדם מוקדמות ITF רמת השרון בנים'], { 'ארצית פורים 2026': 'past', 'סבב המושבה 1': now - 3600e3 }, now);
    expect(r).toEqual([{ title: 'קדם מוקדמות ITF חיפה בנים', teamIds: [46505] }]);
    expect(newTitles(groups, [], { 'סבב המושבה 1': now - 7 * 3600e3 }, now).map((x) => x.title)).toContain('סבב המושבה 1');
  });
  it('tells a draw that is on from one that is over or not out yet', () => {
    expect(drawState(['2026-11-18', '2026-11-18'], '2026-11-17')).toBe('current');
    expect(drawState(['2026-11-15', '2026-11-16'], '2026-11-17')).toBe('current');
    expect(drawState(['2026-11-11', '2026-11-13'], '2026-11-17')).toBe('past');
    expect(drawState(['1753-01-01'], '2026-11-17')).toBe('none');
    expect(drawState([], '2026-11-17')).toBe('none');
  });
});
