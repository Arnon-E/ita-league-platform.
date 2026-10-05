import type { Db } from '@/db';
import { schema } from '@/db';
import type { Actor } from '@/lib/auth';

export async function audit(db: Db, actor: Actor | null, action: string, entity: string, entityId?: string, detail?: unknown) {
  await db.insert(schema.auditLog).values({
    userId: actor?.id ?? null, action, entity, entityId: entityId ?? null,
    detail: (detail ?? null) as never, impersonatedBy: actor?.impersonatedBy ?? null,
  });
}
