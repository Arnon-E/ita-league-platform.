import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { importLeague, validateLeagueImport } from '@/services/loglig-leagues';
import { parseLeagueDetails, parseLeagueSchedule } from '../scripts/loglig-sync/leagues-parse.mjs';
import { expandAges } from '../scripts/loglig-sync/parse.mjs';

beforeAll(resetDb);

const tr = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;

describe('team league mirror', () => {
  it('parses standings and fixtures, stores them and refreshes in place', async () => {
    const details = `<h3>ליגת בדיקה 2026 - טבלת דירוג</h3><h4>שלב 1</h4><h4>ליגת בדיקה בית A</h4>
      <table>${tr(['f', 'e', 'קבוצה', ''])}</table>
      <table>${tr(['#', 'שם קבוצה', 'משחקים', 'ניקוד', 'ניצחונות', 'הפסדים', 'תיקו', 'מערכות+', 'מערכות-', 'משחקונים+', 'משחקונים-'])}
      ${tr(['1', 'הפועל לוד', '5', '13', '5', '0', '0', '27', '5', '186', '89'])}${tr(['2', 'קיסריה', '5', '11', '4', '1', '0', '22', '12', '197', '148'])}</table>`;
    const d = parseLeagueDetails(details);
    expect(d.name).toBe('ליגת בדיקה 2026');
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]!.standings[0]).toMatchObject({ rank: 1, team: 'הפועל לוד', points: 13, setsFor: 27, gamesAgainst: 89 });

    const sched = `<table>${tr(['מחזור 1'])}
      ${tr(['נגמר', 'רעננה', 'ליגת בדיקה בית A', '', '15/06/2026 09:00', '', 'הפועל לוד (הפועל עירוני לוד)', '3', '0', '', 'קיסריה (מועדוני קיסריה)', '', 'למשחק'])}
      ${tr(['', 'חיפה', 'ליגת בדיקה בית A', '', '22/06/2026 09:00', '', 'קיסריה (מועדוני קיסריה)', '', '', '', 'הפועל לוד (הפועל עירוני לוד)', '', 'למשחק'])}</table>`;
    const rounds = parseLeagueSchedule(sched);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.matches[0]).toMatchObject({ done: true, home: { team: 'הפועל לוד', club: 'הפועל עירוני לוד' }, homeScore: 3, awayScore: 0, start: '2026-06-15T09:00' });
    expect(rounds[0]!.matches[1]).toMatchObject({ done: false, homeScore: null });

    const doc = validateLeagueImport({ kind: 'league', id: '14352', name: d.name, gender: 'MALE', data: { groups: d.groups, rounds } });
    expect(await importLeague(db, doc)).toEqual({ league: 'ליגת בדיקה 2026', groups: 1, rounds: 1, matches: 2 });
    await importLeague(db, { ...doc, name: 'ליגת בדיקה 2026 (עודכן)' });
    const rows = await db.select().from(schema.externalLeagues);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toContain('עודכן');
  });

  it('expands age lines into categories', () => {
    expect(expandAges('בנים/בנות 14 ובנים 16').map((c: { name: string }) => c.name)).toEqual(['בנים 14', 'בנות 14', 'בנים 16']);
    expect(expandAges("מרכז א' - בנים/בנות 12", true).map((c: { name: string }) => c.name)).toEqual(["זוגות בנים 12 · מרכז א'", "זוגות בנות 12 · מרכז א'"]);
    expect(expandAges('אזור צפון - כל הגילאים')).toEqual([{ name: 'אזור צפון - כל הגילאים', gender: 'OPEN', age: null }]);
  });

  it('rejects a malformed league', () => {
    expect(() => validateLeagueImport({ kind: 'league', id: 'x', name: 'a' })).toThrow();
  });
});
