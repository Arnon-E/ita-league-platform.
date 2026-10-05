import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { approveDocs, mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus, setTournamentCourts } from '@/services/tournaments';
import { confirmEntry, registerEntry } from '@/services/entries';
import { recordPayment } from '@/services/payments';
import { runDraw, swapDrawSlots } from '@/services/draws';
import { advanceToKnockout, awardPoints, groupStandings, recordResult } from '@/services/results';
import { autoSchedule, setMatchSlot } from '@/services/schedule';
import { Forbidden } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';

const W: { sets: { a: number; b: number; superTb?: boolean }[] } = { sets: [{ a: 6, b: 2 }, { a: 6, b: 3 }] };

async function setup(n: number, format: 'KNOCKOUT' | 'GROUPS_KNOCKOUT', groupConfig?: { groupSize: number; advancers: number }) {
  const { actor: fed } = await mkUser('FEDERATION_ADMIN', `fed${Math.random()}@x.il`);
  const t = await createTournament(db, fed, { name: 'טורניר', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-03'), feeAgorot: 10000, format });
  await setTournamentCourts(db, fed, t.id, [{ label: '1' }, { label: 'מרכזי' }]);
  const cat = await addCategory(db, fed, t.id, { name: 'U14', gender: 'MALE', ...(groupConfig ? { groupConfig } : {}) });
  await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
  const entryIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await mkPlayer(`P${i}`);
    await approveDocs(p.id);
    const e = await registerEntry(db, fed, cat.id, p.id);
    await recordPayment(db, e.id, 10000);
    await confirmEntry(db, fed, e.id);
    entryIds.push(e.id);
  }
  await setStatus(db, fed, t.id, 'REGISTRATION_CLOSED');
  return { fed, t, cat, entryIds };
}

beforeAll(resetDb);

describe('knockout flow', () => {
  it('draws, plays with byes, propagates winners and schedules', async () => {
    const { fed, t, cat, entryIds } = await setup(6, 'KNOCKOUT');
    await runDraw(db, fed, cat.id, { code: 42 });
    const ms = await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id));
    // 6 players -> size 8 -> 2 byes -> 2 first-round matches, 2 semis, 1 final = 5 real matches... (r1: 2, r2: 2, r3: 1)
    expect(ms.length).toBe(5);
    expect(ms.filter((m) => m.round === 1).length).toBe(2);

    // reproducible
    const before = (await db.select().from(schema.draws).where(eq(schema.draws.categoryId, cat.id)))[0]!.slots;
    await runDraw(db, fed, cat.id, { code: 42 });
    const after = (await db.select().from(schema.draws).where(eq(schema.draws.categoryId, cat.id)))[0]!.slots;
    expect(after).toEqual(before);

    // play everything round by round
    for (let round = 1; round <= 3; round++) {
      const cur = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id))).filter((m) => m.round === round);
      for (const m of cur) {
        expect(m.aEntryId && m.bEntryId).toBeTruthy();
        await recordResult(db, fed, m.id, W.sets ? { status: 'COMPLETED', sets: W.sets } : { status: 'COMPLETED' });
      }
    }
    const final = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id))).find((m) => m.round === 3)!;
    expect(final.winnerEntryId).toBe(final.aEntryId);
    const [tr] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, t.id));
    expect(tr!.status).toBe('IN_PROGRESS');
    // cannot redraw after results
    await expect(runDraw(db, fed, cat.id)).rejects.toThrow();
    const pts = await awardPoints(db, fed, cat.id);
    expect(pts.awarded).toBe(entryIds.length);
    const winnerPlayer = (await db.select().from(schema.entries).where(eq(schema.entries.id, final.winnerEntryId!)))[0]!.playerId;
    const award = (await db.select().from(schema.pointsAwards).where(eq(schema.pointsAwards.playerId, winnerPlayer)))[0]!;
    expect(award.points).toBe(100);
  });

  it('correcting a result needs override and clears downstream when the winner changes', async () => {
    const { fed, cat } = await setup(4, 'KNOCKOUT');
    await runDraw(db, fed, cat.id, { code: 7 });
    const r1 = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id))).filter((m) => m.round === 1);
    for (const m of r1) await recordResult(db, fed, m.id, { status: 'COMPLETED', sets: W.sets });
    const ref = await mkUser('REFEREE', `ref${Math.random()}@x.il`);
    await db.insert(schema.tournamentStaff).values({ tournamentId: cat.tournamentId, userId: ref.actor.id, role: 'REFEREE' });
    await expect(recordResult(db, ref.actor, r1[0]!.id, { status: 'COMPLETED', sets: [{ a: 2, b: 6 }, { a: 3, b: 6 }] })).rejects.toBeInstanceOf(Forbidden);
    await recordResult(db, fed, r1[0]!.id, { status: 'COMPLETED', sets: [{ a: 2, b: 6 }, { a: 3, b: 6 }] });
    const final = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id))).find((m) => m.round === 2)!;
    const m0 = (await db.select().from(schema.matches).where(eq(schema.matches.id, r1[0]!.id)))[0]!;
    expect(final.aEntryId).toBe(m0.bEntryId);
  });

  it('walkover needs the absent player and invalid scores are rejected', async () => {
    const { fed, cat } = await setup(4, 'KNOCKOUT');
    await runDraw(db, fed, cat.id, { code: 9 });
    const m = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id))).find((x) => x.round === 1)!;
    await expect(recordResult(db, fed, m.id, { status: 'WALKOVER' })).rejects.toThrow();
    await expect(recordResult(db, fed, m.id, { status: 'COMPLETED', sets: [{ a: 6, b: 5 }, { a: 6, b: 1 }] })).rejects.toThrow();
    const res = await recordResult(db, fed, m.id, { status: 'WALKOVER', absentEntryId: m.aEntryId! });
    expect(res.winnerEntryId).toBe(m.bEntryId);
  });

  it('manual swap works before results and is logged', async () => {
    const { fed, cat } = await setup(8, 'KNOCKOUT');
    await runDraw(db, fed, cat.id, { code: 3 });
    const d = (await db.select().from(schema.draws).where(eq(schema.draws.categoryId, cat.id)))[0]!;
    const s = d.slots as { entryId: string }[];
    await expect(swapDrawSlots(db, fed, cat.id, 2, 5, '')).rejects.toThrow();
    await swapDrawSlots(db, fed, cat.id, 2, 5, 'בקשת שופט');
    const d2 = (await db.select().from(schema.draws).where(eq(schema.draws.categoryId, cat.id)))[0]!;
    const s2 = d2.slots as { entryId: string }[];
    expect(s2[2]!.entryId).toBe(s[5]!.entryId);
    const logs = await db.select().from(schema.drawLogs).where(eq(schema.drawLogs.drawId, d.id));
    expect(logs.some((l) => l.action === 'SWAP')).toBe(true);
  });
});

