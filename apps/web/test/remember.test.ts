import { beforeAll, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';
import { db } from '@/db';
import { login } from '@/lib/auth';
import { mkUser, resetDb } from './helpers';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';

beforeAll(resetDb);

const days = (token: string) => { const p = decodeJwt(token); return ((p.exp as number) - (p.iat as number)) / 86400; };

describe('keep me signed in', () => {
  it('lasts 12 hours by default and 30 days when asked', async () => {
    await mkUser('PLAYER', 'stay@t.il');
    const short = await login(db, 'stay@t.il', 'Passw0rd!!');
    const long = await login(db, 'stay@t.il', 'Passw0rd!!', new Date(), true);
    expect(short.ok && days(short.token)).toBe(0.5);
    expect(long.ok && days(long.token)).toBe(30);

    const res = await loginRoute(new Request('http://x', { method: 'POST', body: JSON.stringify({ email: 'stay@t.il', password: 'Passw0rd!!', remember: true }) }));
    expect(days(((await res.json()) as { token: string }).token)).toBe(30);
    const res2 = await loginRoute(new Request('http://x', { method: 'POST', body: JSON.stringify({ email: 'stay@t.il', password: 'Passw0rd!!' }) }));
    expect(days(((await res2.json()) as { token: string }).token)).toBe(0.5);
  });
});
