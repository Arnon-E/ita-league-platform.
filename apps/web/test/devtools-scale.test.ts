import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { resetDb } from './helpers';
import { devSeed, devSeedReset, devStats } from '@/services/devtools';

beforeAll(resetDb);

// Full-size seed: kept out of the normal run (set SEED_SCALE=1) because it takes several seconds.
describe.skipIf(!process.env.SEED_SCALE)('development seed at the live site scale', () => {
  it('seeds 5,600 players and 300 tournaments', async () => {
    const t0 = Date.now();
    const r = await devSeed(db, {});
    const secs = (Date.now() - t0) / 1000;
    const m = ((await db.execute(sql`select (select count(*) from matches)::int as matches, (select count(*) from points_awards)::int as awards`)) as unknown as Record<string, number>[])[0]!;
    console.log('seed result', JSON.stringify(r), JSON.stringify(m), `${secs.toFixed(1)}s`);
    expect(r).toMatchObject({ seeded: true, players: 5600, tournaments: 300 });
    const s = await devStats(db, 'snapshot').catch((e) => ({ error: String(e.message) }));
    console.log('stats', JSON.stringify(s).slice(0, 300));
    await devSeedReset(db);
  }, 120000);
});
