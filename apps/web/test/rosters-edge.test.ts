import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { importRosters, validateRosterImport } from '@/services/loglig-rosters';
import { ensureDefaultRuleSet } from '@/services/rules';

const { players, entries, tournaments, categories } = schema;
beforeAll(resetDb);

const roster = (title: string, cats: { title: string; players: { userId: number; name: string; image: string | null }[] }[]) =>
  validateRosterImport({ kind: 'rosters', competitions: [{ id: 1, title, start: '2026-10-16', categories: cats.map((c, i) => ({ teamId: 100 + i, ...c })) }] });
const mkPlayer = async (first: string, last: string, year: number, extra: Partial<typeof players.$inferInsert> = {}) =>
  (await db.insert(players).values({ firstName: first, lastName: last, gender: 'MALE', birthDate: new Date(Date.UTC(year, 6, 1)), ...extra }).returning())[0]!;

/** How a roster player is matched to a known player: by Loglig user id, by the ranking key, or by name and age group; otherwise created. */
describe('roster import: matching and batching rules', () => {
  it('matches by user id, by ranking key and by name+age, creates the rest, and never matches one player twice', async () => {
    const rule = await ensureDefaultRuleSet(db);
    const [t] = await db.insert(tournaments).values({ name: 'EDGE תחרות', startDate: new Date('2026-10-16T00:00:00Z'), endDate: new Date('2026-10-26T00:00:00Z'), status: 'REGISTRATION_CLOSED', ruleSetId: rule.id }).returning();
    await db.insert(categories).values({ tournamentId: t!.id, name: 'בנים 12', gender: 'MALE', minBirthYear: 2014, format: 'KNOCKOUT' });

    const byId = await mkPlayer('אבי', 'לוי', 2014, { logligUserId: '400', photo: 'old.jpeg' });          // already linked: only the photo changes
    const byKey = await mkPlayer('בני', 'כהן', 2014, { logligId: 'll:700' });                                // ranked player keyed by Loglig user id
    const young = await mkPlayer('גדי', 'שמש', 2014);                                                      // two with the same name: only the right age fits
    const old = await mkPlayer('גדי', 'שמש', 2009);
    const twin = await mkPlayer('דני', 'ברק', 2014);                                                        // one known player, two roster rows with this name

    const r = await importRosters(db, roster('EDGE תחרות', [{
      title: 'EDGE תחרות - בנים 12',
      players: [
        { userId: 400, name: 'אבי לוי', image: 'new.jpeg' },
        { userId: 700, name: 'בני כהן', image: null },
        { userId: 800, name: 'גדי שמש', image: null },
        { userId: 501, name: 'דני ברק', image: null },
        { userId: 502, name: 'דני ברק', image: null },
        { userId: 900, name: 'חדש לגמרי', image: 'p900.jpeg' },
      ],
    }]));

    expect(r).toMatchObject({ competitions: 1, categories: 1, players: 6, entriesAdded: 6, newPlayers: 2 }); // the second דני ברק and חדש לגמרי
    const get = async (id: string) => (await db.select().from(players).where(eq(players.id, id)))[0]!;
    expect((await get(byId.id)).photo).toBe('new.jpeg');
    expect((await get(byKey.id)).logligUserId).toBe('700');
    expect((await get(young.id)).logligUserId).toBe('800'); // not the 2009 namesake
    expect((await get(old.id)).logligUserId).toBeNull();
    const twins = (await db.select().from(players).where(eq(players.lastName, 'ברק')));
    expect(twins.length).toBe(2);
    expect(twins.map((x) => x.logligUserId).sort()).toEqual(['501', '502']);
    expect(twins.find((x) => x.id === twin.id)!.logligUserId).toBe('501'); // the first row took the known player, the second was a new person
    expect((await db.select().from(players).where(eq(players.logligUserId, '900')))[0]).toMatchObject({ firstName: 'חדש', lastName: 'לגמרי', logligId: 'lu:900' });

    // the same list again: nothing is added, nothing is created, nobody is removed
    const again = await importRosters(db, roster('EDGE תחרות', [{ title: 'EDGE תחרות - בנים 12', players: [
      { userId: 400, name: 'אבי לוי', image: 'new.jpeg' }, { userId: 700, name: 'בני כהן', image: null }, { userId: 800, name: 'גדי שמש', image: null },
      { userId: 501, name: 'דני ברק', image: null }, { userId: 502, name: 'דני ברק', image: null }, { userId: 900, name: 'חדש לגמרי', image: 'p900.jpeg' },
    ] }]));
    expect(again).toMatchObject({ entriesAdded: 0, newPlayers: 0, entriesRemoved: 0, players: 6 });
    expect((await db.select().from(entries)).length).toBe(6);
  });
});
