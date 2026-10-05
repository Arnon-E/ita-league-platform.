import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { addPlayerProfile, signUp } from '@/services/accounts';
import { reviewDocument, uploadDocument } from '@/services/documents';
import { checkDocuments } from '@/services/entries';
import { dispatchQueued, notifyUser, setPref } from '@/services/notifications';
import { importPlayersCsv, importPointsCsv, parseCsv } from '@/services/imports';
import { signedUrl, verifySigned } from '@/lib/storage';
import { Forbidden } from '@/lib/permissions';
import { POST as webhook } from '@/app/api/webhooks/payments/route';
import { createHmac } from 'node:crypto';

process.env.STORAGE_DIR = '/tmp/ita-test-storage';
process.env.PAYMENT_WEBHOOK_SECRET = 'whsec';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);

beforeAll(resetDb);

describe('accounts & documents', () => {
  it('signs up players, guardian creates a child, documents gate eligibility', async () => {
    await expect(signUp(db, { email: 'bad', password: 'Passw0rd!!', name: 'x' })).rejects.toThrow();
    await expect(signUp(db, { email: 'a@b.il', password: 'short', name: 'x' })).rejects.toThrow();
    const u = await signUp(db, { email: 'Parent@x.il', password: 'Passw0rd!!', name: 'הורה' });
    await expect(signUp(db, { email: 'parent@x.il', password: 'Passw0rd!!', name: 'dup' })).rejects.toThrow('כבר רשומה');
    const actor = { id: u.id, role: u.role };
    await expect(addPlayerProfile(db, actor, { firstName: 'ילד', lastName: 'א', birthDate: new Date('2012-01-01'), gender: 'MALE' })).rejects.toThrow('הורה');
    const kid = await addPlayerProfile(db, actor, { firstName: 'ילד', lastName: 'א', birthDate: new Date('2012-01-01'), gender: 'MALE', forChild: true, nationalId: '123456782' });
    await expect(addPlayerProfile(db, actor, { firstName: 'כפול', lastName: 'ב', birthDate: new Date('2012-01-01'), gender: 'MALE', forChild: true, nationalId: '123456782' })).rejects.toThrow('כבר קיים');
    const stored = (await db.select().from(schema.players).where(eq(schema.players.id, kid.id)))[0]!;
    expect(stored.idHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain('123456782');

    // upload rules
    await expect(uploadDocument(db, actor, kid.id, 'ID_PHOTO', new TextEncoder().encode('not an image'), 'image/jpeg')).rejects.toThrow('סוג קובץ');
    await expect(uploadDocument(db, actor, kid.id, 'ID_PHOTO', JPEG, 'application/pdf')).rejects.toThrow('סוג קובץ');
    const stranger = await mkUser('PLAYER', 's@x.il');
    await expect(uploadDocument(db, stranger.actor, kid.id, 'ID_PHOTO', JPEG, 'image/jpeg')).rejects.toBeInstanceOf(Forbidden);

    const d1 = await uploadDocument(db, actor, kid.id, 'ID_PHOTO', JPEG, 'image/jpeg');
    const d2 = await uploadDocument(db, actor, kid.id, 'MEDICAL_CERTIFICATE', JPEG, 'image/jpeg', new Date('2099-01-01'));
    const d3 = await uploadDocument(db, actor, kid.id, 'PARENT_CONSENT', JPEG, 'image/jpeg');
    expect((await checkDocuments(db, kid.id, new Date())).ok).toBe(false); // nothing approved yet
    await expect(reviewDocument(db, actor, d1.id, 'APPROVED')).rejects.toBeInstanceOf(Forbidden);
    const fed = await mkUser('FEDERATION_ADMIN', 'f@x.il');
    await expect(reviewDocument(db, fed.actor, d1.id, 'REJECTED')).rejects.toThrow('סיבת דחייה');
    for (const d of [d1, d2, d3]) await reviewDocument(db, fed.actor, d.id, 'APPROVED');
    expect((await checkDocuments(db, kid.id, new Date())).ok).toBe(true);
    expect((await checkDocuments(db, kid.id, new Date('2100-01-01'))).missing).toContain('MEDICAL_CERTIFICATE'); // expired
    // the guardian was notified (PUSH + EMAIL per decision)
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, u.id));
    expect(notes.length).toBe(6);
  });

  it('signed URLs expire and cannot be tampered with', () => {
    const url = new URL('http://x' + signedUrl('players/a/b', 60, 1_000_000));
    const key = url.searchParams.get('key')!; const exp = Number(url.searchParams.get('exp')); const sig = url.searchParams.get('sig')!;
    expect(verifySigned(key, exp, sig, 1_000_000)).toBe(true);
    expect(verifySigned(key, exp, sig, 1_000_000 + 61_000)).toBe(false);
    expect(verifySigned('players/a/other', exp, sig, 1_000_000)).toBe(false);
  });
});