describe('groups flow with partial groups', () => {
  it('10 players -> groups of 4/3/3, standings, advance to knockout', async () => {
    const { fed, cat } = await setup(10, 'GROUPS_KNOCKOUT', { groupSize: 4, advancers: 2 });
    await runDraw(db, fed, cat.id, { code: 11 });
    const gs = await db.select().from(schema.groups).where(eq(schema.groups.categoryId, cat.id));
    expect(gs.length).toBe(3);
    const sizes = [] as number[];
    for (const g of gs) sizes.push((await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, g.id))).length);
    expect(sizes.sort()).toEqual([3, 3, 4]);
    const ms = await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id));
    expect(ms.length).toBe(6 + 3 + 3);
    await expect(advanceToKnockout(db, fed, cat.id)).rejects.toThrow();
    // first named player in each match wins, one match is a walkover
    for (const m of ms) await recordResult(db, fed, m.id, { status: 'COMPLETED', sets: W.sets });
    const tables = await groupStandings(db, cat.id);
    expect(tables.length).toBe(3);
    tables.forEach((g) => expect(g.standings.map((s) => s.rank)).toEqual(g.standings.map((_, i) => i + 1)));
    const r = await advanceToKnockout(db, fed, cat.id);
    expect(r.qualified).toBe(6);
    const ko = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id))).filter((m) => m.stage === 'KO');
    expect(ko.length).toBe(5); // 6 players -> size 8 -> 2 first-round + 2 semis + final
  });
});

