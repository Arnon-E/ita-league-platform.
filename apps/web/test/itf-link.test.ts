import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { resetDb } from './helpers';
import { importAbroad, itfEventFor, validateAbroadImport } from '@/services/abroad';

const ev = (id: string, name: string, category: string, start: string, end: string) => ({ id, name, venue: '', city: 'Ramat Hasharon', country: 'Israel', start, end, surface: 'Hard', category, age: null, closed: false, fee: '', hospitality: '', indoor: null, url: 'https://www.world.tennis/en/tournament/x/' });

describe('a planned ITF juniors competition finds its event', () => {
  beforeAll(async () => {
    await resetDb();
    await importAbroad(db, validateAbroadImport({ kind: 'abroad', circuit: 'ITF', until: '2026-12-31', events: [ev('J-J30-ISR-2026-001', 'J30 Ramat Hasharon', 'J30', '2026-11-16', '2026-11-21'), ev('J-J60-ISR-2026-002', 'J60 Tel Aviv', 'J60', '2026-11-16', '2026-11-21')] }), new Date('2026-11-10T12:00:00Z'));
  });

  it('by grade and overlapping days', async () => {
    const c = (name: string, s: string, e: string) => ({ name, start: new Date(`${s}T00:00:00Z`), end: new Date(`${e}T00:00:00Z`) });
    expect((await itfEventFor(db, c('ITF Juniors J30', '2026-11-17', '2026-11-22')))?.id).toBe('J-J30-ISR-2026-001');
    expect((await itfEventFor(db, c('ITF Juniors J60', '2026-11-17', '2026-11-22')))?.id).toBe('J-J60-ISR-2026-002');
    expect(await itfEventFor(db, c('ITF Juniors J30', '2026-12-20', '2026-12-26'))).toBeNull(); // another week
    expect(await itfEventFor(db, c('ITF Juniors J100', '2026-11-17', '2026-11-22'))).toBeNull(); // another grade
    expect(await itfEventFor(db, c('סבב המושבה 1', '2026-11-17', '2026-11-22'))).toBeNull(); // not an ITF competition
  });
});
