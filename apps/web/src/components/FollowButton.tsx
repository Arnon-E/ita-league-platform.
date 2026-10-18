import { db } from '@/db';
import { getActor } from '@/lib/session';
import { followAction } from '@/app/actions6';
import { isFollowing, type FollowKind } from '@/services/follows';
import { tr } from '@/lib/i18n';

/** "Follow" toggle for fans. Anonymous visitors are sent to login. */
export async function FollowButton({ kind, target, back }: { kind: FollowKind; target: string; back: string }) {
  const t = await tr();
  const a = await getActor();
  const on = a ? await isFollowing(db, a.id, kind, target) : false;
  return (
    <form action={followAction}>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="target" value={target} /><input type="hidden" name="back" value={back} />
      <button className={`btn small ${on ? '' : 'ghost'}`}>{t(on ? '★ במעקב' : '☆ מעקב')}</button>
    </form>
  );
}
