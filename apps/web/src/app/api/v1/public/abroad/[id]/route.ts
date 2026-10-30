import { db } from '@/db';
import { handlePublic } from '@/lib/api';
import { abroadEvent } from '@/services/abroad';

/** One tournament abroad with the matches and results of its Israeli players (the website's tournament page as data). */
export const GET = (_req: Request, { params }: { params: Promise<{ id: string }> }) => handlePublic(async () => {
  const e = await abroadEvent(db, (await params).id);
  if (!e) throw new Error('not found');
  return {
    id: e.id, name: e.name, venue: e.venue, city: e.city, country: e.country, start: e.startDate, end: e.endDate, category: e.category, age: e.ageGroup, url: e.url,
    updated: e.results?.updated ?? null, matches: e.results?.matches ?? [],
  };
});
