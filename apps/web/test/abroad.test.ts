import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { parseEntryDates, parseFactsheet, parseSearch } from '../scripts/loglig-sync/abroad.mjs';
import { abroadCatalog, entryState, importAbroad, validateAbroadImport } from '@/services/abroad';

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
