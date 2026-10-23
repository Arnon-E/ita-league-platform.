import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { resetDb } from './helpers';
import { devAllowed, devSeed, devSeedReset } from '@/services/devtools';
import { rankingPage } from '@/services/ranking-sql';

/** The whole ranking list for these filters (the old rankingTable), from the SQL ranking. */
const rankingTable = async (d: typeof import('@/db').db, o: { gender: 'MALE' | 'FEMALE'; age?: number; clubId?: string }) => (await rankingPage(d, { ...o, limit: 500 })).rows;
import { liveFeed } from '@/services/public';

beforeAll(resetDb);
afterEach(() => vi.unstubAllEnvs());

const count = async (table: string) => ((await db.execute(sql.raw(`select count(*)::int as n from ${table}`))) as unknown as { n: number }[])[0]!.n;

describe('development seed', () => {
  it('fills the database at scale, feeds the ranking and the live feed, is repeatable, and can be undone', async () => {
    const r = await devSeed(db, { players: 240, tournaments: 12 });
    expect(r).toMatchObject({ seeded: true, players: 240 });
    expect(await count('tournaments')).toBe(12);
    expect(await count('categories')).toBe(72);
    expect(await count('entries')).toBeGreaterThan(300);
    expect(await count('matches')).toBeGreaterThan(100);

    // the pages built on top of it see real-looking data
    const table = await rankingTable(db, { gender: 'MALE' });
    expect(table.length).toBeGreaterThan(20);
    expect(table[0]!.points).toBeGreaterThanOrEqual(table[table.length - 1]!.points);
    expect((await liveFeed(db, { upcoming: 5, results: 5 })).results.length).toBeGreaterThan(0);

    // seeding again changes nothing
    expect(await devSeed(db, { players: 240, tournaments: 12 })).toMatchObject({ seeded: false });
    expect(await count('players')).toBe(240);

    // and it can be wiped without touching anything else
    await devSeedReset(db);
    expect([await count('players'), await count('tournaments'), await count('clubs'), await count('points_awards')]).toEqual([0, 0, 0, 0]);
  });

  it('refuses to run on the live site', async () => {
    vi.stubEnv('VITEST', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(devAllowed()).toBe(false);
    await expect(devSeed(db, { players: 10, tournaments: 3 })).rejects.toThrow('development');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(devAllowed()).toBe(true);
  });
});
