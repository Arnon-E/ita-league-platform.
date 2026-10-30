import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { matchDays, parseDrawContent, parseEntryDates, parseFactsheet, parseSearch } from '../scripts/loglig-sync/abroad.mjs';
import { parseDayMatches } from '../scripts/loglig-sync/tournamentsoftware.mjs';
import { abroadCatalog, abroadEvent, entryState, importAbroad, importAbroadResults, phaseOf, validateAbroadImport, validateAbroadResults } from '@/services/abroad';
import { countryInfo, flagEmoji } from '@/lib/countries';

const fixture = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

describe('Tennis Europe parsers (real pages)', () => {
  it('reads a page of search results: name, place, dates, surface, category and age group', () => {
    const rows = parseSearch(fixture('te-search.html')) as { id: string; name: string; city: string; country: string; start: string; end: string; category: string; age: number; surface: string; closed: boolean }[];
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ id: '8D96D7A4-AD04-4FAA-977A-EC491BEA6CFF', name: 'ATIK CUP', city: 'Antalya', country: 'Turkiye', start: '2026-11-02', end: '2026-11-07', category: 'Category 2', age: 14, surface: 'Asphalt', closed: false });
    expect(rows.find((r) => r.name === 'TE 14 - HAIFA')).toMatchObject({ country: 'Israel', closed: true });
    expect(rows.find((r) => r.name === 'Vierumäki Cup 6')).toMatchObject({ age: 12, city: 'Vierumäki' });
    // a venue line with two clubs keeps both; the city stays the last part
    expect(rows.find((r) => r.name.startsWith('Lexus Junior International Liverpool'))).toMatchObject({ city: 'Liverpool', country: 'Great Britain' });
  });

  it('reads the entry dates, with the year taken from the start of the event', () => {
    const text = fixture('te-event.html').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(parseEntryDates(text, '2026-11-02')).toEqual({ entryOpens: '2026-09-07T00:00:00.000Z', entryDeadline: '2026-10-06T14:00:00.000Z', withdrawalDeadline: '2026-10-20T14:00:00.000Z' });
    expect(parseEntryDates('Entry opens Mon 7 Dec 00:00 GMT Entry deadline Tue 5 Jan 14:00 GMT', '2027-01-11')).toMatchObject({ entryOpens: '2026-12-07T00:00:00.000Z', entryDeadline: '2027-01-05T14:00:00.000Z' });
    expect(parseEntryDates('nothing here', '2026-11-02')).toEqual({ entryOpens: null, entryDeadline: null, withdrawalDeadline: null });
  });

  it('reads the fee, hospitality and court type from the fact sheet', () => {
    expect(parseFactsheet(fixture('te-factsheet.html'))).toEqual({ fee: '80 Euro MD 70 Euro QD', hospitality: 'For National Squads: Lunch and Dinner until last member of the squad is eliminated.', indoor: false });
    // "None" typed by an organizer is an empty field, not a condition
    expect(parseFactsheet('<p>Hospitality: None Entry Fee: MD 75/QD 70 Draws: BS14</p><p>Location type: Indoors</p>')).toEqual({ fee: 'MD 75/QD 70', hospitality: '', indoor: true });
  });
});

