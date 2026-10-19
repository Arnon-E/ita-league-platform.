import { db } from '@/db';
import { handle } from '@/lib/api';
import { recentAudit } from '@/services/users';

export const GET = (req: Request) => handle(req, async (actor) =>
  (await recentAudit(db, actor, 100)).map((r) => ({ id: r.id, at: r.createdAt, action: r.action, entity: r.entity, impersonated: !!r.impersonatedBy })));
