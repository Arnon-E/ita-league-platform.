import { beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkUser, resetDb } from './helpers';
import { addResultOverride, dedupeMirror, importCompetition, removeTournament, validateCompetitionImport } from '@/services/loglig-competitions';
import { myHome } from '@/services/home';
import { importRankings } from '@/services/loglig-rankings';
import { groupStandings } from '@/services/results';

beforeAll(resetDb);

const p = (name: string) => ({ name, club: 'מועדון א' });
const m = (o: object) => ({ stage: 'KO', round: 1, place: 1, order: 0, start: '2026-09-18T07:00:00.000Z', kind: 'St', venue: 'מגרש 1', done: true, sets: [], retired: false, walkover: false, ...o });

const doc = {
  kind: 'competition', name: 'אליפות בדיקה', start: '2026-09-18', end: '2026-09-20', feeShekel: 180, level: 'NATIONAL', venues: [{ club: 'מועדון רעננה', address: 'רעננה' }],
  categories: [
    {
      name: 'בנים 12', source: '1', gender: 'MALE', age: 12, format: 'GROUPS_KNOCKOUT',
      matches: [
        m({ stage: 'GROUP', group: 'בית 1', a: p('אבי כהן'), b: p('בני לוי'), sets: [{ a: 6, b: 3 }, { a: 6, b: 4 }] }),
        m({ stage: 'GROUP', group: 'בית 1', a: p('אבי כהן'), b: p('גדי מור'), sets: [{ a: 6, b: 0 }, { a: 6, b: 0 }] }),
        m({ stage: 'GROUP', group: 'בית 1', a: p('בני לוי'), b: p('גדי מור'), sets: [{ a: 7, b: 5 }, { a: 3, b: 6 }, { a: 10, b: 8, superTb: true }] }),
        m({ stage: 'GROUP', group: 'בית 2', a: p('דני שחר'), b: p('הלל נחום'), walkover: true }),
        m({ round: 2, a: p('אבי כהן'), b: p('דני שחר'), sets: [{ a: 6, b: 2 }, { a: 6, b: 2 }] }),
        m({ round: 2, a: p('בני לוי'), b: p('הלל נחום'), done: false, kind: 'NB', start: '2026-09-20T06:00:00.000Z' }),
      ],
    },
    {
      name: 'בנות 14', source: '2', gender: 'FEMALE', age: 14, format: 'KNOCKOUT',
      matches: [
        m({ a: p('נועה אבן'), b: p('מאיה זהב'), walkover: true }),
        m({ round: 2, a: p('נועה אבן'), b: p('שירה פז'), sets: [{ a: 6, b: 6 }], retired: true }),
        m({ round: 3, a: p('נועה אבן'), b: p('לילי ים'), sets: [{ a: 6, b: 4 }, { a: 6, b: 4 }, { a: 3, b: 1 }] }),
      ],
    },
  ],
};