describe('abroad events in the database', () => {
  beforeAll(resetDb);
  const NOW = new Date('2026-10-29T12:00:00Z');
  const ev = (id: string, name: string, start: string, end: string, extra: object = {}) => ({
    id, name, venue: 'Club', city: 'Antalya', country: 'Turkiye', start, end, surface: 'Clay', category: 'Category 2', age: 14, closed: false, entryOpens: '2026-09-01T00:00:00Z', entryDeadline: '2026-11-20T14:00:00Z', withdrawalDeadline: null, fee: '80 Euro', hospitality: '', indoor: false, url: `https://te.tournamentsoftware.com/tournament/${id.toLowerCase()}`, ...extra,
  });
  const A = '8D96D7A4-AD04-4FAA-977A-EC491BEA6CFF', B = '4F42640A-EF8A-4BD9-A603-9FCE5F22ABF8', C = '5B36FD97-B51E-416D-94EE-84F1B2DD2984';
  const ids = async () => (await db.select({ id: schema.abroadEvents.id }).from(schema.abroadEvents)).map((r) => r.id).sort();

  it('adds events, updates the ones already there, and ignores bad rows', async () => {
    const input = validateAbroadImport({ kind: 'abroad', until: '2026-12-31', events: [ev(A, 'ATIK CUP', '2026-12-02', '2026-12-07'), ev(B, 'Kalymnos Cup', '2026-12-09', '2026-12-14'), { id: 'x', name: 'bad', start: '2026-12-01', end: '2026-12-02' }, ev(A, 'dup', '2026-12-02', '2026-12-07')] });
    expect(input.events).toHaveLength(2);
    expect(await importAbroad(db, input, NOW)).toMatchObject({ events: 2, removed: 0 });
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', until: '2026-12-31', events: [ev(A, 'ATIK CUP 2026', '2026-12-02', '2026-12-07', { fee: '90 Euro' }), ev(B, 'Kalymnos Cup', '2026-12-09', '2026-12-14')] }), NOW);
    const [row] = await db.select().from(schema.abroadEvents).where(eq(schema.abroadEvents.id, A));
    expect(row).toMatchObject({ name: 'ATIK CUP 2026', fee: '90 Euro', ageGroup: 14, category: 'Category 2', indoor: false });
    expect(await ids()).toEqual([A, B].sort());
  });

  it('drops an upcoming event the organizer removed, but only inside the range the sync looked at', async () => {
    // C starts after `until`: untouched; B is inside the range and no longer listed: removed
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', until: '2026-12-31', events: [ev(C, 'Lyttos', '2027-02-01', '2027-02-06'), ev(A, 'ATIK CUP 2026', '2026-12-02', '2026-12-07')] }), NOW);
    expect(await ids()).toEqual([A, C].sort());
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', until: '2026-12-31', events: [ev(A, 'ATIK CUP 2026', '2026-12-02', '2026-12-07')] }), NOW);
    expect(await ids()).toEqual([A, C].sort());
  });

  it('removes events that ended more than a week ago', async () => {
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', until: '2026-12-31', events: [ev(A, 'ATIK CUP 2026', '2026-12-02', '2026-12-07')] }), new Date('2026-12-20T12:00:00Z'));
    expect(await ids()).toEqual([C]);
    expect(Array.isArray(await abroadCatalog(db))).toBe(true);
  });

  it('tells whether a player can still enter', () => {
    const e = (opens: string | null, deadline: string | null) => ({ entryOpens: opens ? new Date(opens) : null, entryDeadline: deadline ? new Date(deadline) : null, start: new Date('2026-12-02') });
    expect(entryState(e('2026-09-01', '2026-11-20'), NOW)).toBe('open');
    expect(entryState(e('2026-11-01', '2026-11-20'), NOW)).toBe('soon');
    expect(entryState(e('2026-09-01', '2026-10-06'), NOW)).toBe('closed');
    expect(entryState(e(null, null), NOW)).toBe('unknown');
  });
});

describe('the two circuits are kept apart', () => {
  beforeAll(resetDb);
  const NOW = new Date('2026-10-29T12:00:00Z');


  it('a sync of one circuit never removes the other circuit\'s events', async () => {
    const base = { venue: '', city: 'X', country: 'Y', surface: '', category: 'Category 2', age: 14, closed: false, entryOpens: null, entryDeadline: null, withdrawalDeadline: null, fee: '', hospitality: '', indoor: null, url: 'https://example.org/x' };
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', circuit: 'TE', until: '2026-12-31', events: [{ ...base, id: '8D96D7A4-AD04-4FAA-977A-EC491BEA6CFF', name: 'TE one', start: '2026-12-02', end: '2026-12-07' }] }), NOW);
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', circuit: 'ITF', until: '2026-12-31', events: [{ ...base, id: 'J-J30-CYP-2026-005', name: 'J30 Larnaca', category: 'J30', age: null, start: '2026-12-03', end: '2026-12-08' }] }), NOW);
    const rows = await db.select({ id: schema.abroadEvents.id, circuit: schema.abroadEvents.circuit }).from(schema.abroadEvents);
    expect(rows.map((r) => `${r.circuit}:${r.id}`).sort()).toEqual(['ITF:J-J30-CYP-2026-005', 'TE:8D96D7A4-AD04-4FAA-977A-EC491BEA6CFF']);
    // the TE list now lacks its event: only the TE row goes
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', circuit: 'TE', until: '2026-12-31', events: [{ ...base, id: '4F42640A-EF8A-4BD9-A603-9FCE5F22ABF8', name: 'TE two', start: '2026-12-09', end: '2026-12-14' }] }), NOW);
    expect((await db.select({ id: schema.abroadEvents.id }).from(schema.abroadEvents)).map((r) => r.id).sort()).toEqual(['4F42640A-EF8A-4BD9-A603-9FCE5F22ABF8', 'J-J30-CYP-2026-005']);
  });
});

