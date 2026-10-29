import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { classify, ganttYear, parseGantt, plannedFromGantt } from '../scripts/loglig-sync/gantt.mjs';
import { importCalendar, importCompetition, validateCalendarImport, validateCompetitionImport } from '@/services/loglig-competitions';

const xlsx = readFileSync(new URL('./fixtures/gantt-2026.xlsx', import.meta.url));

describe('the federation Gantt', () => {
  it('reads the year and puts each text box on its dates', () => {
    expect(ganttYear(xlsx)).toBe(2026);
    const at = (name: string, from = '') => (plannedFromGantt(xlsx, 2026) as { name: string; start: string; end: string }[]).find((e) => e.name === name && e.start >= from);
    // dates the Loglig app and TennisStroke show for the same competitions
    expect(at('מוקדמות חנוכה 2026')).toMatchObject({ start: '2026-11-27', end: '2026-11-29' });
    expect(at('ארצית חנוכה 2026')).toMatchObject({ start: '2026-12-05', end: '2026-12-12' });
    expect(at('מאסטרס זוגות 2026')).toMatchObject({ start: '2026-12-26', end: '2026-12-27' });
    expect(at('מוקדמות סבב זוגות 2 2026', '2026-10-01')).toMatchObject({ start: '2026-10-16', end: '2026-10-17' });
    expect(at('בית גמר סבב זוגות 2 2026')).toMatchObject({ start: '2026-10-22', end: '2026-10-26' });
  });

  it('joins a box that continues in the next month, but keeps consecutive weeks apart', () => {
    const all = plannedFromGantt(xlsx, 2026) as { name: string; start: string; end: string }[];
    expect(all.find((e) => e.name === 'ארצית פורים 2026')).toMatchObject({ start: '2026-02-27', end: '2026-03-07' });
    const weeks = all.filter((e) => e.name === 'Tennis Europe U14' && e.start.startsWith('2026-11'));
    expect(weeks.map((w) => [w.start, w.end])).toEqual([['2026-11-02', '2026-11-08'], ['2026-11-09', '2026-11-15']]);
  });

  it('leaves out stray drawings and the legend', () => {
    for (const b of parseGantt(xlsx, 2026) as { start: string; end: string }[]) {
      expect(b.start.startsWith('2026')).toBe(true);
      expect(Date.parse(b.end) - Date.parse(b.start)).toBeLessThanOrEqual(20 * 864e5);
    }
  });

  it('sorts Tennis Europe, ITF, leagues and Masters into the right section and level', () => {
    expect(classify('Tennis Europe  U14', 2026)).toMatchObject({ name: 'Tennis Europe U14', section: 'YOUTH', level: 'INTERNATIONAL' });
    expect(classify('ITF juniors J30 closed', 2026)).toMatchObject({ name: 'ITF Juniors J30', section: 'YOUTH', level: 'INTERNATIONAL' });
    expect(classify('ITF Future', 2026)).toMatchObject({ section: 'ADULTS', level: 'INTERNATIONAL' });
    expect(classify("מחזור 3ליגות ג' ב' א'", 2026)).toMatchObject({ section: 'ADULTS', level: 'LEAGUE' });
    expect(classify('ליגות צעירות 1', 2026)).toMatchObject({ section: 'YOUTH', level: 'LEAGUE' });
    expect(classify('ארצית חנוכה', 2026)).toMatchObject({ name: 'ארצית חנוכה 2026', section: 'YOUTH', level: 'NATIONAL' });
    expect(classify('אזורית סוכות', 2026)).toMatchObject({ level: 'REGIONAL' });
    expect(classify('מאסטרס זוגות 2026', 2026)).toMatchObject({ name: 'מאסטרס זוגות 2026', section: 'MASTERS' });
  });
});

describe('importing the calendar', () => {
  beforeAll(resetDb);
  const ev = (name: string, start: string, end: string, extra: object = {}) => ({ name, start, end, level: 'NATIONAL', section: 'YOUTH', ...extra });
  const NOW = new Date('2026-10-29T12:00:00Z');
  const planned = async () => (await db.select().from(schema.tournaments).where(eq(schema.tournaments.status, 'PLANNED'))).map((t) => t.name).sort();

  it('adds planned competitions, once, and moves them when the dates change', async () => {
    const first = validateCalendarImport({ kind: 'calendar', events: [ev('ארצית חנוכה 2026', '2026-12-05', '2026-12-12'), ev('Tennis Europe U14', '2026-11-02', '2026-11-08', { level: 'INTERNATIONAL' }), ev('ליגת על 2026', '2026-12-25', '2026-12-28', { level: 'LEAGUE', section: 'ADULTS' })] });
    expect(await importCalendar(db, first, NOW)).toMatchObject({ added: 3, updated: 0, removed: 0 });
    expect(await importCalendar(db, first, NOW)).toMatchObject({ added: 0, updated: 0, removed: 0 });
    const [t] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'Tennis Europe U14'));
    expect(t).toMatchObject({ status: 'PLANNED', level: 'INTERNATIONAL', section: 'YOUTH' });
    // the federation moves the event a week: the old row goes, the new one comes
    const moved = validateCalendarImport({ kind: 'calendar', events: [ev('ארצית חנוכה 2026', '2026-12-12', '2026-12-19'), ev('Tennis Europe U14', '2026-11-02', '2026-11-08', { level: 'INTERNATIONAL' }), ev('ליגת על 2026', '2026-12-25', '2026-12-28', { level: 'LEAGUE', section: 'ADULTS' })] });
    expect(await importCalendar(db, moved, NOW)).toMatchObject({ added: 1, removed: 1 });
    expect(await planned()).toEqual(['Tennis Europe U14', 'ארצית חנוכה 2026', 'ליגת על 2026']);
  });

  it('turns a planned competition into the real one when it is published, and never shadows a real one', async () => {
    const real = validateCompetitionImport({ kind: 'competition', name: 'אליפות ארצית חנוכה 2026', start: '2026-12-12', end: '2026-12-19', feeShekel: 0, level: 'NATIONAL', venues: [], categories: [] });
    await importCompetition(db, real, NOW);
    const same = validateCalendarImport({ kind: 'calendar', events: [ev('מוקדמות חנוכה 2026', '2026-12-10', '2026-12-11'), ev('ארצית חנוכה 2026', '2026-12-12', '2026-12-19'), ev('Tennis Europe U14', '2026-11-02', '2026-11-08', { level: 'INTERNATIONAL' })] });
    const stats = await importCalendar(db, same, NOW);
    expect(stats.covered).toBe(2);
    expect(await planned()).toEqual(['Tennis Europe U14']);
    // the planned row itself became the real competition: one row, the published name
    const rows = await db.select().from(schema.tournaments).where(eq(schema.tournaments.section, 'YOUTH'));
    expect(rows.filter((r) => /חנוכה/.test(r.name)).map((r) => [r.name, r.status === 'PLANNED'])).toEqual([['אליפות ארצית חנוכה 2026', false]]);
  });

  it('removes planned competitions that are over and ignores bad rows', async () => {
    const stats = await importCalendar(db, validateCalendarImport({ kind: 'calendar', events: [ev('Tennis Europe U14', '2026-11-02', '2026-11-08', { level: 'INTERNATIONAL' }), { name: '', start: 'x', end: 'y' }, ev('תחרות הפוכה', '2026-12-09', '2026-12-01')] }), new Date('2026-11-20T12:00:00Z'));
    expect(stats.events).toBe(0);
    expect(await planned()).toEqual([]);
  });
});
