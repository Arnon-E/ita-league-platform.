import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import type { Actor } from '@/lib/auth';
import { createCheckoutSession } from '@/lib/stripe';
import { ownedPlayerIds } from './entries';

/** Hosted checkout for the tournament fee. Only the player or guardian can pay for their entry. */
export async function startCheckout(db: Db, actor: Actor, entryId: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('התשלום המקוון אינו מוגדר');
  const [row] = await db.select({ e: schema.entries, t: schema.tournaments, c: schema.categories }).from(schema.entries)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.entries.categoryId)).innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.categories.tournamentId)).where(eq(schema.entries.id, entryId));
  if (!row) throw new Error('Entry not found');
  if (!(await ownedPlayerIds(db, actor)).includes(row.e.playerId)) throw new Error('אין הרשאה');
  if (row.e.paymentStatus === 'PAID') throw new Error('כבר שולם');
  if (row.t.feeAgorot <= 0) throw new Error('אין תשלום לתחרות זו');
  const base = process.env.PUBLIC_URL ?? 'http://localhost:3000';
  return createCheckoutSession(key, { entryId, amountAgorot: row.t.feeAgorot, description: `${row.t.name} — ${row.c.name}`, successUrl: `${base}/me?ok=${encodeURIComponent('התשלום התקבל')}`, cancelUrl: `${base}/me` });
}