describe('countries', () => {
  it('knows the flag and the Hebrew name of the countries the circuits list', () => {
    expect(countryInfo('Turkiye')).toEqual({ cc: 'tr', he: 'טורקיה' });
    expect(countryInfo('Korea, Rep.')).toEqual({ cc: 'kr', he: 'דרום קוריאה' });
    expect(countryInfo('Atlantis')).toEqual({ cc: null, he: 'Atlantis' });
    expect(flagEmoji('il')).toBe('🇮🇱');
    expect(flagEmoji(null)).toBe('');
  });
});

describe('phase of an event', () => {
  it('is upcoming before the first day, live during, and done after the last', () => {
    const e = { start: new Date('2026-11-02T00:00:00Z'), end: new Date('2026-11-08T23:59:59Z') };
    expect(phaseOf(e, new Date('2026-10-30T12:00:00Z'))).toBe('up');
    expect(phaseOf(e, new Date('2026-11-05T12:00:00Z'))).toBe('live');
    expect(phaseOf(e, new Date('2026-11-09T09:00:00Z'))).toBe('done');
  });
});

describe('matches of Israeli players abroad', () => {
  beforeAll(resetDb);
  const NOW = new Date('2026-10-29T12:00:00Z');
  const A = '1595C1E2-4A15-4B56-B17B-B11CD58AC463';
  const base = { venue: '', city: 'Villingen', country: 'Germany', surface: '', category: 'Category 3', age: 14, closed: false, entryOpens: null, entryDeadline: null, withdrawalDeadline: null, fee: '', hospitality: '', indoor: null, url: 'https://example.org/x' };
  const m = (day: string, time: string, isr: boolean) => ({ day, draw: 'BS14 - Boys Singles 14 Main Draw', stage: 'Round of 16', court: 'C 1', time, a: { names: ['Luka BOH'], cc: [isr ? 'ISR' : 'SLO'], won: false, msg: '' }, b: { names: ['Constantin SZPAKOWSKI'], cc: ['GER'], won: true, msg: '' }, sets: [[6, 4], [2, 6], [4, 6]] });

  it('reads the nation of each player and the match days of an event from the real pages', () => {
    const day = readFileSync(new URL('./fixtures/te-day.html', import.meta.url), 'utf8');
    const rows = parseDayMatches(day, '2026-10-29') as { a: { cc: string[]; names: string[] }; b: { cc: string[] } }[];
    expect(rows).toHaveLength(22);
    expect(rows[0]!.a).toMatchObject({ names: ['Luka BOH'], cc: ['SLO'] });
    expect(rows[0]!.b.cc).toEqual(['GER']);
    // with an Israeli flag on a side it is found (the sync keeps only such matches)
    expect((parseDayMatches(day.replace(/SLO/g, 'ISR'), '2026-10-29') as { a: { cc: string[] } }[]).filter((r) => r.a.cc.includes('ISR'))).toHaveLength(1);
    const days = matchDays(readFileSync(new URL('./fixtures/te-matches.html', import.meta.url), 'utf8'));
    expect(days[0]).toBe('20261024');
    expect(days).toContain('20261029');
    expect(days).toContain('20261101');
  });

  it('keeps only the matches with an Israeli player, and replaces only the days that were read', async () => {
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', circuit: 'TE', until: '2026-12-31', events: [{ ...base, id: A, name: 'VS Tennis Academy U14 Villingen Open', start: '2026-10-24', end: '2026-11-01' }] }), NOW);
    // two days read: only the Israeli matches stay
    const first = validateAbroadResults({ kind: 'abroad-results', results: [{ id: A, days: ['2026-10-28', '2026-10-29'], matches: [m('2026-10-28', '09:00', true), m('2026-10-28', '10:00', false), m('2026-10-29', '09:00', true)] }] });
    expect(first.results[0]!.matches).toHaveLength(2);
    expect(await importAbroadResults(db, first, NOW)).toMatchObject({ events: 1, matches: 2 });
    // the hourly refresh reads only today: today's matches are replaced, yesterday's stay
    await importAbroadResults(db, validateAbroadResults({ kind: 'abroad-results', results: [{ id: A, days: ['2026-10-29'], matches: [m('2026-10-29', '09:00', true), m('2026-10-29', '11:30', true)] }] }), new Date('2026-10-29T14:00:00Z'));
    const ev = await abroadEvent(db, A.toLowerCase());
    expect(ev!.results!.matches.map((x) => `${x.day} ${x.time}`)).toEqual(['2026-10-28 09:00', '2026-10-29 09:00', '2026-10-29 11:30']);
    expect(ev!.results!.days).toEqual(['2026-10-28', '2026-10-29']);
    expect((await abroadCatalog(db)).find((r) => r.id === A)!.israelis).toBe(3);
  });

  it('ignores results for an event it does not know and bad rows', async () => {
    const bad = validateAbroadResults({ kind: 'abroad-results', results: [{ id: 'not an id', days: [], matches: [] }, { id: '0EDF3889-7C03-4427-B261-E5C54EC3B579', days: ['2026-10-29'], matches: [m('2026-10-29', '09:00', true), { day: 'x' }] }] });
    expect(bad.results).toHaveLength(1);
    expect(await importAbroadResults(db, bad, NOW)).toMatchObject({ events: 0 });
  });
});

