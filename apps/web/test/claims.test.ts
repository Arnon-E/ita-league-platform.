import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkUser, resetDb } from './helpers';
import { addPlayerProfile } from '@/services/accounts';
import { ClaimPending, claimPlayer, linkPlayer, listClaims, resolveClaim, unlinkPlayer } from '@/services/claims';
import { hashNationalId } from '@/services/imports';
import { ownedPlayerIds } from '@/services/entries';
import { Forbidden } from '@/lib/permissions';

beforeAll(resetDb);

const NID = '123456782';
const BIRTH = new Date('1995-03-10T00:00:00Z');

async function imported(first: string, last: string, opts: { nid?: string; birth?: Date } = {}) {
  const [p] = await db.insert(schema.players).values({
    firstName: first, lastName: last, birthDate: opts.birth ?? BIRTH, gender: 'MALE', idHash: opts.nid ? hashNationalId(opts.nid) : null,
  }).returning();
  return p!;
}
const pendingOf = async (fn: () => Promise<unknown>) => {
  try { await fn(); } catch (e) { if (e instanceof ClaimPending) return e; throw e; }
  throw new Error('expected a pending claim');
};

describe('linking accounts to imported players', () => {
  it('links automatically when ID and birth date match', async () => {
    const p = await imported('דניאל', 'ארז', { nid: NID });
    const { actor } = await mkUser('PLAYER', 'daniel@x.il');
    const linked = await claimPlayer(db, actor, { firstName: 'דניאל', lastName: 'ארז', birthDate: BIRTH, nationalId: NID });
    expect(linked.id).toBe(p.id);
    expect((await db.select().from(schema.players).where(eq(schema.players.id, p.id)))[0]!.accountId).toBe(actor.id);
    expect(await ownedPlayerIds(db, actor)).toContain(p.id);
    // linking twice is refused, and a second account cannot take it over automatically
    await expect(claimPlayer(db, actor, { firstName: 'דניאל', lastName: 'ארז', birthDate: BIRTH, nationalId: NID })).rejects.toThrow('כבר קיים');
    const { actor: other } = await mkUser('PLAYER', 'other@x.il');
    await pendingOf(() => claimPlayer(db, other, { firstName: 'דניאל', lastName: 'ארז', birthDate: BIRTH, nationalId: NID }));
  });

  it('the add-player form links instead of rejecting a known ID', async () => {
    const p = await imported('רונית', 'כהן', { nid: '987654321' });
    const { actor } = await mkUser('PLAYER', 'ronit@x.il');
    const row = await addPlayerProfile(db, actor, { firstName: 'רונית', lastName: 'כהן', birthDate: BIRTH, gender: 'FEMALE', nationalId: '987654321' });
    expect(row.id).toBe(p.id);
  });

  it('queues a request when the birth date differs, and an admin approves it', async () => {
    const p = await imported('יעל', 'לוי', { nid: '111111118' });
    const { actor } = await mkUser('PLAYER', 'yael@x.il');
    const e = await pendingOf(() => claimPlayer(db, actor, { firstName: 'יעל', lastName: 'לוי', birthDate: new Date('1996-01-01'), nationalId: '111111118' }));
    expect((await db.select().from(schema.players).where(eq(schema.players.id, p.id)))[0]!.accountId).toBeNull();
    await expect(pendingOf(() => claimPlayer(db, actor, { firstName: 'יעל', lastName: 'לוי', birthDate: new Date('1996-01-01'), nationalId: '111111118' }))).rejects.toThrow('ממתינה');

    await expect(listClaims(db, actor)).rejects.toBeInstanceOf(Forbidden);
    const fed = (await mkUser('FEDERATION_ADMIN', 'fed@x.il')).actor;
    const list = await listClaims(db, fed);
    expect(list.find((r) => r.c.id === e.requestId)?.p?.id).toBe(p.id);
    await expect(resolveClaim(db, fed, e.requestId, 'REJECTED')).rejects.toThrow('סיבת דחייה');
    await resolveClaim(db, fed, e.requestId, 'APPROVED');
    expect((await db.select().from(schema.players).where(eq(schema.players.id, p.id)))[0]!.accountId).toBe(actor.id);
    await expect(resolveClaim(db, fed, e.requestId, 'APPROVED')).rejects.toThrow('כבר טופלה');
  });

  it('finds a player without ID by exact name and birth date, and admin approval stores the ID hash', async () => {
    const p = await imported('אלון', 'שמש');
    const { actor } = await mkUser('PLAYER', 'alon@x.il');
    const e = await pendingOf(() => claimPlayer(db, actor, { firstName: 'אלון', lastName: 'שמש', birthDate: BIRTH, nationalId: '222222226' }));
    const fed = (await mkUser('FEDERATION_ADMIN', 'fed2@x.il')).actor;
    await resolveClaim(db, fed, e.requestId, 'APPROVED');
    const after = (await db.select().from(schema.players).where(eq(schema.players.id, p.id)))[0]!;
    expect(after.accountId).toBe(actor.id);
    expect(after.idHash).toBe(hashNationalId('222222226'));
  });

  it('a request with no candidate can be rejected, or approved onto a player the admin picks', async () => {
    const { actor } = await mkUser('PLAYER', 'nobody@x.il');
    const fed = (await mkUser('FEDERATION_ADMIN', 'fed3@x.il')).actor;
    const e1 = await pendingOf(() => claimPlayer(db, actor, { firstName: 'לא', lastName: 'קיים', birthDate: BIRTH }));
    await expect(resolveClaim(db, fed, e1.requestId, 'APPROVED')).rejects.toThrow('בחרו שחקן');
    await resolveClaim(db, fed, e1.requestId, 'REJECTED', { note: 'לא נמצא' });
    const target = await imported('נמצא', 'סוף');
    const e2 = await pendingOf(() => claimPlayer(db, actor, { firstName: 'שם', lastName: 'אחר', birthDate: BIRTH }));
    await resolveClaim(db, fed, e2.requestId, 'APPROVED', { playerId: target.id });
    expect(await ownedPlayerIds(db, actor)).toContain(target.id);
  });

  it('children link as guardians, only while nobody else is their guardian', async () => {
    const kid = await imported('ילד', 'קטן', { nid: '333333334', birth: new Date('2014-06-01T00:00:00Z') });
    const parent = (await mkUser('PLAYER', 'p1@x.il')).actor;
    const other = (await mkUser('PLAYER', 'p2@x.il')).actor;
    await expect(claimPlayer(db, parent, { firstName: 'ילד', lastName: 'קטן', birthDate: new Date('2014-06-01'), nationalId: '333333334' })).rejects.toThrow('הורה');
    await claimPlayer(db, parent, { firstName: 'ילד', lastName: 'קטן', birthDate: new Date('2014-06-01'), nationalId: '333333334', forChild: true });
    expect(await ownedPlayerIds(db, parent)).toContain(kid.id);
    await pendingOf(() => claimPlayer(db, other, { firstName: 'ילד', lastName: 'קטן', birthDate: new Date('2014-06-01'), nationalId: '333333334', forChild: true }));
  });

  it('admin links and unlinks manually, without taking over a linked player', async () => {
    const p = await imported('ידני', 'שיוך');
    const u1 = await mkUser('PLAYER', 'm1@x.il');
    const u2 = await mkUser('PLAYER', 'm2@x.il');
    const fed = (await mkUser('FEDERATION_ADMIN', 'fed4@x.il')).actor;
    await expect(linkPlayer(db, u1.actor, p.id, u1.user.id)).rejects.toBeInstanceOf(Forbidden);
    await linkPlayer(db, fed, p.id, u1.user.id);
    await expect(linkPlayer(db, fed, p.id, u2.user.id)).rejects.toThrow('כבר משויך');
    await linkPlayer(db, fed, p.id, u2.user.id, true); // as guardian
    expect(await ownedPlayerIds(db, u2.actor)).toContain(p.id);
    await unlinkPlayer(db, fed, p.id);
    await unlinkPlayer(db, fed, p.id, u2.user.id);
    expect(await ownedPlayerIds(db, u1.actor)).not.toContain(p.id);
    expect(await ownedPlayerIds(db, u2.actor)).not.toContain(p.id);
    await linkPlayer(db, fed, p.id, u2.user.id);
    expect(await ownedPlayerIds(db, u2.actor)).toContain(p.id);
  });

  it('a manual link settles the same user\'s open request for that player', async () => {
    const p = await imported('סגור', 'בקשה', { nid: '444444442' });
    const u = await mkUser('PLAYER', 'settle@x.il');
    const fed = (await mkUser('FEDERATION_ADMIN', 'fed5@x.il')).actor;
    const e = await pendingOf(() => claimPlayer(db, u.actor, { firstName: 'סגור', lastName: 'בקשה', birthDate: new Date('1990-01-01'), nationalId: '444444442' }));
    await linkPlayer(db, fed, p.id, u.user.id);
    expect((await db.select().from(schema.claimRequests).where(eq(schema.claimRequests.id, e.requestId)))[0]!.status).toBe('APPROVED');
    await expect(resolveClaim(db, fed, e.requestId, 'REJECTED', { note: 'x' })).rejects.toThrow('כבר טופלה');
  });
});