describe('loglig competition mirror', () => {
  it('imports a competition with groups, knockout, walkovers; re-import is idempotent; ranked players are reused', async () => {
    await importRankings(db, { gender: 'MALE', rows: [{ rank: 1, name: 'אבי כהן', birthYear: 2014, club: 'מועדון א', national: 100, international: 0, total: 100 }] });
    const input = validateCompetitionImport(doc);
    const first = await importCompetition(db, input, new Date('2026-10-10'));
    expect(first).toMatchObject({ categories: 2, matches: 9, unresolved: 1 }); // only the group walkover has no known winner

    const t = (await db.select().from(schema.tournaments))[0]!;
    expect(t).toMatchObject({ name: 'אליפות בדיקה', status: 'FINISHED', feeAgorot: 18000, level: 'NATIONAL' });
    const cats = await db.select().from(schema.categories).where(eq(schema.categories.tournamentId, t.id));
    expect(cats.map((c) => c.name).sort()).toEqual(['בנות 14', 'בנים 12']);

    // the ranked player was reused, not duplicated
    const avi = await db.select().from(schema.players).where(eq(schema.players.firstName, 'אבי'));
    expect(avi.length).toBe(1);
    expect(avi[0]!.logligId).toMatch(/^rk:MALE:2014:/);

    const boys = cats.find((c) => c.name === 'בנים 12')!;
    const tables = await groupStandings(db, boys.id);
    expect(tables.length).toBe(2);
    expect(tables[0]!.standings[0]!.played).toBeGreaterThan(0);

    const girls = cats.find((c) => c.name === 'בנות 14')!;
    const gm = await db.select().from(schema.matches).where(eq(schema.matches.categoryId, girls.id));
    const r1 = gm.find((x) => x.round === 1)!;
    expect(r1.status).toBe('WALKOVER'); // the player who went on to round 2 won it
    expect(r1.winnerEntryId).toBeTruthy();
    expect(r1.absentEntryId).toBeTruthy();
    expect(gm.find((x) => x.round === 2)!.status).toBe('RETIRED'); // retired; the player who reached round 3 won it

    const odd = gm.find((x) => x.round === 3)!;
    expect(odd.status).toBe('RETIRED'); // an irregular score is kept as played, but never crashes the standings
    expect(odd.absentEntryId).toBeTruthy();

    const open = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, boys.id))).find((x) => x.status === 'SCHEDULED')!;
    expect(open.scheduleKind).toBe('NOT_BEFORE');
    expect(open.notBefore).toBeTruthy();

    // re-run: same counts, no duplicates
    await importCompetition(db, input, new Date('2026-10-10'));
    expect((await db.select().from(schema.tournaments)).length).toBe(1);
    expect((await db.select().from(schema.categories)).length).toBe(2);
    expect((await db.select().from(schema.matches)).length).toBe(9);
    expect((await db.select().from(schema.players).where(eq(schema.players.firstName, 'אבי'))).length).toBe(1);
  });

  it('imports an upcoming competition with planned categories, registration data, and replaces them when the draw appears', async () => {
    const up = validateCompetitionImport({
      kind: 'competition', name: 'סבב קרוב', start: '2026-11-16', end: '2026-11-18', feeShekel: 180, level: 'CIRCUIT', doubles: true,
      sourceUrl: 'https://ita.co.il/competitions/x/', registerUrl: 'https://loglig.com/Activity/Form/1?seasonId=1755', registrationCloses: '2026-11-10T21:45:00.000Z',
      categories: [{ name: 'זוגות בנים 12', gender: 'MALE', age: 12, format: 'KNOCKOUT', matches: [] }, { name: 'זוגות בנות 12', gender: 'FEMALE', age: 12, format: 'KNOCKOUT', matches: [] }],
    });
    await importCompetition(db, up, new Date('2026-10-10'));
    const [t] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'סבב קרוב'));
    expect(t).toMatchObject({ status: 'REGISTRATION_OPEN', level: 'CIRCUIT', registerUrl: 'https://loglig.com/Activity/Form/1?seasonId=1755' });
    expect((await db.select().from(schema.categories).where(eq(schema.categories.tournamentId, t!.id))).length).toBe(2);
    expect((await db.select().from(schema.draws)).length).toBe(2); // only the two earlier categories have draws

    // after the deadline with no draw yet: registration closed; once matches exist the placeholder categories are replaced
    await importCompetition(db, up, new Date('2026-11-12'));
    expect((await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, t!.id)))[0]!.status).toBe('REGISTRATION_CLOSED');
    const drawn = { ...up, doubles: false, categories: [{ name: 'בנים 12 מוקדמות', source: '5', gender: 'MALE' as const, age: 12, format: 'KNOCKOUT' as const, matches: [
      { stage: 'KO' as const, round: 1, place: 1, order: 0, start: '2026-11-16T07:00:00.000Z', kind: 'St' as const, venue: '', done: false, a: p('א א'), b: p('ב ב'), sets: [], retired: false, walkover: false },
    ] }] };
    await importCompetition(db, validateCompetitionImport(drawn), new Date('2026-11-12'));
    const cs = await db.select().from(schema.categories).where(eq(schema.categories.tournamentId, t!.id));
    expect(cs.map((c) => c.name)).toEqual(['בנים 12 מוקדמות']);
    expect((await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, t!.id)))[0]!.status).toBe('DRAWN');
  });

  it('keeps the section and gives adults a plausible estimated birth year', async () => {
    const adults = validateCompetitionImport({
      kind: 'competition', name: 'לאומית בדיקה', start: '2026-05-01', end: '2026-05-03', feeShekel: 0, level: 'NATIONAL', section: 'ADULTS',
      categories: [{ name: 'גברים', gender: 'MALE', age: null, format: 'KNOCKOUT', matches: [
        { stage: 'KO', round: 1, place: 1, order: 0, start: '2026-05-01T07:00:00.000Z', kind: '', venue: '', done: true, a: p('דן בוגר'), b: p('רן בוגר'), sets: [{ a: 6, b: 1 }, { a: 6, b: 2 }], retired: false, walkover: false },
      ] }],
    });
    await importCompetition(db, adults, new Date('2026-10-10'));
    const [t] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'לאומית בדיקה'));
    expect(t!.section).toBe('ADULTS');
    const [pl] = await db.select().from(schema.players).where(eq(schema.players.firstName, 'דן'));
    expect(pl!.birthDate.getUTCFullYear()).toBeLessThan(2000);
    await removeTournament(db, 'לאומית בדיקה');
  });

  it('removes a tournament by name with its dependants', async () => {
    expect(await removeTournament(db, 'סבב קרוב')).toEqual({ removed: 1 });
    expect(await removeTournament(db, 'לא קיים')).toEqual({ removed: 0 });
    expect((await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'סבב קרוב'))).length).toBe(0);
  });

  it('rejects malformed payloads', () => {
    expect(() => validateCompetitionImport({ kind: 'competition', name: '', categories: [] })).toThrow();
    expect(() => validateCompetitionImport({ kind: 'x' })).toThrow();
  });

  it('drops categories of an older import that are no longer in the draw (the same matches under another label)', async () => {
    const mk = (name: string) => ({
      kind: 'competition', name: 'אליפות כפילות', start: '2026-09-18', end: '2026-09-20', feeShekel: 0, level: 'NATIONAL', venues: [],
      categories: [{ name, source: '9', gender: 'MALE', age: 12, format: 'KNOCKOUT', matches: [m({ a: p('נועם אחד'), b: p('גל שניים'), sets: [{ a: 6, b: 1 }, { a: 6, b: 2 }] })] }],
    });
    await importCompetition(db, validateCompetitionImport(mk('בנים 12 · בית הגמר')), new Date('2026-10-10'));
    await importCompetition(db, validateCompetitionImport(mk('בנים 12')), new Date('2026-10-10'));
    const [tn] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'אליפות כפילות'));
    const cats = await db.select().from(schema.categories).where(eq(schema.categories.tournamentId, tn!.id));
    expect(cats.map((c) => c.name)).toEqual(['בנים 12']);
  });

  it('one competition listed under two titles (ita.co.il "אליפות ארצית ...", the Loglig app "ארצית ...") stays one tournament', async () => {
    const mk = (name: string, sets: { a: number; b: number }[]) => validateCompetitionImport({
      kind: 'competition', name, start: '2026-08-14', end: '2026-08-20', feeShekel: 0, level: 'NATIONAL', venues: [],
      categories: [{ name: 'בנים 12', source: '7', gender: 'MALE', age: 12, format: 'KNOCKOUT', matches: [m({ start: '2026-08-17T07:00:00.000Z', a: p('דני ארזי'), b: p('איתי בול'), sets })] }],
    });
    await importCompetition(db, mk('אליפות ארצית קיץ 9 2026 ע"ש בדיקה', [{ a: 6, b: 3 }, { a: 6, b: 0 }]), new Date('2026-10-10'));
    await importCompetition(db, mk('ארצית קיץ 9 2026 ע"ש בדיקה', [{ a: 3, b: 6 }, { a: 0, b: 6 }]), new Date('2026-10-10'));
    const ts = await db.select().from(schema.tournaments).where(sql`${schema.tournaments.name} like '%קיץ 9 2026%'`);
    expect(ts.map((t) => t.name)).toEqual(['אליפות ארצית קיץ 9 2026 ע"ש בדיקה']);
    const ms = await db.select().from(schema.matches).innerJoin(schema.categories, eq(schema.categories.id, schema.matches.categoryId)).where(eq(schema.categories.tournamentId, ts[0]!.id));
    expect(ms.map((x) => x.matches.sets)).toEqual([[{ a: 3, b: 6 }, { a: 0, b: 6 }]]); // the latest import wins
    // a different event with overlapping dates is not merged
    await importCompetition(db, mk('אזורית קיץ 9 2026', [{ a: 6, b: 1 }, { a: 6, b: 1 }]), new Date('2026-10-10'));
    expect((await db.select().from(schema.tournaments).where(sql`${schema.tournaments.name} like '%קיץ 9 2026%'`)).length).toBe(2);
  });

  it('a generic title without the year ("אליפות ישראל לנוער") is not taken for a championship of that name and year', async () => {
    const mk = (name: string, cat: string) => validateCompetitionImport({
      kind: 'competition', name, start: '2026-09-18', end: '2026-10-03', feeShekel: 0, level: 'NATIONAL', venues: [],
      categories: [{ name: cat, source: '3', gender: 'MALE', age: 12, format: 'KNOCKOUT', matches: [m({ start: '2026-09-20T07:00:00.000Z', a: p('גיל אחד'), b: p('טל שניים'), sets: [{ a: 6, b: 1 }, { a: 6, b: 1 }] })] }],
    });
    await importCompetition(db, mk('אליפות ישראל לנוער סוכות 2026 ע"ש בדיקה', 'בנים 12'), new Date('2026-10-10'));
    await importCompetition(db, mk('אליפות ישראל לנוער', 'בנים 10'), new Date('2026-10-10'));
    const [champ] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'אליפות ישראל לנוער סוכות 2026 ע"ש בדיקה'));
    expect((await db.select().from(schema.categories).where(eq(schema.categories.tournamentId, champ!.id))).map((c) => c.name)).toEqual(['בנים 12']);
    expect((await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'אליפות ישראל לנוער'))).length).toBe(1);
  });

  it('a placement match retired at a tied score is left undecided, never given to whoever played a later main-draw match', async () => {
    const doc = validateCompetitionImport({
      kind: 'competition', name: 'אליפות מקום שלישי 2026', start: '2026-10-01', end: '2026-10-03', feeShekel: 0, level: 'NATIONAL', venues: [],
      categories: [{ name: 'בנים 12', source: '5', gender: 'MALE', age: 12, format: 'KNOCKOUT', matches: [
        m({ round: 1, place: 1, a: p('אור ראשון'), b: p('ליאם שני'), sets: [{ a: 6, b: 1 }, { a: 6, b: 1 }] }),
        m({ round: 1, place: 1, a: p('רון שלישי'), b: p('דני רביעי'), sets: [{ a: 6, b: 2 }, { a: 6, b: 2 }] }),
        m({ round: 2, place: 1, a: p('אור ראשון'), b: p('רון שלישי'), sets: [{ a: 6, b: 4 }, { a: 6, b: 4 }] }),
        // third place, stopped at 6-6 when one of them retired; neither plays again
        m({ round: 2, place: 3, a: p('ליאם שני'), b: p('דני רביעי'), sets: [{ a: 6, b: 6 }], retired: true }),
      ] }],
    });
    const r = await importCompetition(db, doc, new Date('2026-10-10'));
    expect(r.unresolved).toBe(1);
    const [t] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'אליפות מקום שלישי 2026'));
    const [c] = await db.select().from(schema.categories).where(eq(schema.categories.tournamentId, t!.id));
    const ms = await db.select().from(schema.matches).where(eq(schema.matches.categoryId, c!.id));
    expect(ms.filter((x) => x.status === 'VOID').length).toBe(1);
    expect(ms.filter((x) => x.status === 'VOID')[0]!.winnerEntryId).toBeNull();
  });

  it('imports doubles with each half of a pair as a player, applies a hand-corrected result on every import, and the home shows both newest first', async () => {
    await importRankings(db, { gender: 'MALE', rows: [{ rank: 1, name: 'דן זוגי', birthYear: 2014, club: 'מועדון א', national: 50, international: 0, total: 50 }] });
    const doc = {
      kind: 'competition', name: 'אליפות זוגות 2026', start: '2026-09-29', end: '2026-10-03', feeShekel: 0, level: 'NATIONAL', venues: [],
      categories: [{ name: 'בנים 12', source: '11', gender: 'MALE', age: 12, format: 'KNOCKOUT', matches: [
        m({ round: 1, place: 1, start: '2026-09-30T06:00:00.000Z', a: p('דן זוגי'), b: p('אבי יריב'), sets: [{ a: 6, b: 1 }, { a: 6, b: 2 }] }),
        // a "not before" match: its time is the NB time
        m({ round: 2, place: 1, kind: 'NB', start: '2026-10-02T09:30:00.000Z', a: p('גל אלוף'), b: p('דן זוגי'), sets: [{ a: 6, b: 4 }, { a: 6, b: 4 }] }),
        // third place, "6-6 Ret": the page cannot tell who retired
        m({ round: 2, place: 3, start: '2026-10-03T07:00:00.000Z', a: p('ליאם שלישי'), b: p('דן זוגי'), sets: [{ a: 6, b: 6 }], retired: true }),
      ] }],
      doubles: [{ name: 'בנים 12 זוגות', source: '12', gender: 'MALE', age: 12, matches: [
        m({ round: 1, place: 1, start: '2026-10-02T12:30:00.000Z', a: p('גל אלוף / רון חבר'), b: p('דן זוגי / בן שותף'), sets: [{ a: 6, b: 2 }, { a: 3, b: 6 }, { a: 10, b: 7, superTb: true }] }),
      ] }],
    };
    const first = await importCompetition(db, validateCompetitionImport(doc), new Date('2026-10-10'));
    expect(first).toMatchObject({ doubles: 1, unresolved: 1 });
    const [dan] = await db.select().from(schema.players).where(eq(schema.players.lastName, 'זוגי'));
    const [dm] = await db.select().from(schema.doublesMatches);
    expect([dm!.b1, dm!.winner, dm!.status]).toEqual([dan!.id, 'a', 'COMPLETED']); // the ranked player is reused for his half of the pair

    await addResultOverride(db, { tournament: 'אליפות זוגות 2026', playerA: 'ליאם שלישי', playerB: 'דן זוגי', winner: 'דן זוגי', note: 'פרש ב-6-6' });
    expect((await importCompetition(db, validateCompetitionImport(doc), new Date('2026-10-10'))).unresolved).toBe(0);
    expect((await db.select().from(schema.doublesMatches)).length).toBe(1); // rebuilt, not duplicated

    const { actor: parent } = await mkUser('PLAYER', 'zugot@t.il');
    await db.insert(schema.guardians).values({ playerId: dan!.id, userId: parent.id });
    const home = await myHome(db, parent);
    const res = home.people[0]!.results;
    // newest first: the corrected third-place win (3.10), the doubles (2.10 12:30), the NB loss (2.10 09:30), the first round (30.9)
    expect(res.map((r) => [r.doubles, r.winner === r.mine])).toEqual([[false, true], [true, false], [false, false], [false, true]]);
    expect(res[1]!.b).toEqual(['דן זוגי', 'בן שותף']);
    expect(() => addResultOverride(db, { tournament: 'x', playerA: 'a', playerB: 'b', winner: 'c' })).rejects.toThrow();
  });

  it('a doubles-only competition counts as drawn, keeps the group of each match, and its group tables rank the pairs', async () => {
    const { doublesTables } = await import('@/services/doubles');
    const { tournamentDetail } = await import('@/services/queries');
    const g = (o: object) => m({ stage: 'GROUP', group: 'בית 1', ...o });
    const res = await importCompetition(db, validateCompetitionImport({
      kind: 'competition', name: 'סבב זוגות בדיקה', start: '2026-10-16', end: '2026-10-26', feeShekel: 0, level: 'NATIONAL', venues: [], categories: [],
      doubles: [{ name: 'בנים 12', source: '1', gender: 'MALE', age: 12, matches: [
        g({ a: p('א א / ב ב'), b: p('ג ג / ד ד'), sets: [{ a: 6, b: 2 }, { a: 6, b: 3 }] }),
        g({ a: p('א א / ב ב'), b: p('ה ה / ו ו'), done: false, start: '2026-10-23T07:00:00.000Z' }),
        g({ a: p('ג ג / ד ד'), b: p('ה ה / ו ו'), done: false, start: '2026-10-24T07:00:00.000Z' }),
      ] }],
    }), new Date('2026-10-21'));
    expect(res.doubles).toBe(3);
    const [t] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'סבב זוגות בדיקה'));
    expect(t!.status).toBe('IN_PROGRESS'); // not stuck on REGISTRATION_CLOSED
    const d = await tournamentDetail(db, t!.id);
    expect(d!.doubles.map((x) => x.groupName)).toEqual(['בית 1', 'בית 1', 'בית 1']);
    const [table] = doublesTables(d!.doubles);
    expect(table!.rows.map((r) => [r.pair, r.rank, r.wins, r.played])).toEqual([['א א / ב ב', 1, 1, 1], ['ה ה / ו ו', 2, 0, 0], ['ג ג / ד ד', 3, 0, 1]]);
  });

  it('boys/girls categories named נערים / נערות / ילדים reuse the ranked player instead of creating an OPEN twin', async () => {
    await importRankings(db, { gender: 'MALE', rows: [{ rank: 1, name: 'עומר תאום', birthYear: 2010, club: 'מועדון א', national: 10, international: 0, total: 10 }] });
    await importRankings(db, { gender: 'FEMALE', rows: [{ rank: 1, name: 'רוני תאומה', birthYear: 2010, club: 'מועדון א', national: 10, international: 0, total: 10 }] });
    await importCompetition(db, validateCompetitionImport({
      kind: 'competition', name: 'סבב מגדר', start: '2025-06-01', end: '2025-06-02', feeShekel: 0, level: 'NATIONAL', venues: [],
      categories: [
        { name: "נערים ב'", source: '1', gender: 'OPEN', age: null, format: 'KNOCKOUT', matches: [m({ start: '2025-06-01T07:00:00.000Z', a: p('עומר תאום'), b: p('זר חדש'), sets: [{ a: 6, b: 1 }, { a: 6, b: 1 }] })] },
        { name: 'A', source: '2', gender: 'OPEN', age: null, format: 'KNOCKOUT', matches: [m({ start: '2025-06-01T07:00:00.000Z', a: p('רוני תאומה'), b: p('זרה חדשה'), sets: [{ a: 6, b: 1 }, { a: 6, b: 1 }] })] },
      ],
    }), new Date('2026-10-10'));
    expect((await db.select().from(schema.players).where(eq(schema.players.firstName, 'עומר'))).map((x) => x.gender)).toEqual(['MALE']);
    expect((await db.select().from(schema.players).where(eq(schema.players.firstName, 'רוני'))).map((x) => x.gender)).toEqual(['FEMALE']);
    expect((await db.select().from(schema.categories).where(eq(schema.categories.name, "נערים ב'")))[0]!.gender).toBe('MALE');
  });

  it("Loglig's empty date (1753) never becomes a match date", () => {
    const v = validateCompetitionImport({
      kind: 'competition', name: 'סבב תאריך', start: '2023-07-03', end: '2023-07-05', feeShekel: 0, level: 'CIRCUIT', venues: [],
      categories: [{ name: 'בנים 10', source: '1', gender: 'MALE', age: 10, format: 'KNOCKOUT', matches: [m({ start: '1753-01-01T00:00:00.000Z', a: p('א ב'), b: p('ג ד') })] }],
    });
    expect(v.categories[0]!.matches[0]!.start).toBe('2023-07-03T00:00:00.000Z');
    expect(() => validateCompetitionImport({ kind: 'competition', name: 'x', start: '1753-01-01', end: '2023-07-05', categories: [] })).toThrow();
  });

  it('cleanup removes stale copies of a competition and players left without any history', async () => {
    const rule = (await db.select().from(schema.ruleSets))[0]!;
    // a copy left by an older import under another title, plus an orphaned OPEN twin
    const [old] = await db.insert(schema.tournaments).values({ name: 'ארצית קיץ 9 2026', startDate: new Date('2026-08-14T00:00:00Z'), endDate: new Date('2026-08-20T23:59:59Z'), ruleSetId: rule.id, status: 'FINISHED' }).returning();
    await db.insert(schema.players).values({ firstName: 'עומר', lastName: 'תאום', birthDate: new Date('2012-07-01'), gender: 'OPEN', logligId: 'cp:OPEN:עומר תאום' });
    const res = await dedupeMirror(db);
    expect(res.tournaments).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, old!.id))).length).toBe(0);
    expect((await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'אליפות ארצית קיץ 9 2026 ע"ש בדיקה'))).length).toBe(1);
    expect((await db.select().from(schema.players).where(eq(schema.players.firstName, 'עומר'))).map((x) => x.gender)).toEqual(['MALE']);
    expect((await db.select().from(schema.players).where(eq(schema.players.lastName, 'ארזי'))).length).toBe(1); // players with matches stay
  });

  it("cleanup gives players created from Loglig's 1753 date a real estimated birth year", async () => {
    const rule = (await db.select().from(schema.ruleSets))[0]!;
    const [t] = await db.insert(schema.tournaments).values({ name: 'סבב לידה', startDate: new Date('2023-07-03T00:00:00Z'), endDate: new Date('2023-07-05T00:00:00Z'), ruleSetId: rule.id, section: 'YOUTH' }).returning();
    const [kids] = await db.insert(schema.categories).values({ tournamentId: t!.id, name: 'בנים 10', gender: 'MALE', minBirthYear: 2013 }).returning();
    const [open] = await db.insert(schema.categories).values({ tournamentId: t!.id, name: 'A', gender: 'OPEN', minBirthYear: null }).returning();
    const [kid] = await db.insert(schema.players).values({ firstName: 'ילד', lastName: 'עתיק', birthDate: new Date('1743-07-01'), gender: 'MALE', logligId: 'cp:MALE:ילד עתיק' }).returning();
    const [other] = await db.insert(schema.players).values({ firstName: 'שחקן', lastName: 'עתיק', birthDate: new Date('1739-07-01'), gender: 'OPEN', logligId: 'cp:OPEN:שחקן עתיק' }).returning();
    await db.insert(schema.entries).values([{ categoryId: kids!.id, playerId: kid!.id, status: 'CONFIRMED' }, { categoryId: open!.id, playerId: other!.id, status: 'CONFIRMED' }]);
    const res = await dedupeMirror(db);
    expect(res.births).toBe(2);
    const year = async (id: string) => (await db.select().from(schema.players).where(eq(schema.players.id, id)))[0]!.birthDate.getUTCFullYear();
    expect(await year(kid!.id)).toBe(2013); // the age category's bound
    expect(await year(other!.id)).toBe(2009); // no age category: a youth competition in 2023, estimated 14
    await removeTournament(db, 'סבב לידה');
  });

  it('a results-only refresh updates matches but leaves the tournament details alone, and skips unknown tournaments', async () => {
    const base = {
      kind: 'competition', name: 'אליפות חיה', start: '2026-10-16', end: '2026-10-26', feeShekel: 180, level: 'NATIONAL', registerUrl: 'https://loglig.com/Activity/Form/1', registrationCloses: '2026-10-12T20:45:00.000Z',
      venues: [{ club: 'מועדון חי', address: 'חיפה' }],
      categories: [{ name: 'בנים 12', source: '7', gender: 'MALE', age: 12, format: 'KNOCKOUT', matches: [m({ a: p('אורי א'), b: p('נועם ב'), done: false, kind: 'NB', start: '2026-10-30T07:00:00.000Z' })] }],
    };
    await importCompetition(db, validateCompetitionImport(base), new Date('2026-10-17'));
    const live = { ...base, resultsOnly: true, feeShekel: 0, registerUrl: '', registrationCloses: null, venues: [], categories: [{ ...base.categories[0]!, matches: [m({ a: p('אורי א'), b: p('נועם ב'), sets: [{ a: 6, b: 2 }, { a: 6, b: 3 }], start: '2026-10-30T07:00:00.000Z' })] }] };
    const r = await importCompetition(db, validateCompetitionImport(live), new Date('2026-10-31'));
    expect(r.skipped).toBe(false);
    const [tn] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'אליפות חיה'));
    expect(tn?.feeAgorot).toBe(18000);                                  // untouched
    expect(tn?.registerUrl).toBe('https://loglig.com/Activity/Form/1'); // untouched
    expect(tn?.venueId).not.toBeNull();                                 // untouched
    const ms = await db.select().from(schema.matches);
    expect(ms.filter((x) => x.status === 'COMPLETED').length).toBeGreaterThanOrEqual(1); // the result came in

    const unknown = await importCompetition(db, validateCompetitionImport({ ...live, name: 'לא קיימת' }), new Date('2026-10-31'));
    expect(unknown.skipped).toBe(true);
    expect((await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, 'לא קיימת'))).length).toBe(0);
  });
});
