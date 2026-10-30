import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkUser, resetDb } from './helpers';
import { abroadResultsOfPlayer, abroadUpcomingOfPlayer, acceptedWithLinks, hebrewKey, israelisIn, latinKey, linkKey, linkNewPlayers, listAbroadLinks, nameMatch, resolveAbroadLink, splitLatinName } from '@/services/abroad-players';
import { abroadEvent, importAbroad, importAbroadAcceptance, importAbroadResults, validateAbroadAcceptance, validateAbroadImport, validateAbroadResults } from '@/services/abroad';
import { searchPlayers } from '@/services/public';

const NOW = new Date('2026-10-30T12:00:00Z');
const player = async (first: string, last: string, birth: string, gender: 'MALE' | 'FEMALE' = 'MALE') => {
  const [p] = await db.insert(schema.players).values({ firstName: first, lastName: last, birthDate: new Date(birth), gender }).returning();
  return p!;
};

describe('matching a Latin name to a Hebrew one', () => {
  it('reduces both to their consonants', () => {
    expect(latinKey('Strauss')).toBe(hebrewKey('שטראוס'));
    expect(latinKey('Cohen')).toBe(hebrewKey('כהן'));
    expect(latinKey('Noam')).toBe(hebrewKey('נועם'));
    expect(latinKey('Zvi')).toBe(hebrewKey('צבי'));
    expect(splitLatinName('Ben STRAUSS')).toEqual({ first: 'Ben', last: 'STRAUSS' });
    expect(splitLatinName('Itay Ben DAVID')).toEqual({ first: 'Itay Ben', last: 'DAVID' });
    expect(splitLatinName('Itay Levi')).toEqual({ first: 'Itay', last: 'Levi' });
  });

  it('is exact on the same sound, close on one consonant, and nothing otherwise', () => {
    expect(nameMatch('Ben STRAUSS', 'בן', 'שטראוס')).toBe('exact');
    expect(nameMatch('Noam COHEN', 'נועם', 'כהן')).toBe('exact');
    expect(nameMatch('Noam COHEN', 'כהן', 'נועם')).toBe('exact'); // first and last swapped in the data
    expect(nameMatch('Itay LEVI', 'איתי', 'לוי')).toBe('close'); // the v of Levi is a vowel in Hebrew
    expect(nameMatch('Dan COHEN', 'נועם', 'כהן')).toBeNull();
    expect(nameMatch('Ai LI', 'אי', 'לי')).toBeNull(); // too little to go on
  });

  it('knows the Israelis in matches, with the gender from the draw', () => {
    const side = (n: string, cc: string) => ({ names: [n], cc: [cc], won: false, msg: '' });
    const m = (draw: string, a: string, b: string) => ({ day: '2026-10-29', draw, stage: 'R16', court: '', time: '', a: side(a, 'ISR'), b: side(b, 'GRE'), sets: [] });
    const seen = israelisIn([m('BS12 - Boys Singles 12 Playoff', 'Ben STRAUSS', 'X'), m('GS12 - Girls Singles 12 Main', 'Noa LEVI', 'Y'), m('XD14 - Mixed', 'Z', 'W')], 2026, 12);
    expect(seen.map((s) => [s.name, s.gender, s.year, s.age])).toEqual([['Ben STRAUSS', 'MALE', 2026, 12], ['Noa LEVI', 'FEMALE', 2026, 12]]);
  });
});

