import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { displayName, parseEvent, parseOtherEvents } from '../scripts/loglig-sync/te.mjs';
import { eventInfo } from '../scripts/loglig-sync/tournamentsoftware.mjs';
import { importCalendar, importCompetition, validateCalendarImport, validateCompetitionImport } from '@/services/loglig-competitions';

// the text of a real event page (te.tournamentsoftware.com), wrapped in the tags the parser strips
const page = `<html><body><div>Tennis Europe Menu Tennis Europe Back to Tennis Europe Home Tournaments Players Ranking Menu <h1>TE 14 - HAIFA (closed event)</h1> Log In <h2>TE 14 - HAIFA (closed event)</h2> <span>ITC HAIFA</span> | <span>Haifa, Israel</span> <span>2 Nov to 8 Nov</span> Category 2 Sign in Favourite Overview Matches Players Draws
Grading Category 2 Events 4 Entries 122 Entry opens Mon 7 Sep 00:00 GMT Start tournament Mon 2 Nov End of tournament Sun 8 Nov General information Tournament key TE-ISR-45A-2026 Other events
Venue Route ITC HAIFA Zviya and Yitzhak 2 123456 Haifa Israel +9720523465917 Contact Moran Lavi +972534455010 Moran@ita.co.il Referee Marina Ivanova marfysha159@gmail.com</div></body></html>`;

describe('Tennis Europe events in Israel', () => {
  it('reads an event page: name, venue, dates, entries and the organizer', () => {
    const ev = parseEvent(page, 2026);
    expect(ev).toMatchObject({ title: 'TE 14 - HAIFA', closed: true, venue: 'ITC HAIFA', city: 'Haifa', country: 'Israel', start: '2026-11-02', end: '2026-11-08', entries: 122, category: 2 });
    expect(ev!.contact).toMatchObject({ name: 'Moran Lavi' });
    expect(displayName(ev!.title, ev!.city)).toBe('Tennis Europe U14 חיפה');
    expect(displayName('TE 12- HAIFA (closed event)', 'Haifa')).toBe('Tennis Europe U12 חיפה');
    expect(displayName('TE 14- TEL AVIV ROKAH ST', 'Tel Aviv')).toBe('Tennis Europe U14 תל אביב');
  });

  it('lists the year\'s events from the "other events" tab, once each', () => {
    const html = '<a href="/tournament/903480f6-55db-4501-b014-f13dd75dcc96"><b>TE 14- TEL AVIV ROKAH ST (closed event)</b></a><a href="/tournament/903480f6-55db-4501-b014-f13dd75dcc96">x</a><a href="/find/player">p</a>';
    expect(parseOtherEvents(html)).toEqual([{ id: '903480F6-55DB-4501-B014-F13DD75DCC96', title: 'TE 14- TEL AVIV ROKAH ST (closed event)' }]);
  });

  it('knows Tennis Europe draw names (boys/girls singles and doubles)', () => {
    expect(eventInfo('BS U14')).toMatchObject({ name: 'בנים 14', gender: 'MALE', doubles: false, age: 14 });
    expect(eventInfo('GD U14')).toMatchObject({ name: 'בנות 14 זוגות', gender: 'FEMALE', doubles: true });
    expect(eventInfo('MS 40 (B)')).toMatchObject({ name: 'גברים 40 (B)' });
  });
});

describe('the Gantt week and the Tennis Europe event are one competition', () => {
  beforeAll(resetDb);
  const NOW = new Date('2026-10-29T12:00:00Z');
  it('the planned week is dropped once the real event exists, and a real import takes over a planned row', async () => {
    const cal = validateCalendarImport({ kind: 'calendar', events: [
      { name: 'Tennis Europe U14', start: '2026-11-02', end: '2026-11-08', level: 'INTERNATIONAL', section: 'YOUTH' },
      { name: 'Tennis Europe U14', start: '2026-11-09', end: '2026-11-15', level: 'INTERNATIONAL', section: 'YOUTH' },
    ] });
    expect(await importCalendar(db, cal, NOW)).toMatchObject({ added: 2 });
    const real = validateCompetitionImport({ kind: 'competition', name: 'Tennis Europe U14 חיפה', start: '2026-11-02', end: '2026-11-08', feeShekel: 0, level: 'INTERNATIONAL', section: 'YOUTH', venues: [{ club: 'ITC HAIFA', address: 'Haifa' }], categories: [] });
    await importCompetition(db, real, NOW);
    // the first planned week turned into the real event; the second week stays planned (no event published for it yet)
    const rows = await db.select().from(schema.tournaments).where(eq(schema.tournaments.section, 'YOUTH'));
    expect(rows.map((r) => [r.name, r.status === 'PLANNED', r.startDate.toISOString().slice(0, 10)]).sort()).toEqual([
      ['Tennis Europe U14 חיפה', false, '2026-11-02'], ['Tennis Europe U14', true, '2026-11-09'],
    ]);
    // the calendar run that follows does not bring the first week back
    expect(await importCalendar(db, cal, NOW)).toMatchObject({ covered: 1, added: 0 });
  });
});
