import { db, schema } from '@/db';
import { handlePublic } from '@/lib/api';

/** Federation info mirrored from the Loglig app: about text, events, registration forms, sponsors. */
export const GET = () => handlePublic(async () => {
  const rows = await db.select().from(schema.siteInfo);
  const get = (k: string, d: unknown) => rows.find((r) => r.key === k)?.data ?? d;
  return { union: get('union', {}), events: get('events', []), forms: get('forms', []), sponsors: get('sponsors', []) };
});
