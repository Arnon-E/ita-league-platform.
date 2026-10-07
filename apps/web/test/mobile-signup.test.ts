import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { resetDb } from './helpers';
import { POST as registerRoute } from '@/app/api/v1/auth/register/route';
import { POST as playersRoute } from '@/app/api/v1/players/route';
import { POST as loginRoute } from '@/app/api/v1/auth/login/route';

beforeAll(resetDb);

const post = (body: unknown, token?: string) =>
  new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} });

describe('mobile sign-up', () => {
  it('registers an account, signs in, adds a player profile; rejects bad input', async () => {
    expect((await registerRoute(post({ name: 'x', email: 'bad', password: 'Passw0rd!!' }))).status).toBe(400);
    expect((await registerRoute(post({ name: 'x', email: 'a@b.il', password: 'short' }))).status).toBe(400);

    const res = await registerRoute(post({ name: 'הורה בדיקה', email: 'Parent@Test.il', phone: '050', password: 'Passw0rd!!' }));
    expect(res.status).toBe(200);
    const { token, user } = (await res.json()) as { token: string; user: { role: string } };
    expect(user.role).toBe('PLAYER');
    expect((await registerRoute(post({ name: 'dup', email: 'parent@test.il', password: 'Passw0rd!!' }))).status).toBe(400); // already registered
    expect((await loginRoute(post({ email: 'parent@test.il', password: 'Passw0rd!!' }))).status).toBe(200);

    expect((await playersRoute(post({ first: 'a', last: 'b', birth: 'nope', gender: 'MALE' }, token))).status).toBe(400);
    expect((await playersRoute(post({ first: 'a', last: 'b', birth: '2010-05-05', gender: 'MALE' }, token))).status).toBe(400); // a minor needs a parent
    expect((await playersRoute(post({ first: 'a', last: 'b', birth: '2010-05-05', gender: 'MALE' }))).status).toBe(401);          // needs login

    const ok = await playersRoute(post({ first: 'ילד', last: 'בדיקה', birth: '2010-05-05', gender: 'MALE', forChild: true }, token));
    expect(ok.status).toBe(200);
    const [g] = await db.select().from(schema.guardians);
    expect(g).toBeTruthy();
    const me = await db.select().from(schema.players).where(eq(schema.players.firstName, 'ילד'));
    expect(me.length).toBe(1);
  });
});
