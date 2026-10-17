import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus } from '@/services/tournaments';
import { registerEntry } from '@/services/entries';
import { effectiveMaxBirthYear, minAgeFor } from '@/services/eligibility';
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
  });
});
