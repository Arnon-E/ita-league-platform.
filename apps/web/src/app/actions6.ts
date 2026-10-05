'use server';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { getActor } from '@/lib/session';
import { toggleFollow } from '@/services/follows';

export async function followAction(fd: FormData) {
  const a = await getActor();
  const back = String(fd.get('back') ?? '/');
  // only same-site paths, never an arbitrary URL
  const to = back.startsWith('/') && !back.startsWith('//') ? back : '/';
  if (!a) redirect(`/login`);
  await toggleFollow(db, a.id, String(fd.get('kind') ?? ''), String(fd.get('target') ?? ''));
  redirect(to);
}
