'use server';
import { db } from '@/db';
import { guarded, requireActor } from '@/lib/session';
import { addPhoto, removePhoto } from '@/services/gallery';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export async function addPhotoAction(fd: FormData) {
  const a = await requireActor();
  const tid = s(fd, 'id');
  await guarded(`/tournaments/${tid}?tab=gallery`, async () => {
    const files = fd.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new Error('בחרו תמונה להעלאה');
    for (const f of files.slice(0, 10)) await addPhoto(db, a, tid, new Uint8Array(await f.arrayBuffer()), s(fd, 'caption'));
    return files.length === 1 ? 'התמונה נוספה' : `${Math.min(files.length, 10)} תמונות נוספו`;
  });
}

export async function removePhotoAction(fd: FormData) {
  const a = await requireActor();
  const tid = s(fd, 'id');
  await guarded(`/tournaments/${tid}?tab=gallery`, async () => {
    await removePhoto(db, a, s(fd, 'photo'));
    return 'התמונה הוסרה';
  });
}
