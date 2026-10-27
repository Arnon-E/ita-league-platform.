import { describe, expect, it } from 'vitest';
import { buildTsCompetition, cleanPlayer, eventInfo, parseDayMatches, parseDraws, parseOrgList } from '../scripts/loglig-sync/tournamentsoftware.mjs';

const player = (id: number, name: string) => `<a href="/sport/player.aspx?id=x&amp;player=${id}" data-player-id="${id}" data-club-id="" data-nationality-id="" class="nav-link"><span class="nav-link__value">${name}</span> </a>`;
const row = (names: string[], extra = '', won = false) => `<div class="match__row ${won ? 'has-won' : ''}"><div class="match__row-title">${names.map((n, i) => `<div class="match__row-title-value"><span class="match__row-title-value-content">${player(i, n)}</span></div>`).join('')}</div>${extra}</div>`;
const sets = (s: [number, number][]) => `<div class="match__result">${s.map(([a, b]) => `<ul class="points"><li class="points__cell ">${a}</li><li class="points__cell ">${b}</li></ul>`).join('')}</div>`;
const match = (draw: string, stage: string, a: string[], b: string[], opts: { won?: 'a' | 'b'; sets?: [number, number][]; msgA?: string; msgB?: string } = {}) =>
  `<div class="match match--list"><div class="match__header"><ul class="match__header-title"><li class="match__header-title-item"><a href="/sport/draw.aspx?id=x&amp;draw=1"><span class="nav-link__value">${draw}</span></a></li><li class="match__header-title-item"><span title="${stage}"><span class="nav-link__value">${stage}</span></span></li></ul></div>`
  + `<div class="match__body"><div class="match__row-wrapper">${row(a, opts.msgA ? `<span class="tag match__message">${opts.msgA}</span>` : '', opts.won === 'a')}${row(b, opts.msgB ? `<span class="tag match__message">${opts.msgB}</span>` : '', opts.won === 'b')}</div>${sets(opts.sets ?? [])}</div><div class="match__footer"></div></div>`;
const day = (court: string, time: string, label: string, ...matches: string[]) =>
  `<h5 class="sticky is-sticky match-group__header text--center"> ${court} <span>Kiryat Motzkin Tennis Club</span> </h5><div class="match-group__subheader"><span class="nav-link"><span class="nav-link__value"><time datetime="${time}">${label}</time></span></span></div>${matches.join('')}`;