describe('scheduling', () => {
  it('auto-schedules respecting courts, exact times and conflicts', async () => {
    const { fed, t, cat } = await setup(8, 'KNOCKOUT');
    await runDraw(db, fed, cat.id, { code: 5 });
    const first = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id))).filter((m) => m.round === 1);
    const start = new Date('2026-11-01T09:00:00Z');
    await setMatchSlot(db, fed, first[0]!.id, { kind: 'EXACT', courtLabel: 'מרכזי', start: new Date('2026-11-01T11:00:00Z') });
    await expect(setMatchSlot(db, fed, first[1]!.id, { kind: 'EXACT', courtLabel: 'מרכזי', start: new Date('2026-11-01T11:30:00Z') })).rejects.toThrow('תפוס');
    await expect(setMatchSlot(db, fed, first[1]!.id, { kind: 'EXACT', courtLabel: '99', start })).rejects.toThrow();
    await setMatchSlot(db, fed, first[2]!.id, { kind: 'NOT_BEFORE', notBefore: new Date('2026-11-01T14:00:00Z') });
    const res = await autoSchedule(db, fed, t.id, { firstDayStart: start, days: 2, dailyMinutes: 600 });
    expect(res.unassigned).toEqual([]);
    expect(res.conflicts).toEqual([]);
    const all = await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id));
    expect(all.every((m) => m.scheduledStart && m.courtLabel)).toBe(true);
    const ex = all.find((m) => m.id === first[0]!.id)!;
    expect(ex.courtLabel).toBe('מרכזי');
    expect(ex.scheduledStart!.toISOString()).toBe('2026-11-01T11:00:00.000Z');
    const nb = all.find((m) => m.id === first[2]!.id)!;
    expect(nb.scheduledStart!.getTime()).toBeGreaterThanOrEqual(new Date('2026-11-01T14:00:00Z').getTime());
    // semis start after their feeders end
    for (const m of all.filter((x) => x.round > 1)) {
      for (const f of m.feederIds as string[]) {
        const fm = all.find((x) => x.id === f)!;
        expect(m.scheduledStart!.getTime()).toBeGreaterThanOrEqual(fm.scheduledStart!.getTime() + fm.durationMin * 60000);
      }
    }
    // no court double-booking
    for (const a of all) for (const b of all) if (a.id < b.id && a.courtLabel === b.courtLabel) {
      const as = a.scheduledStart!.getTime(); const bs = b.scheduledStart!.getTime();
      expect(as < bs + b.durationMin * 60000 && bs < as + a.durationMin * 60000).toBe(false);
    }
  });
});

