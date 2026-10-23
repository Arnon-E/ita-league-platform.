import { beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { devSeed } from '@/services/devtools';
import { rankingFor } from '@/services/rankings';
import { ensureDefaultRuleSet, loadRuleSet } from '@/services/rules';
import { playerRanks, rankingPage } from '@/services/ranking-sql';

const { players, clubs } = schema;
let rules: Awaited<ReturnType<typeof loadRuleSet>>;
type Info = { id: string; birth: Date; clubId: string | null };
let info: Map<string, Info>;

beforeAll(async () => {
  await resetDb();
  await devSeed(db, { players: 900, tournaments: 60 });
  rules = await loadRuleSet(db, (await ensureDefaultRuleSet(db)).id);
  info = new Map((await db.select({ id: players.id, birth: players.birthDate, clubId: players.clubId }).from(players)).map((x) => [x.id, x]));
});

/** Awards the seed does not make: age multipliers, doubles, and points with decimals that stress the rounding. */
async function addUnusualAwards() {
  const ids = [...info.keys()];
  const [t] = await db.select().from(schema.tournaments).limit(1);
  const rows = [];
  for (let i = 0; i < 700; i++) {
    const mult = [0.65, 0.8, 0.9, 1, 1.05][i % 5]!;
    rows.push({ playerId: ids[(i * 7) % ids.length]!, tournamentId: t!.id, points: Math.round((20 + ((i * 7919) % 90000) / 100) * 100) / 100 + (i % 3 === 0 ? 0.005 : 0), multiplier: mult, kind: i % 3 === 0 ? 'doubles' : 'singles', date: new Date(Date.now() - ((i * 37) % 300) * 86400000), logligKey: `unusual:${i}` });
  }
  await db.insert(schema.pointsAwards).values(rows);
}

/** The ranking as the application computed it before: the whole table in JavaScript. */
async function expected(gender: 'MALE' | 'FEMALE', f: { age?: number; clubId?: string } = {}) {
  const asOf = new Date();
  const rows = (await rankingFor(db, gender, asOf, rules)).filter((r) => info.has(r.playerId));
  return rows
    .filter((r) => !f.age || asOf.getFullYear() - info.get(r.playerId)!.birth.getUTCFullYear() <= f.age)
    .filter((r) => !f.clubId || info.get(r.playerId)!.clubId === f.clubId)
    .map((r, i) => ({ rank: i + 1, playerId: r.playerId, points: r.points, counted: r.counted.length }));
}

const brief = (rows: { rank: number; playerId: string; points: number; counted: number }[]) => rows.map((r) => ({ rank: r.rank, playerId: r.playerId, points: +r.points.toFixed(2), counted: r.counted }));

describe('ranking computed in SQL equals the JavaScript ranking', () => {
  beforeAll(addUnusualAwards);

  it('whole table, both genders, including ties and the counted results', async () => {
    for (const gender of ['MALE', 'FEMALE'] as const) {
      const want = await expected(gender);
      expect(want.length).toBeGreaterThan(50);
      const got = await rankingPage(db, { gender, limit: 500 });
      expect(got.total).toBe(want.length);
      expect(brief(got.rows)).toEqual(brief(want.slice(0, 500)));
    }
  });

  it('age group and club narrow the list and renumber the ranks', async () => {
    const asOfClub = (await db.select().from(clubs).where(eq(clubs.name, 'DEV מועדון 3')))[0]!;
    for (const f of [{ age: 14 }, { age: 12 }, { clubId: asOfClub.id }, { age: 16, clubId: asOfClub.id }]) {
      const want = await expected('MALE', f);
      const got = await rankingPage(db, { gender: 'MALE', ...f, limit: 500 });
      expect(got.total).toBe(want.length);
      expect(brief(got.rows)).toEqual(brief(want.slice(0, 500)));
    }
  });

  it('pages join up and report the total, also past the end', async () => {
    const want = await expected('FEMALE');
    const first = await rankingPage(db, { gender: 'FEMALE', limit: 25, offset: 0 });
    const second = await rankingPage(db, { gender: 'FEMALE', limit: 25, offset: 25 });
    expect(first.total).toBe(want.length);
    expect(brief([...first.rows, ...second.rows])).toEqual(brief(want.slice(0, 50)));
    const past = await rankingPage(db, { gender: 'FEMALE', limit: 25, offset: want.length + 100 });
    expect(past).toEqual({ rows: [], total: want.length });
  });

  it('a few players\' ranks come out the same without the table', async () => {
    const all = [...(await expected('MALE')), ...(await expected('FEMALE'))];
    const pick = all.filter((_, i) => i % 40 === 0).slice(0, 12);
    const got = await playerRanks(db, [...pick.map((p) => p.playerId), 'not-a-player']);
    expect(got.size).toBe(pick.length);
    for (const p of pick) expect(got.get(p.playerId)).toMatchObject({ rank: p.rank, counted: p.counted, points: expect.closeTo(p.points, 2) });
    expect((await playerRanks(db, [])).size).toBe(0);
  });

  it('row details are the player\'s name and club', async () => {
    const top = (await rankingPage(db, { gender: 'MALE', limit: 1 })).rows[0]!;
    const p = (await db.select().from(players).where(eq(players.id, top.playerId)))[0]!;
    expect(top.name).toBe(`${p.firstName} ${p.lastName}`);
    const c = p.clubId ? (await db.select().from(clubs).where(inArray(clubs.id, [p.clubId])))[0]!.name : null;
    expect(top.club).toBe(c);
  });
});
