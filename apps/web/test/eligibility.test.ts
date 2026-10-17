import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus } from '@/services/tournaments';
import { registerEntry } from '@/services/entries';
import { effectiveMaxBirthYear, minAgeFor, relevantFor } from '@/services/eligibility';
import { myPlayersForRelevance } from '@/services/home';
import { GET as tournamentsRoute } from '@/app/api/v1/tournaments/route';
import { myHome } from '@/services/home';

beforeAll(resetDb);

describe('minimum age by competition section', () => {
  it('keeps a 12-year-old out of masters and adults, but lets staff add an exception', async () => {
    expect(minAgeFor('MASTERS', 'MALE')).toBe(18);
    expect(minAgeFor('ADULTS', 'MALE')).toBe(14);
    expect(minAgeFor('ADULTS', 'FEMALE')).toBe(13);
    expect(minAgeFor('YOUTH', 'MALE')).toBeNull();

    const { actor: fed } = await mkUser('FEDERATION_ADMIN', 'fed@t.il');
    const { actor: parent } = await mkUser('PLAYER', 'par@t.il');
    const kid = await mkPlayer('ילד', { birth: new Date('2014-04-04') });      // 12
    const girl = await mkPlayer('בת', { gender: 'FEMALE', birth: new Date('2013-01-01') }); // 13
    const adult = await mkPlayer('מבוגר', { birth: new Date('1985-06-06') });  // 41
    for (const p of [kid, girl, adult]) await db.insert(schema.guardians).values({ playerId: p.id, userId: parent.id });

    const mk = async (name: string, section: 'MASTERS' | 'ADULTS' | 'YOUTH') => {
      const t = await createTournament(db, fed, { name, startDate: new Date('2026-12-10'), endDate: new Date('2026-12-12'), feeAgorot: 0, section });
      const c = await addCategory(db, fed, t.id, { name: 'פתוחה', gender: 'OPEN' }); // no age limit on the category itself
      await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
      return { t, c };
    };
    const masters = await mk('מאסטרס', 'MASTERS');
    const adults = await mk('בוגרים', 'ADULTS');
    const youth = await mk('נוער', 'YOUTH');

    await expect(registerEntry(db, parent, masters.c.id, kid.id)).rejects.toThrow('מאסטרס');
    await expect(registerEntry(db, parent, adults.c.id, kid.id)).rejects.toThrow('בוגרים');
    await expect(registerEntry(db, parent, masters.c.id, girl.id)).rejects.toThrow('מאסטרס');
    await registerEntry(db, parent, adults.c.id, girl.id);   // a girl of 13 is old enough for the adult championship
    await registerEntry(db, parent, masters.c.id, adult.id); // 41
    await registerEntry(db, parent, youth.c.id, kid.id);     // youth has no floor
    await registerEntry(db, fed, masters.c.id, kid.id);      // staff exception (the "open" category)

    // clients that only know birth years never see an offer that would be refused
    expect(effectiveMaxBirthYear({ gender: 'OPEN', maxBirthYear: null }, { section: 'MASTERS', startDate: new Date('2026-12-10') })).toBe(2008);
    expect(effectiveMaxBirthYear({ gender: 'OPEN', maxBirthYear: 1990 }, { section: 'MASTERS', startDate: new Date('2026-12-10') })).toBe(1990);
    expect(effectiveMaxBirthYear({ gender: 'OPEN', maxBirthYear: null }, { section: 'YOUTH', startDate: new Date('2026-12-10') })).toBeNull();

    // and the personal home does not suggest masters to the child
    const h = await myHome(db, parent);
    const kidCard = h.people.find((x) => x.id === kid.id)!;
    expect(kidCard.canRegister.some((r) => r.tournamentId === masters.t.id)).toBe(false);

    // hiding what can never apply: a 12-year-old does not see masters or adult-championship competitions
    const kidP = { gender: 'MALE' as const, birthDate: kid.birthDate };
    const open = [{ gender: 'OPEN' as const, minBirthYear: null, maxBirthYear: null }];
    expect(relevantFor(kidP, { section: 'MASTERS', startDate: new Date('2026-12-10') }, open)).toBe(false);
    expect(relevantFor(kidP, { section: 'ADULTS', startDate: new Date('2026-12-10') }, open)).toBe(false);
    expect(relevantFor(kidP, { section: 'YOUTH', startDate: new Date('2026-12-10') }, open)).toBe(true);
    expect(relevantFor(kidP, { section: 'YOUTH', startDate: new Date('2026-12-10') }, [{ gender: 'MALE', minBirthYear: 2007, maxBirthYear: null }, { gender: 'MALE', minBirthYear: 2019, maxBirthYear: null }])).toBe(true); // U19 fits
    expect(relevantFor(kidP, { section: 'YOUTH', startDate: new Date('2026-12-10') }, [{ gender: 'FEMALE', minBirthYear: null, maxBirthYear: null }])).toBe(false);
    expect(relevantFor({ gender: 'MALE', birthDate: adult.birthDate }, { section: 'MASTERS', startDate: new Date('2026-12-10') }, [{ gender: 'MALE', minBirthYear: 1991, maxBirthYear: null }])).toBe(true); // age bands are not birth-year ranges
    expect(relevantFor(kidP, { section: 'MASTERS', startDate: new Date('2026-12-10') }, [])).toBe(false);

    // the app's tournament list marks what is relevant for the signed-in user, and staff see everything
    expect((await myPlayersForRelevance(db, fed)).length).toBe(0);
    const { signSession } = await import('@/lib/auth');
    const tok = await signSession(parent);
    const rows = (await (await tournamentsRoute(new Request('http://x', { headers: { authorization: `Bearer ${tok}` } }))).json()) as { name: string; relevant: boolean }[];
    expect(rows.find((x) => x.name === 'מאסטרס')?.relevant).toBe(true);   // the parent also has a 41-year-old on the account
    const tok2 = await signSession((await mkUser('PLAYER', 'solo@t.il')).actor);
    const solo = (await (await tournamentsRoute(new Request('http://x', { headers: { authorization: `Bearer ${tok2}` } }))).json()) as { relevant: boolean }[];
    expect(solo.every((x) => x.relevant)).toBe(true); // no profiles: nothing is hidden
  });
});
