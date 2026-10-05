import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';

const { notifications, notificationPrefs, players, guardians } = schema;
type Channel = 'PUSH' | 'EMAIL' | 'SMS';
export const DEFAULT_CHANNELS: Channel[] = ['PUSH', 'EMAIL'];

async function channelsFor(db: Db, userId: string, kind: string): Promise<Channel[]> {
  const prefs = await db.select().from(notificationPrefs).where(eq(notificationPrefs.userId, userId));
  return DEFAULT_CHANNELS.concat(prefs.filter((p) => p.enabled && !DEFAULT_CHANNELS.includes(p.channel)).map((p) => p.channel))
    .filter((c) => !prefs.some((p) => p.channel === c && !p.enabled && (p.kind === kind || p.kind === '*')));
}

/** Queues one notification per enabled channel. Delivery is done by dispatchQueued so a slow provider never blocks a request. */
export async function notifyUser(db: Db, userId: string, kind: string, title: string, body: string) {
  const chans = await channelsFor(db, userId, kind);
  if (!chans.length) return 0;
  await db.insert(notifications).values(chans.map((channel) => ({ userId, channel, kind, title, body })));
  return chans.length;
}

/** Notifies the player's account and, for minors, their guardians. */
export async function notifyPlayer(db: Db, playerId: string, kind: string, title: string, body: string) {
  const [p] = await db.select().from(players).where(eq(players.id, playerId));
  if (!p) return;
  const ids = new Set<string>();
  if (p.accountId) ids.add(p.accountId);
  for (const g of await db.select().from(guardians).where(eq(guardians.playerId, playerId))) ids.add(g.userId);
  for (const u of ids) await notifyUser(db, u, kind, title, body);
}

export type Sender = (n: typeof notifications.$inferSelect) => Promise<void>;

/** Sends queued notifications; failures are retried up to maxAttempts, then marked FAILED. */
export async function dispatchQueued(db: Db, senders: Partial<Record<Channel, Sender>>, maxAttempts = 3, limit = 100) {
  const rows = await db.select().from(notifications).where(and(eq(notifications.status, 'QUEUED'), lt(notifications.attempts, maxAttempts))).limit(limit);
  let sent = 0, failed = 0;
  for (const n of rows) {
    const send = senders[n.channel];
    try {
      if (!send) throw new Error(`no sender for ${n.channel}`);
      await send(n);
      await db.update(notifications).set({ status: 'SENT', attempts: n.attempts + 1 }).where(eq(notifications.id, n.id));
      sent++;
    } catch {
      const attempts = n.attempts + 1;
      await db.update(notifications).set({ attempts, status: attempts >= maxAttempts ? 'FAILED' : 'QUEUED' }).where(eq(notifications.id, n.id));
      failed++;
    }
  }
  return { sent, failed };
}

export async function setPref(db: Db, userId: string, channel: Channel, kind: string, enabled: boolean) {
  await db.insert(notificationPrefs).values({ userId, channel, kind, enabled }).onConflictDoUpdate({
    target: [notificationPrefs.userId, notificationPrefs.channel, notificationPrefs.kind], set: { enabled },
  });
}

export async function inbox(db: Db, userId: string) {
  return db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.channel, 'PUSH'))).orderBy(notifications.createdAt);
}

export { inArray };