describe('tournamentsoftware (Israel Masters Tennis Tour)', () => {
  it('drops the phone and seed marks from a player and keeps first name then last name', () => {
    expect(cleanPlayer('ינון 0527773432 סגל')).toBe('ינון סגל');
    expect(cleanPlayer('בר 0525251402 פדידה')).toBe('בר פדידה');
    expect(cleanPlayer('ארז 050-6275958 עמר')).toBe('ארז עמר');
    expect(cleanPlayer('רפאל עזריה [1]')).toBe('רפאל עזריה');
    expect(cleanPlayer('Silvia 0545420201 DE STEFANI')).toBe('Silvia DE STEFANI');
    expect(cleanPlayer('אינדי 0529669360 ג&#39;אבר')).toBe("אינדי ג'אבר");
    // other groupings of the phone, stray numbers, a year in brackets and numeric HTML entities
    expect(cleanPlayer('ליאור 0543-161873 לקס')).toBe('ליאור לקס');
    expect(cleanPlayer('קתרין 0 שלו')).toBe('קתרין שלו');
    expect(cleanPlayer('Daniel (1977) ARONOVIC')).toBe('Daniel ARONOVIC');
    expect(cleanPlayer('Roni 70 GOLDMAN')).toBe('Roni GOLDMAN');
    expect(cleanPlayer('Le&#243;n SMEKE')).toBe('León SMEKE');
  });

  it('names an event in Hebrew with its gender', () => {
    expect(eventInfo('MS 40 (B)')).toMatchObject({ name: 'גברים 40 (B)', gender: 'MALE', doubles: false });
    expect(eventInfo('WS 18-30 (A)')).toMatchObject({ name: 'נשים 18-30 (A)', gender: 'FEMALE' });
    expect(eventInfo('MD 45 (A)')).toMatchObject({ name: 'זוגות גברים 45 (A)', gender: 'MALE', doubles: true });
    expect(eventInfo('XD (B)')).toMatchObject({ name: 'זוגות מעורבים (B)', gender: 'OPEN', doubles: true });
    expect(eventInfo('Something else')).toBeNull();
  });

  it('reads the organization list with the year taken from its heading', () => {
    const html = `<table><tr><th colspan="2">2026</th></tr><tr><td>10/23 to 11/14</td><td><a href="sport/tournament.aspx?id=5d93e903-85e6-4ab3-8713-a4f8d54aa77f">Masters Akko 2026</a></td></tr>
      <tr><td>12/20 to 01/05</td><td><a href="sport/tournament.aspx?id=11111111-2222-3333-4444-555555555555">Year end</a></td></tr><tr><th colspan="2">2025</th></tr>
      <tr><td>03/13 to 03/29</td><td><a href="sport/tournament.aspx?id=56a771c9-0000-0000-0000-000000000000">Masters Raanana 2025</a></td></tr></table>`;
    expect(parseOrgList(html)).toEqual([
      { id: '5D93E903-85E6-4AB3-8713-A4F8D54AA77F', name: 'Masters Akko 2026', start: '2026-10-23', end: '2026-11-14' },
      { id: '11111111-2222-3333-4444-555555555555', name: 'Year end', start: '2026-12-20', end: '2027-01-05' },
      { id: '56A771C9-0000-0000-0000-000000000000', name: 'Masters Raanana 2025', start: '2025-03-13', end: '2025-03-29' },
    ]);
  });

  it('reads the draws list (name, size, type)', () => {
    const html = `<table><tr><td><a href="draw.aspx?id=x&amp;draw=1">MS 40 (B) - Group 1</a></td><td>3</td><td>Round Robin</td></tr><tr><td><a href="draw.aspx?id=x&amp;draw=2">MS 40 (B)</a></td><td>2</td><td>Elimination</td></tr></table>`;
    expect(parseDraws(html)).toEqual([{ name: 'MS 40 (B) - Group 1', size: 3, type: 'Round Robin' }, { name: 'MS 40 (B)', size: 2, type: 'Elimination' }]);
  });

  it('turns match days into categories (groups and knockout), doubles, walkovers and retirements', () => {
    const html = day('Court 1', '08:00', '1. Not before 8:00 AM',
      match('MS 40 (B) - Group 1', 'Round 1', ['ינון 0527773432 סגל'], ['בר 0525251402 פדידה'], { won: 'a', sets: [[6, 3], [6, 4]] }),
      match('MS 40 (B)', 'Final', ['ינון 0527773432 סגל'], ['אילן 0543187077 בבושקין'], { won: 'b', sets: [[6, 7], [6, 4], [10, 12]] }))
      + day('Court 2', '09:30', '2. Starting at 9:30 AM',
        match('MD 18-30 (B)', 'Quarter final', ['יריב 0502057873 ברוכיאן', 'מוחמד 0524861886 רשואן'], ['ניב 0522841248 קורן', 'תומר 0528707483 שלום'], { won: 'b', msgA: 'Walkover' }),
        match('MS 40 (B) - Group 1', 'Round 2', ['א 1'], ['ב 2'], { won: 'a', sets: [[1, 2]], msgB: 'Retired' }),
        match('MS 40 (B) - Group 1', 'Round 3', ['ג 3'], ['ד 4']));
    const raw = parseDayMatches(html, '2026-05-30');
    expect(raw).toHaveLength(5);
    expect(raw[0]).toMatchObject({ draw: 'MS 40 (B) - Group 1', stage: 'Round 1', court: 'Court 1', time: '08:00', a: { names: ['ינון סגל'], won: true }, b: { names: ['בר פדידה'], won: false }, sets: [[6, 3], [6, 4]] });
    const { categories, doubles } = buildTsCompetition(raw, [{ name: 'MS 40 (B) - Group 1', size: 3, type: 'Round Robin' }, { name: 'MS 40 (B)', size: 2, type: 'Elimination' }]);
    expect(categories).toHaveLength(1);
    const c = categories[0]!;
    expect(c).toMatchObject({ name: 'גברים 40 (B)', gender: 'MALE', format: 'GROUPS_KNOCKOUT' });
    expect(c.matches[0]).toMatchObject({ stage: 'GROUP', group: 'בית 1', round: 1, kind: 'NB', venue: 'מגרש 1', done: true, a: { name: 'ינון סגל' }, b: { name: 'בר פדידה' }, start: '2026-05-30T05:00:00.000Z' });
    expect(c.matches[1]).toMatchObject({ stage: 'KO', round: 1, done: true, a: { name: 'ינון סגל' }, b: { name: 'אילן בבושקין' }, sets: [{ a: 6, b: 7 }, { a: 6, b: 4 }, { a: 10, b: 12, superTb: true }] });
    expect(c.matches[2]).toMatchObject({ retired: true, kind: 'St', done: true });
    expect(c.matches[3]).toMatchObject({ done: false, sets: [] }); // no winner yet
    expect(doubles).toHaveLength(1);
    expect(doubles[0]).toMatchObject({ name: 'זוגות גברים 18-30 (B)', gender: 'MALE' });
    expect(doubles[0]!.matches[0]).toMatchObject({ a: { name: 'יריב ברוכיאן / מוחמד רשואן' }, b: { name: 'ניב קורן / תומר שלום' }, walkover: true, done: true, winner: 'b' });
  });
});

describe('hourly refresh of the current day', () => {
  it('replaces only that day in the cached matches', async () => {
    const { replaceDay } = await import('../scripts/loglig-sync/tournamentsoftware.mjs');
    const raw = [{ day: '2026-10-24', n: 1 }, { day: '2026-10-25', n: 2 }, { day: '2026-10-26', n: 3 }];
    expect(replaceDay(raw, '2026-10-25', [{ day: '2026-10-25', n: 9 }, { day: '2026-10-25', n: 10 }])).toEqual([{ day: '2026-10-24', n: 1 }, { day: '2026-10-26', n: 3 }, { day: '2026-10-25', n: 9 }, { day: '2026-10-25', n: 10 }]);
    expect(replaceDay(raw, '2026-10-27', [])).toEqual(raw);
  });

  it('matches a tournamentsoftware name with the ita.co.il one by city and year', async () => {
    const { sameMasters } = await import('../scripts/loglig-sync/tournamentsoftware.mjs');
    expect(sameMasters('Masters Akko 2026', 'תחרות מאסטרס לאומית עכו 2026')).toBe(true);
    expect(sameMasters('Masters Akko 2025', 'תחרות מאסטרס לאומית עכו 2026')).toBe(false);
    expect(sameMasters('Masters Akko 2026', 'תחרות מאסטרס לאומית ירושלים 2026')).toBe(false);
    expect(sameMasters('Israel Masters Finals 2025', 'מאסטרס סוף שנה 2025')).toBe(true);
    expect(sameMasters('Maccabiah 2026 - Open', 'Maccabiah 2026 - Masters')).toBe(false);
  });
});