describe('knockout draws of an event', () => {
  beforeAll(resetDb);
  const NOW = new Date('2026-10-29T12:00:00Z');
  const A = '7D87510B-EAD5-459F-AA73-448502DEF587';
  const base = { venue: '', city: 'Heraklion', country: 'Greece', surface: '', category: 'Category 2', age: 12, closed: false, entryOpens: null, entryDeadline: null, withdrawalDeadline: null, fee: '', hospitality: '', indoor: null, url: 'https://example.org/x' };

  it('reads the tree of a real draw: the rounds, the players with their flags, the sets and who won', () => {
    const rounds = parseDrawContent(readFileSync(new URL('./fixtures/te-draw.html', import.meta.url), 'utf8')) as { a: { names: string[]; cc: string[]; won: boolean }; b: { names: string[]; cc: string[] }; sets: number[][]; date: string }[][];
    expect(rounds.map((r) => r.length)).toEqual([32, 16, 8, 4, 2, 1]);
    // names carry no seeding marks; the winner is flagged; the sets are as the page shows them
    expect(rounds[0]![0]).toMatchObject({ a: { names: ['Nikita Alexander RUNG'], cc: ['GER'], won: true }, b: { names: ['Charles TRENTESAUX'], cc: ['FRA'] }, sets: [[6, 1], [6, 1]], date: 'Mon 26/10/2026' });
    // the final is not played yet: empty sides, no sets
    expect(rounds[5]![0]).toMatchObject({ a: { names: [] }, b: { names: [] }, sets: [] });
  });

  it('stores the trees with the results and keeps them when a later refresh sends only matches', async () => {
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', circuit: 'TE', until: '2026-12-31', events: [{ ...base, id: A, name: 'NANA Golden Beach', start: '2026-10-24', end: '2026-10-31' }] }), NOW);
    const side = (n: string, cc: string, won = false) => ({ names: [n], cc: [cc], won });
    const draws = [{ n: 1, name: 'BS12 - Boys Singles 12 Main Draw', rounds: [[{ a: side('Ben STRAUSS', 'ISR', true), b: side('Loukas PANOUSIS', 'GRE'), sets: [[6, 3], [6, 3]], date: 'Thu 29/10/2026' }, { a: side('X', 'GRE'), b: side('Y', 'GRE', true), sets: [[6, 0]], date: '' }], [{ a: side('Ben STRAUSS', 'ISR'), b: { names: [], cc: [], won: false }, sets: [], date: '' }]] }];
    const match = { day: '2026-10-29', draw: 'BS12', stage: 'Quarter final', court: 'Court 4', time: '12:30', a: side('Ben STRAUSS', 'ISR', true), b: side('Loukas PANOUSIS', 'GRE'), sets: [[6, 3], [6, 3]] };
    await importAbroadResults(db, validateAbroadResults({ kind: 'abroad-results', results: [{ id: A, days: ['2026-10-29'], matches: [match], draws }] }), NOW);
    let ev = await abroadEvent(db, A);
    expect(ev!.results!.draws).toHaveLength(1);
    expect(ev!.results!.draws![0]!.rounds.map((r) => r.length)).toEqual([2, 1]);
    // the hourly refresh that sends no trees leaves them as they were
    await importAbroadResults(db, validateAbroadResults({ kind: 'abroad-results', results: [{ id: A, days: ['2026-10-29'], matches: [match] }] }), NOW);
    ev = await abroadEvent(db, A);
    expect(ev!.results!.draws).toHaveLength(1);
  });
});