describe('linking the names seen abroad to the site\'s players', () => {
  beforeAll(resetDb);

  it('links one sure candidate at once, queues an unsure one, and looks only at the right gender and age', async () => {
    const ben = await player('בן', 'שטראוס', '2014-03-03');
    await player('בן', 'שטראוס', '2008-03-03'); // too old for U12
    await player('בנה', 'שטראוס', '2014-03-03', 'FEMALE'); // the other gender
    const twin1 = await player('נועם', 'כהן', '2014-01-01'), twin2 = await player('נועם', 'כהן', '2015-02-02');
    const stats = await linkNewPlayers(db, [
      { name: 'Ben STRAUSS', gender: 'MALE', year: 2026, age: 12 }, { name: 'Noam COHEN', gender: 'MALE', year: 2026, age: 12 }, { name: 'Nobody KNOWN', gender: 'MALE', year: 2026, age: 12 },
    ], NOW);
    expect(stats).toMatchObject({ checked: 3, auto: 1, pending: 1, none: 1 });
    const rows = await db.select().from(schema.abroadPlayerLinks);
    const by = (k: string) => rows.find((r) => r.key === linkKey(k, 'MALE'))!;
    expect(by('Ben STRAUSS')).toMatchObject({ status: 'AUTO', playerId: ben.id });
    expect(by('Noam COHEN')).toMatchObject({ status: 'PENDING', playerId: null });
    expect(new Set(by('Noam COHEN').candidates)).toEqual(new Set([twin1.id, twin2.id]));
    expect(by('Nobody KNOWN')).toMatchObject({ status: 'NONE' });
    // a second pass with nothing new reads nothing and changes nothing
    expect(await linkNewPlayers(db, [{ name: 'Ben STRAUSS', gender: 'MALE', year: 2026, age: 12 }], NOW)).toMatchObject({ checked: 0 });
  });

  it('looks again a week later at a name nobody matched, and never overrides the federation\'s decision', async () => {
    const late = await player('נובודי', 'קנון', '2014-06-06');
    expect(await linkNewPlayers(db, [{ name: 'Nobody KNOWN', gender: 'MALE', year: 2026, age: 12 }], new Date('2026-11-02T12:00:00Z'))).toMatchObject({ checked: 0 });
    expect(await linkNewPlayers(db, [{ name: 'Nobody KNOWN', gender: 'MALE', year: 2026, age: 12 }], new Date('2026-11-10T12:00:00Z'))).toMatchObject({ checked: 1, auto: 1 });
    expect((await db.select().from(schema.abroadPlayerLinks).where(eq(schema.abroadPlayerLinks.key, linkKey('Nobody KNOWN', 'MALE'))))[0]).toMatchObject({ status: 'AUTO', playerId: late.id });

    const { actor } = await mkUser('FEDERATION_ADMIN', 'fed@example.org');
    const pending = (await listAbroadLinks(db, actor)).filter((r) => r.link.status === 'PENDING');
    expect(pending).toHaveLength(1);
    await resolveAbroadLink(db, actor, pending[0]!.link.key, pending[0]!.candidates[0]!.id);
    await linkNewPlayers(db, [{ name: 'Noam COHEN', gender: 'MALE', year: 2026, age: 12 }], new Date('2026-12-30T12:00:00Z'));
    expect((await db.select().from(schema.abroadPlayerLinks).where(eq(schema.abroadPlayerLinks.key, pending[0]!.link.key)))[0]).toMatchObject({ status: 'CONFIRMED', playerId: pending[0]!.candidates[0]!.id });
    // only someone who may link players can decide
    const { actor: plain } = await mkUser('PLAYER', 'p@example.org');
    await expect(resolveAbroadLink(db, plain, pending[0]!.link.key, null)).rejects.toThrow();
  });
});

describe('a player\'s results abroad, and finding him by his Latin name', () => {
  beforeAll(resetDb);
  const E = '7D87510B-EAD5-459F-AA73-448502DEF587';
  const side = (n: string, cc: string, won = false) => ({ names: [n], cc: [cc], won, msg: '' });
  const match = (day: string, a: ReturnType<typeof side>, b: ReturnType<typeof side>, sets: number[][]) => ({ day, draw: 'BS12 - Boys Singles 12 Playoff', stage: 'Quarter final', court: 'Court 4', time: '12:30', a, b, sets });

  it('imports the results, links the player and gives his matches from his side', async () => {
    const ben = await player('בן', 'שטראוס', '2014-03-03');
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', circuit: 'TE', until: '2026-12-31', events: [{ id: E, name: 'NANA Golden Beach', venue: '', city: 'Heraklion', country: 'Greece', start: '2026-10-24', end: '2026-10-31', surface: '', category: 'Category 2', age: 12, closed: false, fee: '', hospitality: '', url: 'https://example.org/x' }] }), NOW);
    const stats = await importAbroadResults(db, validateAbroadResults({ kind: 'abroad-results', results: [{ id: E, days: ['2026-10-28', '2026-10-29'], matches: [
      match('2026-10-29', side('Ben STRAUSS', 'ISR', true), side('Loukas PANOUSIS', 'GRE'), [[6, 3], [6, 3]]),
      match('2026-10-28', side('Ioannis SEGKOS', 'GRE', true), side('Ben STRAUSS', 'ISR'), [[6, 4], [7, 5]]), // he is side b: the sets are turned to his side
    ] }] }), NOW);
    expect(stats).toMatchObject({ events: 1, matches: 2, links: { auto: 1 } });
    const res = await abroadResultsOfPlayer(db, ben.id);
    expect(res).toHaveLength(1);
    expect(res[0]!.event.name).toBe('NANA Golden Beach');
    expect(res[0]!.matches.map((m) => [m.day, m.won, m.opponent.names[0], m.sets])).toEqual([['2026-10-29', true, 'Loukas PANOUSIS', [[6, 3], [6, 3]]], ['2026-10-28', false, 'Ioannis SEGKOS', [[4, 6], [5, 7]]]]);
  });

  it('is found by the Latin name, and a player not linked has no results abroad', async () => {
    expect((await searchPlayers(db, 'Strauss', undefined, 10)).map((r) => r.p.lastName)).toEqual(['שטראוס']);
    expect((await searchPlayers(db, 'strauss ben', undefined, 10)).length).toBe(1);
    expect(await searchPlayers(db, 'Nobody', undefined, 10)).toHaveLength(0);
    const other = await player('דן', 'לוי', '2014-01-01');
    expect(await abroadResultsOfPlayer(db, other.id)).toEqual([]);
  });
});

