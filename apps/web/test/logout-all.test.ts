import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { login, revokeSessions, verifySession } from '@/lib/auth';
import { mkUser, resetDb } from './helpers';
import { POST as logoutAll } from '@/app/api/v1/auth/logout-all/route';
import { GET as meRoute } from '@/app/api/v1/me/route';

beforeAll(resetDb);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('sign out everywhere', () => {
  it('ends every earlier session, but a new sign-in works', async () => {
    const { user } = await mkUser('PLAYER', 'multi@t.il');
    const phone = await login(db, 'multi@t.il', 'Passw0rd!!', new Date(), true);
    const laptop = await login(db, 'multi@t.il', 'Passw0rd!!');
    if (!phone.ok || !laptop.ok) throw new Error('login');
    expect(await verifySession(phone.token)).not.toBeNull();
    expect(await verifySession(laptop.token)).not.toBeNull();

    await sleep(1100); // tokens are stamped to the second
    const res = await logoutAll(new Request('http://x', { method: 'POST', headers: { authorization: `Bearer ${phone.token}` } }));
    expect(res.status).toBe(200);

    expect(await verifySession(phone.token)).toBeNull();
    expect(await verifySession(laptop.token)).toBeNull();
    expect((await meRoute(new Request('http://x', { headers: { authorization: `Bearer ${laptop.token}` } }))).status).toBe(401);

    await sleep(1100);
    const again = await login(db, 'multi@t.il', 'Passw0rd!!');
    expect(again.ok && (await verifySession(again.token))?.id).toBe(user.id);
    await revokeSessions(db, user.id);
  });
});
