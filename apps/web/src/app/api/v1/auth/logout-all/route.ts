import { db } from '@/db';
import { handle } from '@/lib/api';
import { revokeSessions } from '@/lib/auth';

/** Ends every session of the signed-in user on every device, including this one. */
export const POST = (req: Request) => handle(req, async (actor) => { await revokeSessions(db, actor.id); return { ok: true }; });