describe('permissions & registration', () => {
  it('a tournament manager cannot touch someone else\'s tournament', async () => {
    const { fed, t, cat } = await setup(4, 'KNOCKOUT');
    const other = await mkUser('TOURNAMENT_MANAGER', `m${Math.random()}@x.il`);
    await expect(runDraw(db, other.actor as Actor, cat.id)).rejects.toBeInstanceOf(Forbidden);
    await db.insert(schema.tournamentStaff).values({ tournamentId: t.id, userId: other.actor.id, role: 'TOURNAMENT_MANAGER' });
    await runDraw(db, other.actor, cat.id, { code: 1 });
    expect(fed).toBeTruthy();
  });

  it('registration enforces documents, payment and capacity/waitlist', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', `fed${Math.random()}@x.il`);
    const t = await createTournament(db, fed, { name: 'x', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-02'), feeAgorot: 5000 });
    const cat = await addCategory(db, fed, t.id, { name: 'c', gender: 'MALE', capacity: 1 });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
    const p1 = await mkPlayer('A'); const p2 = await mkPlayer('B');
    const girl = await mkPlayer('G', { gender: 'FEMALE' });
    await expect(registerEntry(db, fed, cat.id, girl.id)).rejects.toThrow();
    const e1 = await registerEntry(db, fed, cat.id, p1.id);
    await expect(confirmEntry(db, fed, e1.id)).rejects.toThrow('מסמכים');
    await approveDocs(p1.id);
    await expect(confirmEntry(db, fed, e1.id)).rejects.toThrow('תשלום');
    await recordPayment(db, e1.id, 5000);
    expect(await confirmEntry(db, fed, e1.id)).toBe('CONFIRMED');
    const e2 = await registerEntry(db, fed, cat.id, p2.id);
    await approveDocs(p2.id); await recordPayment(db, e2.id, 5000);
    expect(await confirmEntry(db, fed, e2.id)).toBe('WAITLIST');
  });
});

describe('ranking points by absence reason and national grade table', () => {
  it('applies ITA walkover/retirement points rules and the selected points table', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', `pt${Math.random()}@x.il`);
    const t = await createTournament(db, fed, { name: 'ארצית', startDate: new Date('2026-11-01'), endDate: new Date('2026-11-03'), feeAgorot: 0, pointsTableKey: 'NATIONAL_GRADE2' });
    await setTournamentCourts(db, fed, t.id, [{ label: '1' }]);
    const cat = await addCategory(db, fed, t.id, { name: 'U16', gender: 'MALE' });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
    const es: string[] = [];
    for (let i = 0; i < 4; i++) { const p = await mkPlayer(`Q${i}`); es.push((await registerEntry(db, fed, cat.id, p.id)).id); }
    for (const e of es) await confirmEntry(db, fed, e, { override: true });
    await setStatus(db, fed, t.id, 'REGISTRATION_CLOSED');
    await runDraw(db, fed, cat.id, { code: 5 });
    const r1 = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id))).filter((m) => m.round === 1);
    // match 1: no notice walkover (0 for absentee); match 2: medical-certified walkover (points for the round reached)
    await recordResult(db, fed, r1[0]!.id, { status: 'WALKOVER', absentEntryId: r1[0]!.aEntryId!, reason: 'NO_NOTICE' });
    await recordResult(db, fed, r1[1]!.id, { status: 'WALKOVER', absentEntryId: r1[1]!.aEntryId!, reason: 'NOTICE_MEDICAL' });
    const final = (await db.select().from(schema.matches).where(eq(schema.matches.categoryId, cat.id))).find((m) => m.round === 2)!;
    await recordResult(db, fed, final.id, { status: 'COMPLETED', sets: [{ a: 6, b: 1 }, { a: 6, b: 1 }] });
    await awardPoints(db, fed, cat.id);
    const pts = async (entry: string) => {
      const pid = (await db.select().from(schema.entries).where(eq(schema.entries.id, entry)))[0]!.playerId;
      return (await db.select().from(schema.pointsAwards).where(eq(schema.pointsAwards.playerId, pid)))[0]!.points;
    };
    const fin = (await db.select().from(schema.matches).where(eq(schema.matches.id, final.id)))[0]!;
    expect(await pts(fin.winnerEntryId!)).toBe(750); // grade 2 winner
    expect(await pts(r1[0]!.aEntryId!)).toBe(0); // no-show without notice
    expect(await pts(r1[1]!.aEntryId!)).toBe(470); // notice + medical certificate: points for the semifinal round reached
    const log = (await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'points.award')))[0]!;
    expect(JSON.stringify(log.detail)).toContain('noShowPlayers');
  });
});
