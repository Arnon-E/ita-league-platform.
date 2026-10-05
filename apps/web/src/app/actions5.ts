'use server';
import { db } from '@/db';
import { guarded, requireActor } from '@/lib/session';
import { broadcast, type Audience } from '@/services/broadcast';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function broadcastAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/admin/messages', async () => {
    const kind = s(fd, 'audience');
    const to: Audience = kind === 'CLUB' ? { kind, id: s(fd, 'club') } : kind === 'TOURNAMENT' ? { kind, id: s(fd, 'tournament') } : { kind: 'ALL' };
    if (to.kind !== 'ALL' && !to.id) throw new Error('בחרו יעד להודעה');
    const n = await broadcast(db, a, to, s(fd, 'title'), s(fd, 'body'));
    return `ההודעה נשלחה ל-${n} נמענים`;
  });
}
