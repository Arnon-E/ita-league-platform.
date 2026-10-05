import { db, schema } from '@/db';
import { handle } from '@/lib/api';

/** Registers a push token for the signed-in user. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json()) as { token?: string; platform?: string };
  if (!b.token || !['ios', 'android', 'web'].includes(b.platform ?? '')) throw new Error('token and platform required');
  await db.insert(schema.deviceTokens).values({ userId: actor.id, token: b.token, platform: b.platform as string })
    .onConflictDoUpdate({ target: schema.deviceTokens.token, set: { userId: actor.id, platform: b.platform as string } });
  return { ok: true };
});
