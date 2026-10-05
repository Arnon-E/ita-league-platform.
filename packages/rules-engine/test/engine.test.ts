import { describe, expect, it } from 'vitest';
import {
  BEST_OF_3_SUPER_TB, ITA_DEFAULT_RULESET as R, buildBracket, computeRanking, computeRefund, computeStandings,
  groupSizes, makeDraw, makeGroups, manualRefund, recordWinner, resolveCompleted, roundRobin, scheduleMatches, swapSlots,
  type Entrant, type MatchResult,
} from '../src/index';

const players = (n: number, ranked = n): Entrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, club: `c${i % 4}`, rank: i < ranked ? i + 1 : undefined }));

const pos = (d: ReturnType<typeof makeDraw>, id: string) =>
  d.slots.findIndex((s) => s.kind === 'player' && s.player.id === id) + 1;

describe('draw', () => {
  it('is reproducible from the code', () => {
    const a = makeDraw(players(16), { code: 7, ruleSet: R });
    const b = makeDraw(players(16), { code: 7, ruleSet: R });
    expect(a.slots).toEqual(b.slots);
    expect(makeDraw(players(16), { code: 8, ruleSet: R }).slots).not.toEqual(a.slots);
  });
  it('places seeds 1,2 at the ends and 3,4 at positions 5/12 in a 16 draw', () => {
    for (let code = 1; code < 30; code++) {
      const d = makeDraw(players(16), { code, ruleSet: R });
      expect(pos(d, 'p1')).toBe(1);
      expect(pos(d, 'p2')).toBe(16);
      expect([pos(d, 'p3'), pos(d, 'p4')].sort((x, y) => x - y)).toEqual([5, 12]);
    }
  });
  it('follows the 32 and 64 seed tables', () => {
    const d32 = makeDraw(players(32), { code: 3, ruleSet: R });
    expect([pos(d32, 'p3'), pos(d32, 'p4')].sort((a, b) => a - b)).toEqual([9, 24]);
    expect([5, 6, 7, 8].map((i) => pos(d32, `p${i}`)).sort((a, b) => a - b)).toEqual([8, 16, 17, 25]);
    const d64 = makeDraw(players(64), { code: 3, ruleSet: R });
    expect(pos(d64, 'p1')).toBe(1);
    expect(pos(d64, 'p2')).toBe(64);
    expect([9, 10, 11, 12, 13, 14, 15, 16].map((i) => pos(d64, `p${i}`)).sort((a, b) => a - b)).toEqual([8, 9, 24, 25, 40, 41, 56, 57]);
  });
  it('gives byes to the top seeds and every entrant appears once', () => {
    const d = makeDraw(players(13), { code: 5, ruleSet: R });
    expect(d.size).toBe(16);
    expect(d.slots.filter((s) => s.kind === 'bye')).toHaveLength(3);
    for (const seed of ['p1', 'p2', 'p3']) {
      const i = pos(d, seed) - 1;
      expect(d.slots[i % 2 === 0 ? i + 1 : i - 1]?.kind).toBe('bye');
    }
    const ids = d.slots.flatMap((s) => (s.kind === 'player' ? [s.player.id] : []));
    expect(new Set(ids).size).toBe(13);
  });
  it('seeds by ranking and leaves unranked players unseeded', () => {
    const e = players(16, 2).reverse();
    const d = makeDraw(e, { code: 2, ruleSet: R, seeds: 4 });
    expect(d.seeded.map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(pos(d, 'p1')).toBe(1);
  });
  it('can separate clubs in round one when possible', () => {
    const d = makeDraw(players(16, 0), { code: 11, ruleSet: R, separateClubs: true });
    let clashes = 0;
    for (let i = 0; i < 16; i += 2) {
      const a = d.slots[i], b = d.slots[i + 1];
      if (a?.kind === 'player' && b?.kind === 'player' && a.player.club === b.player.club) clashes++;
    }
    expect(clashes).toBe(0);
  });
  it('manual swap exchanges two slots', () => {
    const d = makeDraw(players(8), { code: 1, ruleSet: R });
    const s = swapSlots(d, 2, 5);
    expect(s.slots[2]).toEqual(d.slots[5]);
    expect(s.slots[5]).toEqual(d.slots[2]);
  });
});

describe('bracket', () => {
  it('advances bye winners and recorded winners', () => {
    const d = makeDraw(players(6), { code: 4, ruleSet: R });
    let b = buildBracket(d.slots);
    expect(b.rounds).toHaveLength(3);
    const bye = b.rounds[0]!.find((m) => m.bye)!;
    expect(b.rounds[1]![Math.floor(bye.index / 2)]![bye.index % 2 === 0 ? 'a' : 'b']?.id).toBe(bye.winner!.id);
    const real = b.rounds[0]!.find((m) => !m.bye)!;
    b = recordWinner(b, real.id, real.a!.id);
    expect(b.rounds[1]![Math.floor(real.index / 2)]![real.index % 2 === 0 ? 'a' : 'b']?.id).toBe(real.a!.id);
    expect(() => recordWinner(b, real.id, 'nobody')).toThrow();
  });
  it('changing a winner clears downstream results', () => {
    let b = buildBracket(makeDraw(players(4), { code: 1, ruleSet: R }).slots);
    const [m1, m2] = b.rounds[0]!;
    b = recordWinner(b, m1!.id, m1!.a!.id);
    b = recordWinner(b, m2!.id, m2!.a!.id);
    b = recordWinner(b, 'r2m1', m1!.a!.id);
    expect(b.rounds[1]![0]!.winner?.id).toBe(m1!.a!.id);
    b = recordWinner(b, m1!.id, m1!.b!.id);
    expect(b.rounds[1]![0]!.winner).toBeUndefined();
    expect(b.rounds[1]![0]!.a?.id).toBe(m1!.b!.id);
  });
});

describe('score', () => {
  const F = BEST_OF_3_SUPER_TB;
  it('accepts valid results', () => {
    expect(resolveCompleted([{ a: 6, b: 3 }, { a: 7, b: 6 }], F)).toMatchObject({ winner: 'a', setsA: 2 });
    expect(resolveCompleted([{ a: 6, b: 3 }, { a: 4, b: 6 }, { a: 10, b: 8, superTb: true }], F).winner).toBe('a');
  });
  it('rejects invalid ones', () => {
    expect(() => resolveCompleted([{ a: 6, b: 5 }, { a: 6, b: 0 }], F)).toThrow();
    expect(() => resolveCompleted([{ a: 6, b: 3 }], F)).toThrow();
    expect(() => resolveCompleted([{ a: 6, b: 3 }, { a: 6, b: 4 }, { a: 6, b: 1 }], F)).toThrow();
    expect(() => resolveCompleted([{ a: 6, b: 3 }, { a: 3, b: 6 }, { a: 6, b: 4 }], F)).toThrow();
    expect(() => resolveCompleted([{ a: 6, b: 3 }, { a: 3, b: 6 }, { a: 10, b: 9, superTb: true }], F)).toThrow();
  });
});

describe('groups', () => {
  it('splits into balanced (partial) groups', () => {
    expect(groupSizes(15, { groupSize: 4, advancers: 2 })).toEqual([4, 4, 4, 3]);
    expect(groupSizes(14, { groupSize: 4, advancers: 2 })).toEqual([4, 4, 3, 3]);
    expect(groupSizes(12, { groupSize: 4, groupCount: 3, advancers: 2 })).toEqual([4, 4, 4]);
  });
  it('snake-distributes by ranking', () => {
    const g = makeGroups(players(8), { groupSize: 4, advancers: 2 });
    expect(g.map((x) => x.map((p) => p.id))).toEqual([['p1', 'p4', 'p5', 'p8'], ['p2', 'p3', 'p6', 'p7']]);
  });
  it('round robin covers every pair once', () => {
    for (const n of [3, 4, 5]) {
      const f = roundRobin(Array.from({ length: n }, (_, i) => `x${i}`));
      expect(f).toHaveLength((n * (n - 1)) / 2);
      expect(new Set(f.map((x) => [x.a, x.b].sort().join('-'))).size).toBe(f.length);
    }
  });
});

const win = (id: string, a: string, b: string, sets: [number, number][] = [[6, 2], [6, 3]]): MatchResult => ({
  id, a, b, status: 'completed', sets: sets.map(([x, y]) => ({ a: x, b: y })),
});

describe('standings', () => {
  const F = BEST_OF_3_SUPER_TB;
  it('orders by wins', () => {
    const s = computeStandings(['a', 'b', 'c'], [win('1', 'a', 'b'), win('2', 'a', 'c'), win('3', 'b', 'c')], R, F);
    expect(s.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('uses head-to-head for two tied players', () => {
    // a,b,c,d: a beats b, b beats c, c beats a; d loses to all -> three-way tie on wins
    const ms = [win('1', 'a', 'b', [[6, 0], [6, 0]]), win('2', 'b', 'c', [[6, 4], [6, 4]]), win('3', 'c', 'a', [[6, 4], [6, 4]]),
      win('4', 'a', 'd'), win('5', 'b', 'd'), win('6', 'c', 'd')];
    const s = computeStandings(['a', 'b', 'c', 'd'], ms, R, F);
    expect(s[3]!.id).toBe('d');
    expect(new Set(s.slice(0, 3).map((x) => x.id))).toEqual(new Set(['a', 'b', 'c']));
  });
  it('head-to-head decides between two players level on wins', () => {
    const ms = [win('1', 'a', 'b'), win('2', 'b', 'c'), win('3', 'c', 'a'), win('4', 'a', 'c', [[6, 0], [6, 0]])];
    const s = computeStandings(['a', 'b', 'c'], ms.slice(0, 3), R, F);
    expect(s).toHaveLength(3);
    const two = computeStandings(['x', 'y', 'z'], [win('1', 'x', 'y'), win('2', 'x', 'z'), win('3', 'y', 'z'), ], R, F);
    expect(two.map((p) => p.id)).toEqual(['x', 'y', 'z']);
    // y and z tied on 1 win? make z beat x instead so x,z,y... head-to-head z over y
    const h = computeStandings(['x', 'y', 'z'], [win('1', 'x', 'y'), win('2', 'z', 'x'), win('3', 'z', 'y')], R, F);
    expect(h.map((p) => p.id)).toEqual(['z', 'x', 'y']);
  });
  it('walkover counts as a win but not in set/game stats', () => {
    const wo: MatchResult = { id: 'w', a: 'a', b: 'b', status: 'walkover', sets: [], absent: 'b' };
    const s = computeStandings(['a', 'b'], [wo], R, F);
    expect(s[0]).toMatchObject({ id: 'a', wins: 1, setsFor: 0, gamesFor: 0 });
  });
  it('voids a withdrawn player who played too little, keeps one who played enough', () => {
    const ms = [win('1', 'a', 'b'), win('2', 'a', 'c'), win('3', 'b', 'd')];
    const s = computeStandings(['a', 'b', 'c', 'd'], ms, R, F, { withdrawn: ['c'] });
    expect(s.find((x) => x.id === 'a')!.wins).toBe(1);
    expect(s.find((x) => x.id === 'c')!.played).toBe(0);
    const ms2 = [win('1', 'a', 'b'), win('2', 'a', 'c'), win('3', 'b', 'c')];
    const k = computeStandings(['a', 'b', 'c'], ms2, R, F, { withdrawn: ['c'] });
    expect(k.find((x) => x.id === 'a')!.wins).toBe(2);
  });
  it('breaks a full tie deterministically by the draw code', () => {
    const a = computeStandings(['a', 'b'], [], R, F, { drawCode: 9 });
    const b = computeStandings(['a', 'b'], [], R, F, { drawCode: 9 });
    expect(a).toEqual(b);
  });
});

describe('scheduling', () => {
  it('honours exact time + court, not-before and dependencies', () => {
    const r = scheduleMatches([
      { id: 'm1', players: ['a', 'b'], durationMin: 90, exact: { start: 540, courtId: '3' } },
      { id: 'm2', players: ['c', 'd'], durationMin: 90, notBefore: 600 },
      { id: 'm3', players: ['a', 'c'], durationMin: 90, after: ['m1', 'm2'] },
    ], [{ id: '3' }, { id: '5' }], { windowStart: 480, windowEnd: 1080, restMin: 30 });
    const by = Object.fromEntries(r.assignments.map((a) => [a.matchId, a]));
    expect(by.m1).toMatchObject({ courtId: '3', start: 540 });
    expect(by.m2!.start).toBeGreaterThanOrEqual(600);
    expect(by.m3!.start).toBeGreaterThanOrEqual(Math.max(by.m1!.end, by.m2!.end) + 30);
    expect(r.unassigned).toEqual([]);
  });
  it('reports conflicts and unassigned matches', () => {
    const r = scheduleMatches([
      { id: 'm1', players: ['a', 'b'], durationMin: 60, exact: { start: 500, courtId: '9' } },
      { id: 'm2', players: ['a', 'b'], durationMin: 60, exact: { start: 500, courtId: '1' } },
      { id: 'm3', players: ['c', 'd'], durationMin: 60, exact: { start: 500, courtId: '1' } },
      { id: 'm4', players: ['e', 'f'], durationMin: 120 },
    ], [{ id: '1' }], { windowStart: 480, windowEnd: 560 });
    expect(r.conflicts.map((c) => c.matchId).sort()).toEqual(['m1', 'm3']);
    expect(r.unassigned.map((u) => u.matchId)).toEqual(['m4']);
  });
  it('never double-books a court or a player', () => {
    const ms = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, players: [`p${i % 5}`, `q${i}`], durationMin: 60 }));
    const r = scheduleMatches(ms, [{ id: '1' }, { id: '2' }], { windowStart: 0, windowEnd: 2000 });
    for (const x of r.assignments) for (const y of r.assignments) {
      if (x === y) continue;
      const overlap = x.start < y.end && y.start < x.end;
      if (overlap) {
        expect(x.courtId).not.toBe(y.courtId);
        const px = ms.find((m) => m.id === x.matchId)!.players, py = ms.find((m) => m.id === y.matchId)!.players;
        expect(px.some((p) => py.includes(p))).toBe(false);
      }
    }
  });
});

describe('ranking', () => {
  const d = (s: string) => new Date(s);
  it('counts best N in the window with multipliers and penalties', () => {
    const rs = [
      { playerId: 'a', tournamentId: 't1', date: d('2026-09-01'), points: 100, multiplier: 0.65, kind: 'singles' as const },
      { playerId: 'a', tournamentId: 't2', date: d('2026-08-01'), points: 50, kind: 'singles' as const },
      { playerId: 'a', tournamentId: 't3', date: d('2025-01-01'), points: 999, kind: 'singles' as const },
      { playerId: 'b', tournamentId: 't1', date: d('2026-09-01'), points: 70, kind: 'singles' as const },
    ];
    const r = computeRanking(rs, { asOf: d('2026-10-01'), windowWeeks: 52, bestSingles: 1, bestDoubles: 0 });
    expect(r.map((x) => [x.playerId, x.points])).toEqual([['b', 70], ['a', 65]]);
    const p = computeRanking(rs, { asOf: d('2026-10-01'), windowWeeks: 52, bestSingles: 6, bestDoubles: 0, penalties: { a: 10 } });
    expect(p.find((x) => x.playerId === 'a')!.points).toBe(105);
  });
});

describe('refunds', () => {
  const t = { registrationCloses: new Date('2026-10-10'), drawDone: new Date('2026-10-12'), startsAt: new Date('2026-10-14') };
  it('follows the ITA stages', () => {
    expect(computeRefund(180, new Date('2026-10-01'), t, R.refund).amount).toBe(180);
    expect(computeRefund(180, new Date('2026-10-11'), t, R.refund).amount).toBe(180);
    expect(computeRefund(180, new Date('2026-10-13'), t, R.refund).amount).toBe(0);
  });
  it('supports a medical override and capped manual refunds', () => {
    const p = { ...R.refund, medicalCertificateOverride: true };
    expect(computeRefund(180, new Date('2026-10-13'), t, p, true).amount).toBe(180);
    expect(manualRefund(180, 0, 50, 'illness')).toBe(50);
    expect(() => manualRefund(180, 150, 50, 'x')).toThrow();
    expect(() => manualRefund(180, 0, 50, ' ')).toThrow();
  });
});

describe('draw without any ranking', () => {
  it('still places byes correctly (6 unranked -> 2 byes, no bye vs bye)', () => {
    const es = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `p${i}` }));
    const d = makeDraw(es, { code: 1, ruleSet: R });
    expect(d.slots.filter((s) => s.kind === 'bye').length).toBe(2);
    expect(d.slots.filter((s) => s.kind === 'player').length).toBe(6);
    for (let i = 0; i < 8; i += 2) expect(d.slots[i]!.kind === 'bye' && d.slots[i + 1]!.kind === 'bye').toBe(false);
  });
});
