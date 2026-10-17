import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkUser, resetDb } from './helpers';
import { importRosters, parseCategoryTitle, validateRosterImport } from '@/services/loglig-rosters';
import { addPlayerProfile } from '@/services/accounts';
import { myHome } from '@/services/home';
import { cancelMyEntry } from '@/services/entries';
import { GET as tournamentRoute } from '@/app/api/v1/tournaments/[id]/route';
import { ensureDefaultRuleSet } from '@/services/rules';

beforeAll(resetDb);

describe('registered players from Loglig rosters', () => {
  it('shows who is registered before the draw, links known players, and keeps payment and cancelling on Loglig', async () => {
    expect(parseCategoryTitle('סבב זוגות 2 2026 - בנים 14 מוקדמות')).toEqual({ gender: 'MALE', age: 14, qualifying: true });
    expect(parseCategoryTitle('זוגות בנות 12')).toEqual({ gender: 'FEMALE', age: 12, qualifying: false });

    const rule = await ensureDefaultRuleSet(db);
    const [t] = await db.insert(schema.tournaments).values({ name: "סבב זוגות מס' 2 2026", startDate: new Date('2026-10-16T00:00:00Z'), endDate: new Date('2026-10-26T23:59:59Z'), status: 'REGISTRATION_CLOSED', feeAgorot: 18000, ruleSetId: rule.id, section: 'YOUTH' }).returning();
    const [c12] = await db.insert(schema.categories).values({ tournamentId: t!.id, name: 'זוגות בנים 12', gender: 'MALE', minBirthYear: 2014, format: 'KNOCKOUT' }).returning();
    // a player the federation's ranking data already knows (same name, born 2014) and one it does not
    const [known] = await db.insert(schema.players).values({ firstName: 'דניאל', lastName: 'ארז', gender: 'MALE', birthDate: new Date(Date.UTC(2014, 6, 1)), logligId: 'rk:MALE:2014:דניאל ארז' }).returning();

    const body = {
      kind: 'rosters' as const,
      competitions: [{
        id: 15893, title: 'סבב זוגות 2 2026', start: '2026-10-16',
        categories: [
          { teamId: 46033, title: 'סבב זוגות 2 2026 - בנים 12', players: [{ userId: 111, name: 'דניאל ארז', image: 'PlayerImage_111.jpeg' }, { userId: 222, name: 'יובל חדש', image: null }] },
          { teamId: 46178, title: 'סבב זוגות 2 2026 - בנים 12 מוקדמות', players: [{ userId: 333, name: 'נועם מוקדמות', image: null }] },
        ],
      }, { id: 1, title: 'תחרות שאין אצלנו', start: '2026-11-01', categories: [] }],
    };
    expect(validateRosterImport(body).competitions.length).toBe(2);
    const r = await importRosters(db, validateRosterImport(body));
    expect(r.competitions).toBe(1);
    expect(r.unmatched).toEqual(['תחרות שאין אצלנו']);
    expect(r.entriesAdded).toBe(3);
    expect(r.newPlayers).toBe(2);       // דניאל ארז was recognised, not duplicated
    expect(r.newCategories).toBe(1);    // the qualifying round did not exist yet

    const [dan] = await db.select().from(schema.players).where(eq(schema.players.id, known!.id));
    expect(dan?.logligUserId).toBe('111');
    expect(dan?.photo).toBe('PlayerImage_111.jpeg');
    const en = await db.select().from(schema.entries).where(eq(schema.entries.categoryId, c12!.id));
    expect(en.length).toBe(2);
    expect(en.every((e) => e.source === 'loglig' && e.status === 'CONFIRMED')).toBe(true);

    // running it again changes nothing, and someone who left Loglig's list is dropped
    const again = await importRosters(db, validateRosterImport({ ...body, competitions: [{ ...body.competitions[0], categories: [{ ...body.competitions[0]!.categories[0]!, players: [body.competitions[0]!.categories[0]!.players[0]!] }, body.competitions[0]!.categories[1]!] }] }));
    expect(again.entriesAdded).toBe(0);
    expect(again.entriesRemoved).toBe(1);
    expect((await db.select().from(schema.entries).where(eq(schema.entries.categoryId, c12!.id))).length).toBe(1);

    // the public API lists participants with their photo
    const res = await tournamentRoute(new Request('http://x'), { params: Promise.resolve({ id: t!.id }) });
    const api = (await res.json()) as { participants: { name: string; photo: string | null; fromLoglig: boolean }[] };
    const p = api.participants.find((x) => x.name === 'דניאל ארז');
    expect(p?.photo).toBe('https://loglig.com/assets/players/PlayerImage_111.jpeg');
    expect(p?.fromLoglig).toBe(true);

    // a parent adding this child is linked to the same profile, sees the competition as theirs, and gets no payment nag or cancel
    const { actor: parent } = await mkUser('PLAYER', 'par@t.il');
    const linked = await addPlayerProfile(db, parent, { firstName: 'דניאל', lastName: 'ארז', birthDate: new Date('2014-04-04'), gender: 'MALE', forChild: true });
    expect(linked.id).toBe(known!.id);
    const home = await myHome(db, parent);
    const kid = home.people.find((x) => x.id === known!.id)!;
    expect(kid.nextTournament?.name).toBe("סבב זוגות מס' 2 2026");
    expect(kid.todo.some((x) => x.startsWith('PAY:'))).toBe(false);
    const [mine] = await db.select().from(schema.entries).where(and(eq(schema.entries.playerId, known!.id), eq(schema.entries.categoryId, c12!.id)));
    await expect(cancelMyEntry(db, parent, mine!.id)).rejects.toThrow('Loglig');
  });
});
