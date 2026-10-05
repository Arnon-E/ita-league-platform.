import { db } from '@/db';
import { handle } from '@/lib/api';
import { uploadDocument } from '@/services/documents';

/** multipart/form-data: player, type, file, expires? */
export const POST = (req: Request) => handle(req, async (actor) => {
  const fd = await req.formData();
  const f = fd.get('file');
  if (!(f instanceof File)) throw new Error('file required');
  const exp = String(fd.get('expires') ?? '');
  const d = await uploadDocument(db, actor, String(fd.get('player')), String(fd.get('type')) as 'ID_PHOTO', new Uint8Array(await f.arrayBuffer()), f.type, exp ? new Date(exp) : undefined);
  return { id: d.id, status: d.status };
});
