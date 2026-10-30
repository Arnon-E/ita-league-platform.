'use server';
import { db } from '@/db';
import { guarded, requireActor } from '@/lib/session';
import { resolveAbroadLink } from '@/services/abroad-players';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Confirm a name as one of the site's players (a "player" field), or say it is nobody (no field): the automatic pass leaves it alone from then on. */
export async function resolveAbroadLinkAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/admin/abroad-players', async () => {
    const player = s(fd, 'player');
    await resolveAbroadLink(db, a, s(fd, 'key'), player || null);
    return player ? 'השיוך נשמר' : 'השם סומן כשחקן שאינו באתר';
  });
}