describe('Israelis accepted to a tournament abroad', () => {
  beforeAll(resetDb);
  const E = '5B36FD97-B51E-416D-94EE-84F1B2DD2984';
  const acc = (label: string, ...rows: [string, number | null, string][]) => ({ label, active: rows.length, updated: '2026-10-23T09:20:00Z', players: rows.map(([name, born, nation], i) => ({ draw: 'Main', n: i + 1, name, nation, born, rank: '-', wtn: '' })) });

  it('keeps only the Israelis of a list, and sets the event\'s count and names', async () => {
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', circuit: 'TE', until: '2026-12-31', events: [{ id: E, name: 'Lyttos Beach U12 International Tournament', venue: '', city: 'Heraklion', country: 'Greece', start: '2026-11-02', end: '2026-11-07', surface: '', category: 'Category 2', age: 12, closed: false, fee: '', hospitality: '', url: 'https://example.org/x' }] }), NOW);
    const input = validateAbroadAcceptance({ kind: 'abroad-acceptance', events: [{ id: E, acceptance: [acc('GS12', ['Lia Winkler', 2014, 'Israel'], ['Maria Kalogeri', 2014, 'Greece']), acc('BS12', ['Nobody Else', 2014, 'Germany'])] }] });
    expect(input.events[0]!.acceptance).toHaveLength(1); // the boys' list had no Israeli
    expect(input.events[0]!.acceptance[0]!.players.map((p) => p.name)).toEqual(['Lia Winkler']);
    expect(await importAbroadAcceptance(db, input, NOW)).toMatchObject({ events: 1, players: 1 });
    const ev = await abroadEvent(db, E);
    expect(ev).toMatchObject({ registered: 1, registeredNames: ['lia winkler'] });
  });

  it('uses the year of birth: two girls with the same name, only one born that year, is a sure link', async () => {
    const right = await player('ליה', 'וינקלר', '2014-04-04', 'FEMALE');
    await player('ליה', 'וינקלר', '2015-05-05', 'FEMALE');
    const input = validateAbroadAcceptance({ kind: 'abroad-acceptance', events: [{ id: E, acceptance: [acc('GS12', ['Lia Winkler', 2014, 'Israel'])] }] });
    // the name was looked up before (nobody matched): a week later it is looked at again, now with the players there are
    expect(await importAbroadAcceptance(db, input, new Date('2026-11-10T12:00:00Z'))).toMatchObject({ links: { auto: 1 } });
    const accepted = await acceptedWithLinks(db, (await abroadEvent(db, E))!.acceptance!);
    expect(accepted[0]!.players[0]).toMatchObject({ name: 'Lia Winkler', born: 2014, player: { id: right.id } });
    expect((await abroadUpcomingOfPlayer(db, right.id)).map((x) => x.name)).toEqual(['Lyttos Beach U12 International Tournament']);
  });
});

describe('a batch with the same name twice', () => {
  beforeAll(resetDb);
  it('records the name once (the sure link wins) instead of failing the upsert', async () => {
    const dan = await player('דן', 'כהן', '2014-01-01');
    const stats = await linkNewPlayers(db, [
      { name: 'Dan COHEN', gender: 'MALE', year: 2026, age: 12, born: 2013 }, // seen in an event where nobody of that year matches
      { name: 'Dan COHEN', gender: 'MALE', year: 2026, age: 12, born: 2014 },
    ], NOW);
    expect(stats.checked).toBe(2);
    const rows = await db.select().from(schema.abroadPlayerLinks).where(eq(schema.abroadPlayerLinks.key, linkKey('Dan COHEN', 'MALE')));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'AUTO', playerId: dan.id });
  });
});
