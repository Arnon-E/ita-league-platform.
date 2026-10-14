'use server';
import { db } from '@/db';
import { guarded, requireActor } from '@/lib/session';
import { ClaimPending, claimPlayer, findUserByEmail, linkPlayer, resolveClaim, unlinkPlayer } from '@/services/claims';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Result of a claim attempt as a flash message: linked at once, or queued for an admin. */
export async function claimPlayerAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/me', async () => {
    try {
      await claimPlayer(db, a, { firstName: s(fd, 'first'), lastName: s(fd, 'last'), birthDate: new Date(s(fd, 'birth')), nationalId: s(fd, 'nid') || undefined, forChild: fd.get('child') === '1', reason: s(fd, 'reason') });
      return 'השחקן שויך לחשבון שלך';
    } catch (e) {
      if (e instanceof ClaimPending) return 'לא נמצאה התאמה מלאה. הבקשה נשלחה לאישור האיגוד ותקבלו הודעה';
      throw e;
    }
  });
}

export async function resolveClaimAction(fd: FormData) {
  const a = await requireActor();
  await guarded('/admin/claims', async () => {
    const approve = s(fd, 'op') === 'approve';
    await resolveClaim(db, a, s(fd, 'claim'), approve ? 'APPROVED' : 'REJECTED', { playerId: s(fd, 'player') || undefined, note: s(fd, 'note') });
    return approve ? 'הבקשה אושרה והשחקן שויך' : 'הבקשה נדחתה';
  });
}

export async function linkPlayerAction(fd: FormData) {
  const a = await requireActor();
  const back = `/admin/claims?q=${encodeURIComponent(s(fd, 'q'))}`;
  await guarded(back, async () => {
    const u = await findUserByEmail(db, a, s(fd, 'email'));
    if (!u) throw new Error('לא נמצא משתמש עם האימייל הזה');
    await linkPlayer(db, a, s(fd, 'player'), u.id, s(fd, 'mode') === 'guardian');
    return `השחקן שויך ל-${u.name}`;
  });
}

export async function unlinkPlayerAction(fd: FormData) {
  const a = await requireActor();
  const back = `/admin/claims?q=${encodeURIComponent(s(fd, 'q'))}`;
  await guarded(back, async () => { await unlinkPlayer(db, a, s(fd, 'player'), s(fd, 'user') || undefined); return 'השיוך בוטל'; });
}
