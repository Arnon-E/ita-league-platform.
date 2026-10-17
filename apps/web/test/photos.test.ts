import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkUser, resetDb } from './helpers';
import { importPhotos, photosNeeded, validatePhotos } from '@/services/loglig-photos';
import { photoUrl } from '@/lib/photos';

beforeAll(resetDb);

describe('player photos from Loglig', () => {
  it('asks for the people who matter first, stores file names, and does not ask again', async () => {
    const mk = async (first: string, key: string) => (await db.insert(schema.players).values({ firstName: first, lastName: 'בדיקה', gender: 'MALE', birthDate: new Date('2014-04-04'), logligId: key }).returning())[0]!;
    const stranger = await mk('זר', 'll:111');
    const mine = await mk('שלי', 'll:225173');
    await mk('אחר', 'rk:MALE:2014:אחר בדיקה'); // not keyed by a Loglig user id: nothing to ask
    const { actor: parent } = await mkUser('PLAYER', 'p@t.il');
    await db.insert(schema.guardians).values({ playerId: mine.id, userId: parent.id });

    const need = await photosNeeded(db, 10);
    expect(need.map((x) => x.userId)).toEqual([225173, 111]); // the linked child first
    expect(await photosNeeded(db, 1)).toHaveLength(1);

    expect(validatePhotos({ items: [{ userId: 225173, image: 'PlayerImage_225173_x.jpg' }, { userId: 111, image: '../etc/passwd' }, { userId: 0, image: 'a.jpg' }] })).toEqual([
      { userId: 225173, image: 'PlayerImage_225173_x.jpg' }, { userId: 111, image: null }]);
    await importPhotos(db, [{ userId: 225173, image: 'PlayerImage_225173_x.jpg' }, { userId: 111, image: null }]);

    const [a] = await db.select().from(schema.players).where(eq(schema.players.id, mine.id));
    const [b] = await db.select().from(schema.players).where(eq(schema.players.id, stranger.id));
    expect(a?.photo).toBe('PlayerImage_225173_x.jpg');
    expect(a?.logligUserId).toBe('225173');
    expect(b?.photo).toBe('');                       // Loglig has none: remembered, not asked again
    expect(await photosNeeded(db, 10)).toEqual([]);
    expect(photoUrl(a?.photo)).toBe('https://loglig.com/assets/players/PlayerImage_225173_x.jpg');
    expect(photoUrl(b?.photo)).toBeNull();
  });
});

describe('photos from the rosters of finished competitions', () => {
  it('fills photo and user id for players we already know, creates nothing, and skips ambiguous names', async () => {
    const { importRosterPhotos, validateRosterImport } = await import('@/services/loglig-rosters');
    const mk = async (first: string, last: string, year: number) => (await db.insert(schema.players).values({ firstName: first, lastName: last, gender: 'FEMALE', birthDate: new Date(Date.UTC(year, 6, 1)), logligId: `x:${first}${last}${year}` }).returning())[0]!;
    const known = await mk('מיה', 'לוי', 2014);
    await mk('נועה', 'כהן', 2014); await mk('נועה', 'כהן', 2013); // two girls with the same name in the age group: ambiguous
    const before = (await db.select().from(schema.players)).length;
    const r = await importRosterPhotos(db, validateRosterImport({
      kind: 'rosters',
      competitions: [{ id: 1, title: 'תחרות שהסתיימה', start: '2026-01-01', categories: [{ teamId: 5, title: 'תחרות שהסתיימה - בנות 12', players: [
        { userId: 777, name: 'מיה לוי', image: 'PlayerImage_777.jpg' }, { userId: 888, name: 'נועה כהן', image: 'PlayerImage_888.jpg' }, { userId: 999, name: 'לא מוכרת', image: 'PlayerImage_999.jpg' }, { userId: 555, name: 'בלי תמונה', image: null },
      ] }] }],
    }), new Date('2026-10-17'));
    expect(r).toMatchObject({ matched: 1, updated: 1, ambiguous: 1, unknown: 1 });
    const [m] = await db.select().from(schema.players).where(eq(schema.players.id, known.id));
    expect(m?.photo).toBe('PlayerImage_777.jpg');
    expect(m?.logligUserId).toBe('777');
    expect((await db.select().from(schema.players)).length).toBe(before); // nobody created
  });
});
