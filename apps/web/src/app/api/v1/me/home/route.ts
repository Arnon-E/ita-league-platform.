import { db } from '@/db';
import { handle } from '@/lib/api';
import { myHome } from '@/services/home';

/** The personal home for the signed-in player and/or parent: standing, next match, results, next competition and what needs doing. */
export const GET = (req: Request) => handle(req, (actor) => myHome(db, actor));
