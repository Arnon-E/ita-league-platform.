import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { importCompetition, validateCompetitionImport } from '@/services/loglig-competitions';
import { importRankings } from '@/services/loglig-rankings';
import { groupStandings } from '@/services/results';

beforeAll(resetDb);

const p = (name: string) => ({ name, club: 'מועדון א' });
const m = (o: object) => ({ stage: 'KO', round: 1, place: 1, order: 0, start: '2026-09-18T07:00:00.000Z', kind: 'St', venue: 'מגרש 1', done: true, sets: [], retired: false, walkover: false, ...o });

const doc = {
  kind: 'competition', name: 'אליפות בדיקה', start: '2026-09-18', end: '2026-09-20', feeShekel: 180, level: 'NATIONAL', venues: [{ club: 'מועדון רעננה', address: 'רעננה' }],
  categories: [
    {
      name: 'בנים 12', source: '1', gender: 'MALE', age: 12, format: 'GROUPS_KNOCKOUT',
      matches: [
        m({ stage: 'GROUP', group: 'בית 1', a: p('אבי כהן'), b: p('בני לוי'), sets: [{ a: 6, b: 3 }, { a: 6, b: 4 }] }),
        m({ stage: 'GROUP', group: 'בית 1', a: p('אבי כהן'), b: p('גדי מור'), sets: [{ a: 6, b: 0 }, { a: 6, b: 0 }] }),
        m({ stage: 'GROUP', group: 'בית 1', a: p('בני לוי'), b: p('גדי מור'), sets: [{ a: 7, b: 5 }, { a: 3, b: 6 }, { a: 10, b: 8, superTb: true }] }),
        m({ stage: 'GROUP', group: 'בית 2', a: p('דני שחר'), b: p('הלל נחום'), walkover: true }),
        m({ round: 2, a: p('אבי כהן'), b: p('דני שחר'), sets: [{ a: 6, b: 2 }, { a: 6, b: 2 }] }),
        m({ round: 2, a: p('בני לוי'), b: p('הלל נחום'), done: false, kind: 'NB', start: '2026-09-20T06:00:00.000Z' }),
      ],
    },
    {
      name: 'בנות 14', source: '2', gender: 'FEMALE', age: 14, format: 'KNOCKOUT',
      matches: [
        m({ a: p('נועה אבן'), b: p('מאיה זהב'), walkover: true }),
        m({ round: 2, a: p('נועה אבן'), b: p('שירה פז'), sets: [{ a: 6, b: 6 }], retired: true }),
        m({ round: 3, a: p('נועה אבן'), b: p('לילי ים'), sets: [{ a: 6, b: 4 }, { a: 6, b: 4 }, { a: 3, b: 1 }] }),
      ],
    },
  ],
};

describe('loglig competition mirror', () => {
  it('imports a competition with groups, knockout, walkovers; re-import is idempotent; ranked players are reused', async () => {
    await importRankings(db, { gender: 'MALE', rows: [{ rank: 1, name: 'אבי כהן', birthYear: 2014, club: 'מועדון א', national: 100, international: 0, total: 100 }] });
    const input = validateCompetitionImport(doc);
    const first = await importCompetition(db, input, new Date('2026-10-10'));
    expect(first).toMatchObject({ categories: 2, matches: 9, unresolved: 1 }); // only the group walkover has no known winner

    const t = (await db.select().from(schema.tournaments))[0]!;
    expect(t).toMatchObject({ name: 'אליפות בדיקה', status: 'FINISHED', feeAgorot: 18000, level: 'NATIONAL' });
    const cats = await db.select().from(schema.categories).where(eq(schema.categories.tournamentId, t.id));
    expect(cats.map((c) => c.name).sort()).toEqual(['בנות 14', 'בנים 12']);

    // the ranked player was reused, not duplicated
    const avi = await db.select().from(schema.players).where(eq(schema.players.firstName, 'אבי'));
    expect(avi.length).toBe(1);
    expect(avi[0]!.logligId).toMatch(/^rk:MALE:2014:/);

    const boys = cats.find((c) => c.name === 'בנים 12')!;
    const tables = await groupStandings(db, boys.id);
    expect(tables.length).toBe(2);
    expect(tables[0]!.standings[0]!.played).toBeGreaterThan(0);

    const girls = cats.find((c) => c.name === 'בנות 14')!;
    const gm = await db.select().from(schema.matches).where(eq(schema.matches.categoryId, girls.id));
    const r1 = gm.find((x) => x.round === 1)!;
    expect(r1.status).toBe('WALKOVER'); // the player who went on to round 2 won it
    expect(r1.winnerEntryId).toBeTruthy();
    expect(r1.absentEntryId).toBeTruthy();
    expect(gm.find((x) => x.round === 2)!.status).toBe('RETIRED'); // retired; the player who reached round 3 won it

    const odd = gm.find((x) => x.round === 3)!;
    expect(odd.status).toBe('RETIRED'); // an irregular score is kept as played, but never crashes the standings
    expect(odd.absentEntryId).toBeTruthy();

    const open = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, boys.id))).find((x) => x.status === 'SCHEDULED')!;
    expect(open.scheduleKind).toBe('NOT_BEFORE');
    expect(open.notBefore).toBeTruthy();

    // re-run: same counts, no duplicates
    await importCompetition(db, input, new Date('2026-10-10'));
    expect((await db.select().from(schema.tournaments)).length).toBe(1);
    expect((await db.select().from(schema.categories)).length).toBe(2);
    expect((await db.select().from(schema.matches)).length).toBe(9);
    expect((await db.select().from(schema.players).where(eq(schema.players.firstName, 'אבי'))).length).toBe(1);
  });

  it('rejects malformed payloads', () => {
    expect(() => validateCompetitionImport({ kind: 'competition', name: '', categories: [] })).toThrow();
    expect(() => validateCompetitionImport({ kind: 'x' })).toThrow();
  });
});
