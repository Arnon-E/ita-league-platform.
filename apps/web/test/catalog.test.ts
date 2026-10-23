import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { devSeed } from '@/services/devtools';
import { homeCatalog } from '@/services/catalog';
import { ensureDefaultRuleSet } from '@/services/rules';
import { relevantFor } from '@/services/eligibility';

const { tournaments, categories, entries, players } = schema;

beforeAll(async () => {
  await resetDb();
  await devSeed(db, { players: 300, tournaments: 30 });
  const rs = await ensureDefaultRuleSet(db);
  const mk = async (name: string, status: 'CANCELLED' | 'DRAFT' | 'REGISTRATION_OPEN') =>
    (await db.insert(tournaments).values({ name, startDate: new Date('2026-12-01'), endDate: new Date('2026-12-03'), status, ruleSetId: rs.id, section: 'ADULTS', level: 'REGIONAL' }).returning())[0]!;
  const cancelledWith = await mk('CAT בוטלה עם נרשמים', 'CANCELLED');
  const cancelledWithout = await mk('CAT בוטלה בלי נרשמים', 'CANCELLED');
  await mk('CAT בלי קטגוריות', 'DRAFT');
  const open = await mk('CAT פתוחה', 'REGISTRATION_OPEN');
  const [c1] = await db.insert(categories).values({ tournamentId: cancelledWith.id, name: 'גברים 35+', gender: 'MALE' }).returning();
  await db.insert(categories).values([
    { tournamentId: cancelledWithout.id, name: 'U14 בנות', gender: 'FEMALE', minBirthYear: 2012, maxBirthYear: 2014 },
    { tournamentId: open.id, name: 'U12 בנים', gender: 'MALE', minBirthYear: 2014 },
    { tournamentId: open.id, name: 'U12 בנים', gender: 'MALE', minBirthYear: 2014 }, // an exact repeat of the line above
    { tournamentId: open.id, name: 'פתוח', gender: 'OPEN' },
  ]);
  const [p] = await db.select().from(players).limit(1);
  await db.insert(entries).values({ categoryId: c1!.id, playerId: p!.id });
});

/** What the page used to read: the tournaments table and every category row, filtered in JavaScript. */
async function reference() {
  const ts = await db.select().from(tournaments);
  const cats = await db.select().from(categories);
  return { ts, cats };
}
const facet = (c: { gender: string; name: string; minBirthYear: number | null; maxBirthYear: number | null }) => {
  const a = c.name.match(/(\d{2})/);
  return `${c.gender}|${a ? Number(a[1]) : null}|${c.minBirthYear}|${c.maxBirthYear}`;
};

describe('home catalog', () => {
  it('has every tournament with the same details, newest first', async () => {
    const got = await homeCatalog(db);
    const { ts } = await reference();
    expect(got.length).toBe(ts.length);
    expect(got.map((g) => g.startDate.getTime())).toEqual([...got.map((g) => g.startDate.getTime())].sort((a, b) => b - a));
    for (const g of got) {
      const t = ts.find((x) => x.id === g.id)!;
      expect(g).toMatchObject({ name: t.name, status: t.status, format: t.format, level: t.level, section: t.section, feeAgorot: t.feeAgorot });
      expect(g.startDate.getTime()).toBe(t.startDate.getTime());
      expect(g.endDate.getTime()).toBe(t.endDate.getTime());
      expect(g.registrationCloses?.getTime() ?? null).toBe(t.registrationCloses?.getTime() ?? null);
    }
  });

  it('folds the categories into the same set of facets (gender, age from the name, birth-year limits)', async () => {
    const got = await homeCatalog(db);
    const { cats } = await reference();
    for (const g of got) {
      const want = [...new Set(cats.filter((c) => c.tournamentId === g.id).map(facet))].sort();
      const have = g.cats.map((c) => `${c.gender}|${c.age}|${c.minBirthYear}|${c.maxBirthYear}`).sort();
      expect(have).toEqual(want);
    }
    expect(got.find((g) => g.name === 'CAT בלי קטגוריות')!.cats).toEqual([]);
    expect(got.find((g) => g.name === 'CAT פתוחה')!.cats).toHaveLength(2); // the repeated category is one facet
  });

  it('says whether a cancelled tournament had entries, and the relevance check gives the same answer as with raw categories', async () => {
    const got = await homeCatalog(db);
    expect(got.find((g) => g.name === 'CAT בוטלה עם נרשמים')!.hasEntries).toBe(true);
    expect(got.find((g) => g.name === 'CAT בוטלה בלי נרשמים')!.hasEntries).toBe(false);
    const { cats } = await reference();
    const viewers = [
      { gender: 'MALE' as const, birthDate: new Date('2014-06-01') }, { gender: 'FEMALE' as const, birthDate: new Date('2013-02-02') },
      { gender: 'MALE' as const, birthDate: new Date('1985-03-03') }, { gender: 'FEMALE' as const, birthDate: new Date('2009-09-09') },
    ];
    for (const g of got) for (const v of viewers) {
      const raw = cats.filter((c) => c.tournamentId === g.id);
      expect(relevantFor(v, g, g.cats)).toBe(relevantFor(v, g, raw));
    }
  });

  it('is much smaller than the raw rows it replaces', async () => {
    const got = await homeCatalog(db);
    const { cats } = await reference();
    const facets = new Set(got.map((g) => JSON.stringify(g.cats)));
    expect(facets.size).toBeLessThan(cats.length / 4);
    void eq;
  });
});
