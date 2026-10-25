import { beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { searchPlayers, sectionOfBirthYear } from '@/services/public';

beforeAll(resetDb);

const year = new Date().getFullYear();

describe('player sections', () => {
  it('puts a birth year in youth (up to 18), adults (19-29) or masters (30 and over)', () => {
    const now = new Date(`${year}-06-15`);
    expect(sectionOfBirthYear(year - 10, now)).toBe('YOUTH');
    expect(sectionOfBirthYear(year - 18, now)).toBe('YOUTH');
    expect(sectionOfBirthYear(year - 19, now)).toBe('ADULTS');
    expect(sectionOfBirthYear(year - 29, now)).toBe('ADULTS');
    expect(sectionOfBirthYear(year - 30, now)).toBe('MASTERS');
    expect(sectionOfBirthYear(year - 70, now)).toBe('MASTERS');
  });

  it('lists only the players of the chosen section', async () => {
    const mk = (first: string, age: number) => ({ firstName: first, lastName: 'בדיקה', birthDate: new Date(Date.UTC(year - age, 6, 1)), gender: 'MALE' as const });
    await db.insert(schema.players).values([mk('נער', 12), mk('נער18', 18), mk('בוגר19', 19), mk('בוגר29', 29), mk('מאסטרס30', 30), mk('מאסטרס60', 60)]);
    const names = async (section?: 'YOUTH' | 'ADULTS' | 'MASTERS') => (await searchPlayers(db, '', undefined, 100, { ...(section ? { section } : {}) })).map((r) => r.p.firstName).sort();
    expect(await names('YOUTH')).toEqual(['נער', 'נער18']);
    expect(await names('ADULTS')).toEqual(['בוגר19', 'בוגר29']);
    expect(await names('MASTERS')).toEqual(['מאסטרס30', 'מאסטרס60']);
    expect((await names()).length).toBe(6);
  });
});
