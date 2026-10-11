import { asc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handlePublic } from '@/lib/api';

export const GET = () => handlePublic(async () =>
  (await db.select().from(schema.regulations).orderBy(asc(schema.regulations.sort), asc(schema.regulations.title)))
    .map((r) => ({ id: r.id, title: r.title, url: r.url, category: r.category })));
