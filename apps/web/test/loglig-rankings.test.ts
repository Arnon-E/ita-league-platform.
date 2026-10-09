import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { importRankings, splitName, validateRankingImport, rankKey } from '@/services/loglig-rankings';
import { rankingTable } from '@/services/public';

beforeAll(resetDb);

const row = (rank: number, name: string, birthYear: number, club: string, total: number) => ({ rank, name, birthYear, club, national: total, international: 0, total });

describe('loglig ranking mirror', () => {
  it('imports clubs, players and points, re-imports idempotently, and the app ranks them in Loglig order', async () => {
    const input = validateRankingImport({
      gender: 'MALE',
      rows: [row(1, 'נדב קראוס', 2010, 'מועדון א', 4684), row(2, 'ליבי אלוני אלכס', 2011, 'מועדון ב', 4000), row(3, 'בלי נקודות', 2012, 'מועדון א', 0), { name: '', birthYear: 1 }],
    });
    expect(input.rows.length).toBe(3); // the invalid row is dropped
    expect(splitName('ליבי אלוני אלכס')).toEqual({ first: 'ליבי', last: 'אלוני אלכס' });

    const first = await importRankings(db, input);
    expect(first).toEqual({ players: 3, clubs: 2, awards: 2 });
    const again = await importRankings(db, input);
    expect(again.players).toBe(3);

    expect((await db.select().from(schema.players)).length).toBe(3);
    expect((await db.select().from(schema.clubs)).length).toBe(2);
    expect((await db.select().from(schema.pointsAwards)).length).toBe(2); // replaced, not duplicated

    const table = await rankingTable(db, { gender: 'MALE' });
    expect(table.map((r) => r.name)).toEqual(['נדב קראוס', 'ליבי אלוני אלכס']);
    expect(table[0]!.points).toBe(4684);
    const thisYear = new Date().getFullYear();
    const young = thisYear - 2011; // the younger of the two ranked players
    expect((await rankingTable(db, { gender: 'MALE', age: 12 })).length).toBe(young <= 12 ? 2 : 0);
    expect((await rankingTable(db, { gender: 'MALE', age: 18 })).length).toBe(2);

    // a point change on Loglig updates the same player rather than adding one
    await importRankings(db, { gender: 'MALE', rows: [row(1, 'נדב קראוס', 2010, 'מועדון א', 5000)] });
    expect((await rankingTable(db, { gender: 'MALE' }))[0]!.points).toBe(5000);
    expect(rankKey('MALE', 2010, 'נדב  קראוס')).toBe(rankKey('MALE', 2010, 'נדב קראוס'));
  });

  it('rejects malformed payloads', () => {
    expect(() => validateRankingImport({ gender: 'X', rows: [] })).toThrow();
    expect(() => validateRankingImport({ gender: 'MALE', rows: 'no' })).toThrow();
  });
});
