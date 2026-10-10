import { describe, expect, it } from 'vitest';
import { ageOf, genderOf, israelToUtc, koRound, parseCategoryPage, parseCompetitionPage, parseDateRange, parsePlayer, parseScore } from '../scripts/loglig-sync/parse.mjs';

describe('loglig page parsing', () => {
  it('reads Hebrew date ranges', () => {
    expect(parseDateRange('18 - 20 בספטמבר 2026')).toEqual({ start: '2026-09-18', end: '2026-09-20' });
    expect(parseDateRange('27 בספטמבר - 3 באוקטובר 2026')).toEqual({ start: '2026-09-27', end: '2026-10-03' });
    expect(parseDateRange('15 בנובמבר 2026')).toEqual({ start: '2026-11-15', end: '2026-11-15' });
    expect(parseDateRange('בקרוב')).toBeNull();
  });

  it('reads scores, super tiebreaks and retirements', () => {
    expect(parseScore('6-3 7-5').sets).toEqual([{ a: 6, b: 3 }, { a: 7, b: 5 }]);
    expect(parseScore('2-6 6-4 7-10').sets[2]).toEqual({ a: 7, b: 10, superTb: true });
    expect(parseScore('6-6 Ret').retired).toBe(true);
    expect(parseScore('').sets).toEqual([]);
  });

  it('splits players, genders, ages and knockout rounds', () => {
    expect(parsePlayer('יאיר אמסלם - מרכזי הטניס והחינוך בישראל – טבריה')).toEqual({ name: 'יאיר אמסלם', club: 'מרכזי הטניס והחינוך בישראל – טבריה' });
    expect(genderOf('בנות 14')).toBe('FEMALE');
    expect(genderOf('בנים 12 פלייאוף')).toBe('MALE');
    expect(ageOf('בנים 16')).toBe(16);
    expect(koRound('1 - 2')).toMatchObject({ place: 1, size: 2, depthFromFinal: 0 });
    expect(koRound('1 - 16')).toMatchObject({ depthFromFinal: 3 });
    expect(koRound('3 - 4')).toMatchObject({ place: 3, size: 4 });
  });

  it('converts Israel local time to UTC across daylight saving', () => {
    expect(israelToUtc('2026-07-01T10:00')).toBe('2026-07-01T07:00:00.000Z'); // UTC+3
    expect(israelToUtc('2026-12-01T10:00')).toBe('2026-12-01T08:00:00.000Z'); // UTC+2
  });

  it('parses a competition page and a category page', () => {
    const page = `<h1>אליפות בדיקה 2026</h1><div>מוקדמות</div><p>מועדי המשחקים: 18 - 20 בספטמבר 2026</p><p>דמי השתתפות: 180 ש"ח</p>
      <p>שם המועדון: מועדון הטניס רעננה</p><p>כתובת: רח' יאיר שטרן 3 רעננה</p>
      <h3>הגרלות המוקדמות</h3><iframe src="https://loglig.com:2053/LeagueTable/SchedulesForTennisCompetition/111?seasonId=1755"></iframe>
      <h3>הגרלות בית הגמר</h3><iframe data-src="https://loglig.com:2053/LeagueTable/SchedulesForTennisCompetition/222?seasonId=1755"></iframe>`;
    const c = parseCompetitionPage(page);
    expect(c).toMatchObject({ name: 'אליפות בדיקה 2026', start: '2026-09-18', end: '2026-09-20', feeShekel: 180, isDoubles: false });
    expect(c.venues[0]).toEqual({ club: 'מועדון הטניס רעננה', address: "רח' יאיר שטרן 3 רעננה" });
    expect(c.categories).toEqual([{ id: '111', seasonId: '1755', section: 'qualifying' }, { id: '222', seasonId: '1755', section: 'finals' }]);

    const row = (cells: string[]) => `<tr>${cells.map((x) => `<td>${x}</td>`).join('')}</tr>`;
    const cat = `<h3>אליפות בדיקה 2026 / בנים 12 - לוח משחקים ותוצאות</h3><table>
      ${row(['נגמר', 'מרכז הטניס', 'בנים 12 פלייאוף', '1 - 2', '04/10/2026 13:00', 'St', '', 'ירין מרקוביץ - מועדון א', '-', 'מיכאל רוגצקי - מועדון ב', '', '6-3 7-5'])}
      ${row(['', '', 'בית 1', '', '30/09/2026 09:00', 'NB', '', 'א ב - ק', '-', 'ג ד - ל', '', ''])}</table>`;
    const p = parseCategoryPage(cat);
    expect(p).toMatchObject({ competition: 'אליפות בדיקה 2026', category: 'בנים 12' });
    expect(p.matches.length).toBe(2);
    expect(p.matches[0]!).toMatchObject({ done: true, stage: 'בנים 12 פלייאוף', slot: '1 - 2', kind: 'St', a: { name: 'ירין מרקוביץ' } });
    expect(p.matches[0]!.sets).toEqual([{ a: 6, b: 3 }, { a: 7, b: 5 }]);
    expect(p.matches[1]!).toMatchObject({ done: false, stage: 'בית 1', kind: 'NB' });
  });
});
