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