describe('notifications', () => {
  it('respects preferences and retries failed sends', async () => {
    const u = await mkUser('PLAYER', 'n@x.il');
    expect(await notifyUser(db, u.actor.id, 'draw.published', 't', 'b')).toBe(2);
    await setPref(db, u.actor.id, 'EMAIL', 'draw.published', false);
    expect(await notifyUser(db, u.actor.id, 'draw.published', 't2', 'b')).toBe(1);
    let calls = 0;
    const r1 = await dispatchQueued(db, { PUSH: async () => { calls++; if (calls === 1) throw new Error('down'); }, EMAIL: async () => {} });
    expect(r1.failed).toBeGreaterThanOrEqual(1);
    const r2 = await dispatchQueued(db, { PUSH: async () => {}, EMAIL: async () => {} });
    expect(r2.failed).toBe(0);
    const left = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, u.actor.id));
    expect(left.every((n) => n.status === 'SENT')).toBe(true);
  });
});

describe('loglig import', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([{ a: 'x, y', b: 'he said "hi"' }]);
  });

  it('imports players idempotently, dedupes by hashed id, reports bad rows, dry-run writes nothing', async () => {
    const fed = (await mkUser('FEDERATION_ADMIN', 'imp@x.il')).actor;
    const csv = 'loglig_id,first_name,last_name,birth_date,gender,club,id_number\n'
      + '101,דני,כהן,15/03/2009,בנים,הרצליה,111222333\n102,נועה,לוי,2010-07-01,female,חיפה,\n103,,חסר,2010-07-01,male,,\n104,רע,תאריך,not-a-date,male,,\n';
    const dry = await importPlayersCsv(db, fed, csv, { dryRun: true });
    expect(dry.errors.length).toBe(2);
    expect((await db.select().from(schema.players).where(eq(schema.players.logligId, '101'))).length).toBe(0);
    const r1 = await importPlayersCsv(db, fed, csv);
    expect(r1).toMatchObject({ created: 2, updated: 0 });
    const r2 = await importPlayersCsv(db, fed, csv);
    expect(r2).toMatchObject({ created: 0, updated: 2 });
    expect((await db.select().from(schema.clubs)).length).toBe(2);
    const pts = 'loglig_id,tournament,date,points,multiplier,kind\n101,אליפות,01/06/2026,80,1,singles\n999,x,01/06/2026,5,1,singles\n';
    const p1 = await importPointsCsv(db, fed, pts);
    expect(p1.created).toBe(1); expect(p1.errors.length).toBe(1);
    const p2 = await importPointsCsv(db, fed, pts);
    expect(p2.updated).toBe(1);
    expect((await db.select().from(schema.pointsAwards)).length).toBe(1);
    const plain = await mkUser('PLAYER', 'pl@x.il');
    await expect(importPlayersCsv(db, plain.actor, csv)).rejects.toBeInstanceOf(Forbidden);
  });
});

describe('payment webhook', () => {
  it('verifies the signature and is idempotent on providerRef', async () => {
    const fed = (await mkUser('FEDERATION_ADMIN', 'wh@x.il')).actor;
    const t = (await db.insert(schema.tournaments).values({ name: 'w', startDate: new Date(), endDate: new Date(), ruleSetId: (await db.insert(schema.ruleSets).values({ key: 'k', version: 1, name: 'k', data: {} }).returning())[0]!.id, feeAgorot: 100 }).returning())[0]!;
    const c = (await db.insert(schema.categories).values({ tournamentId: t.id, name: 'c', gender: 'MALE' }).returning())[0]!;
    const p = await mkPlayer('W');
    const e = (await db.insert(schema.entries).values({ categoryId: c.id, playerId: p.id }).returning())[0]!;
    const body = JSON.stringify({ entryId: e.id, amountAgorot: 100, providerRef: 'ref-1' });
    const sign = (b: string) => createHmac('sha256', 'whsec').update(b).digest('hex');
    const mk = (b: string, s: string) => new Request('http://x/api/webhooks/payments', { method: 'POST', body: b, headers: { 'x-signature': s } });
    expect((await webhook(mk(body, 'bad'))).status).toBe(401);
    expect((await webhook(mk(body, sign(body)))).status).toBe(200);
    expect((await webhook(mk(body, sign(body)))).status).toBe(200);
    expect((await db.select().from(schema.payments)).length).toBe(1);
    expect((await db.select().from(schema.ledger)).length).toBe(1);
    expect((await db.select().from(schema.entries).where(eq(schema.entries.id, e.id)))[0]!.paymentStatus).toBe('PAID');
    expect(fed).toBeTruthy();
  });
});
