import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { mkUser, resetDb } from './helpers';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';
import { GET as listRoute } from '@/app/api/v1/tournaments/route';
import { GET as meRoute } from '@/app/api/v1/me/route';
import { POST as deviceRoute } from '@/app/api/v1/devices/route';
import { createTournament } from '@/services/tournaments';

beforeAll(resetDb);
const json = (url: string, body: unknown, token?: string) => new Request(url, { method: 'POST', body: JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('mobile API v1', () => {
  it('rejects anonymous, logs in, serves data with the bearer token, locks after 5 failures', async () => {
    const fed = await mkUser('FEDERATION_ADMIN', 'api@x.il');
    await createTournament(db, fed.actor, { name: 'T', startDate: new Date(), endDate: new Date() });
    expect((await listRoute(new Request('http://x/api/v1/tournaments'))).status).toBe(401);
    const res = await loginRoute(json('http://x/api/v1/auth/login', { email: 'api@x.il', password: 'Passw0rd!!' }));
    expect(res.status).toBe(200);
    const { token } = await res.json() as { token: string };
    const h = { headers: { authorization: `Bearer ${token}` } };
    const list = await (await listRoute(new Request('http://x', h))).json() as { name: string }[];
    expect(list[0]!.name).toBe('T');
    expect((await meRoute(new Request('http://x', h))).status).toBe(200);
    expect((await deviceRoute(json('http://x', { token: 'abc', platform: 'ios' }, token))).status).toBe(200);
    expect((await deviceRoute(json('http://x', { token: 'abc', platform: 'plan9' }, token))).status).toBe(400);
    expect((await listRoute(new Request('http://x', { headers: { authorization: 'Bearer garbage' } }))).status).toBe(401);
    let last = 0;
    for (let i = 0; i < 5; i++) last = (await loginRoute(json('http://x', { email: 'api@x.il', password: 'wrong-pass-1' }))).status;
    expect(last).toBe(423);
    expect((await loginRoute(json('http://x', { email: 'api@x.il', password: 'Passw0rd!!' }))).status).toBe(423);
  });
});

import { impersonate, setUserRole, recentAudit } from '@/services/users';
import { verifySession } from '@/lib/auth';
import { Forbidden } from '@/lib/permissions';
import { createTournament as mkT } from '@/services/tournaments';

describe('super admin', () => {
  it('guards role grants, impersonation is audited and attributed', async () => {
    const sa = await mkUser('SUPER_ADMIN', 'sa@x.il');
    const fed = await mkUser('FEDERATION_ADMIN', 'fa@x.il');
    const pl = await mkUser('PLAYER', 'pp@x.il');
    await expect(setUserRole(db, fed.actor, pl.actor.id, 'FEDERATION_ADMIN')).rejects.toThrow('רק מנהל על');
    await setUserRole(db, fed.actor, pl.actor.id, 'TOURNAMENT_MANAGER');
    await expect(setUserRole(db, sa.actor, sa.actor.id, 'PLAYER')).rejects.toThrow('עצמך');
    await expect(impersonate(db, fed.actor, pl.actor.id)).rejects.toBeInstanceOf(Forbidden);
    const tok = await impersonate(db, sa.actor, pl.actor.id);
    const as = (await verifySession(tok))!;
    expect(as.id).toBe(pl.actor.id);
    expect(as.impersonatedBy).toBe(sa.actor.id);
    await expect(impersonate(db, as, fed.actor.id)).rejects.toBeInstanceOf(Forbidden); // no chaining
    await expect(mkT(db, as, { name: 'x', startDate: new Date(), endDate: new Date() })).resolves.toBeTruthy();
    const log = await recentAudit(db, sa.actor);
    expect(log.some((l) => l.action === 'impersonate.start')).toBe(true);
    const created = log.find((l) => l.action === 'tournament.create' && l.impersonatedBy === sa.actor.id);
    expect(created).toBeTruthy();
  });
});

import { POST as docRoute } from '@/app/api/v1/documents/route';
import { GET as openRoute, POST as enterRoute } from '@/app/api/v1/entries/route';
import { signUp, addPlayerProfile } from '@/services/accounts';
import { signSession } from '@/lib/auth';
import { addCategory, setStatus } from '@/services/tournaments';

describe('mobile self-service', () => {
  it('a parent uploads a document and registers a child via the API', async () => {
    process.env.STORAGE_DIR = '/tmp/ita-test-storage';
    const fed = await mkUser('FEDERATION_ADMIN', 'ms@x.il');
    const t = await mkT(db, fed.actor, { name: 'Open', startDate: new Date(), endDate: new Date(), feeAgorot: 0 });
    const cat = await addCategory(db, fed.actor, t.id, { name: 'U12', gender: 'MALE' });
    await setStatus(db, fed.actor, t.id, 'REGISTRATION_OPEN');
    const u = await signUp(db, { email: 'mom@x.il', password: 'Passw0rd!!', name: 'אמא' });
    const kid = await addPlayerProfile(db, { id: u.id, role: u.role }, { firstName: 'ק', lastName: 'ט', birthDate: new Date('2014-01-01'), gender: 'MALE', forChild: true });
    const token = await signSession({ id: u.id, role: u.role });
    const auth = { authorization: `Bearer ${token}` };
    const open = await (await openRoute(new Request('http://x', { headers: auth }))).json() as { categoryId: string }[];
    expect(open.map((o) => o.categoryId)).toContain(cat.id);
    const reg = await enterRoute(new Request('http://x', { method: 'POST', headers: auth, body: JSON.stringify({ categoryId: cat.id, playerId: kid.id }) }));
    expect(reg.status).toBe(200);
    const fd = new FormData();
    fd.set('player', kid.id); fd.set('type', 'ID_PHOTO');
    fd.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])], 'id.jpg', { type: 'image/jpeg' }));
    const up = await docRoute(new Request('http://x', { method: 'POST', headers: auth, body: fd }));
    expect(up.status).toBe(200);
    const bad = new FormData(); bad.set('player', kid.id); bad.set('type', 'ID_PHOTO'); bad.set('file', new File(['hello'], 'x.jpg', { type: 'image/jpeg' }));
    expect((await docRoute(new Request('http://x', { method: 'POST', headers: auth, body: bad }))).status).toBe(400);
  });
});
