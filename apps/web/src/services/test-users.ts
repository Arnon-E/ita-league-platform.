import { randomInt } from 'node:crypto';
import { eq, like, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { signUp } from './accounts';
import { deletePlayersById } from './loglig-competitions';

/** Test accounts are recognisable by this address suffix (a reserved TLD that can never receive mail). Listed in docs/test-users.md. */
export const TEST_DOMAIN = '@ita-test.invalid';
const NAME = '[TEST] משתמש בדיקה';

const ALPHA = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ', DIGITS = '23456789';
const pick = (set: string) => set[randomInt(set.length)]!;
function password() {
  const chars = [...Array.from({ length: 10 }, () => pick(ALPHA)), ...Array.from({ length: 4 }, () => pick(DIGITS))];
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j]!, chars[i]!]; }
  return chars.join('');
}

/** Creates one clearly-marked test account and returns its one-time password. Role is PLAYER or FEDERATION_ADMIN. */
export async function createTestUser(db: Db, role: 'PLAYER' | 'FEDERATION_ADMIN' | 'SUPER_ADMIN') {
  const email = `qa-test-${role === 'PLAYER' ? 'player' : role === 'SUPER_ADMIN' ? 'superadmin' : 'admin'}${TEST_DOMAIN}`;
  const pw = password();
  const u = await signUp(db, { email, password: pw, name: NAME });
  if (role !== 'PLAYER') await db.update(schema.users).set({ role }).where(eq(schema.users.id, u.id));
  return { email, password: pw, role };
}

/** Deletes every test account with everything it owns (profiles, entries, follows, notifications...). Safe to run repeatedly. */
export async function removeTestUsers(db: Db) {
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.email, `%${TEST_DOMAIN}`));
  if (!users.length) return { users: 0, players: 0 };
  const ids = users.map((u) => u.id);
  const list = JSON.stringify(ids);
  const owned = (await db.execute(sql`select id from players where account_id in (select jsonb_array_elements_text(${list}::jsonb))`)) as unknown as { id: string }[];
  if (owned.length) await deletePlayersById(db, owned.map((r) => r.id));
  // every other table that points at users: clear nullable references, delete rows where the reference is required
  const refs = (await db.execute(sql`
    select c.conrelid::regclass::text as tbl, a.attname as col, a.attnotnull as notnull
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'users'::regclass`)) as unknown as { tbl: string; col: string; notnull: boolean }[];
  for (const r of refs) {
    const t = sql.raw(r.tbl), c = sql.raw(`"${r.col.replace(/"/g, '')}"`);
    if (r.notnull) await db.execute(sql`delete from ${t} where ${c} in (select jsonb_array_elements_text(${list}::jsonb))`);
    else await db.execute(sql`update ${t} set ${c} = null where ${c} in (select jsonb_array_elements_text(${list}::jsonb))`);
  }
  await db.execute(sql`delete from users where id in (select jsonb_array_elements_text(${list}::jsonb))`);
  return { users: ids.length, players: owned.length };
}
