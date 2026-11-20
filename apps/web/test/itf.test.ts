import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { catOf, catsPresent } from '@/services/abroad-view';
import { validateAbroadResults } from '@/services/abroad';
import { drawFromSheet, drawName, drawOrder, drawsOf, eventPage, isWall, matchesFromOrderOfPlay, setsOf, titleName } from '../scripts/loglig-sync/itf.mjs';

const fixture = (n: string) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

describe('ITF juniors (world.tennis)', () => {
  it('writes names typed by hand in any case the same way', () => {
    expect(titleName('amit keinan')).toBe('Amit Keinan');
    expect(titleName('URI  STRETINER')).toBe('Uri Stretiner');
    expect(titleName("o'brien-smith")).toBe("O'Brien-Smith");
  });

  it('lists the draws of an event from its filters', () => {
    const d = drawsOf(fixture('itf-filters.json'));
    expect(d.map((x: { pt: string; mt: string; ec: string }) => `${x.pt}${x.mt}${x.ec}`)).toEqual(['BSM', 'BSQ', 'BDM', 'GSM', 'GSQ', 'GDM']);
  });

  it('names draws so that the page sorts them into boys, girls and doubles', () => {
    expect(catOf(drawName('B', 'S', 'M'))).toBe('B');
    expect(catOf(drawName('G', 'S', 'Q'))).toBe('G');
    expect(catOf(drawName('B', 'D', 'M'))).toBe('D');
    expect(catsPresent([drawName('B', 'S', 'M'), drawName('G', 'D', 'M')])).toEqual(['B', 'D']);
    expect(drawOrder({ pt: 'B', mt: 'S', ec: 'M' })).toBeLessThan(drawOrder({ pt: 'B', mt: 'D', ec: 'M' }));
    expect(drawOrder({ pt: 'B', mt: 'D', ec: 'M' })).toBeLessThan(drawOrder({ pt: 'B', mt: 'S', ec: 'Q' }));
  });

  it('turns a drawsheet into rounds with names, nations, winners and set scores', () => {
    const draw = drawFromSheet(fixture('itf-drawsheet-bsq.json'), { pt: 'B', mt: 'S', ec: 'Q', ds: 'KO' }, 3);
    expect(draw.rounds.map((r: unknown[]) => r.length)).toEqual([16, 8, 4]);
    const m = draw.rounds[0].find((x: { sets: number[][] }) => x.sets.length) as { a: { names: string[]; cc: string[]; won: boolean }; b: { won: boolean }; sets: number[][] };
    expect(m.a.names[0]).toMatch(/^[A-Z][a-z]+ [A-Z]/);
    expect(m.a.cc[0]).toMatch(/^[A-Z]{3}$/);
    expect(m.a.won !== m.b.won).toBe(true);
    expect(m.sets.every((s) => s.length === 2 && s.every(Number.isInteger))).toBe(true);
  });

  it('reads set scores up to the first set not played', () => {
    const t = (s: (number | null)[]) => ({ scores: s.map((x) => (x === null ? null : { score: x, losingScore: null })) });
    expect(setsOf([t([6, 4, null, null, null]), t([3, 6, null, null, null])])).toEqual([[6, 3], [4, 6]]);
    expect(setsOf([t([null, null, null, null, null]), t([null, null, null, null, null])])).toEqual([]);
  });

  it('turns a day of the order of play into matches, with the time of play and the court', () => {
    const ms = matchesFromOrderOfPlay('2026-11-20', fixture('itf-orderofplay.json'));
    expect(ms.length).toBeGreaterThan(0);
    expect(ms[0]).toMatchObject({ day: '2026-11-20', court: 'Court 1', time: '11:00', draw: drawName('G', 'D', 'M'), stage: 'Semi-final' });
    expect(ms.every((x: { time: string }) => x.time === '' || /^\d{1,2}:\d{2}$/.test(x.time))).toBe(true);
  });

  it('is accepted whole by the importer (the site keeps matches that have an Israeli side)', () => {
    const draw = drawFromSheet(fixture('itf-drawsheet-bsq.json'), { pt: 'B', mt: 'S', ec: 'Q', ds: 'KO' }, 3);
    const out = validateAbroadResults({ kind: 'abroad-results', results: [{ id: 'J-J30-ISR-2026-001', days: ['2026-11-20'], matches: matchesFromOrderOfPlay('2026-11-20', fixture('itf-orderofplay.json')), draws: [draw] }] });
    expect(out.results[0]!.id).toBe('J-J30-ISR-2026-001');
    expect(out.results[0]!.matches.length).toBeGreaterThan(0);
    expect(out.results[0]!.draws![0]!.rounds.map((r) => r.length)).toEqual([16, 8, 4]);
  });

  it('knows the bot wall from the API\'s JSON', () => {
    expect(isWall('<html><script src="/_Incapsula_Resource?x"></script></html>')).toBe(true);
    expect(isWall('[{"courtName":"Court 1"}]')).toBe(false);
    expect(eventPage('j30-ramat-hasharon-(closed)', 'J-J30-ISR-2026-001')).toBe('https://www.world.tennis/en/tournament/j30-ramat-hasharon-(closed)/isr/2026/j-j30-isr-2026-001/');
  });
});
