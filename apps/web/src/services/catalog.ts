import { sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { memo } from '@/lib/memo';

/**
 * The competition list the home page and the app show, in one small result. The database folds each tournament's categories into a few
 * "facets" (gender, age taken from the name, birth-year limits; a tournament's six categories are mostly the same six facets as the next
 * one's), so the rows leave the database once per distinct facet set instead of once per category. Nothing here is stored: it is computed
 * from the tables on each read, so it can never be out of step with them, and it is shared for a few seconds per server instance.
 */
export interface CatalogTournament {
  id: string; name: string; status: string; format: string; level: string; section: string;
  startDate: Date; endDate: Date; registrationCloses: Date | null; feeAgorot: number;
  /** Only filled for cancelled tournaments (the public hides a cancelled one nobody entered). */
  hasEntries: boolean;
  cats: { gender: 'MALE' | 'FEMALE' | 'OPEN'; age: number | null; minBirthYear: number | null; maxBirthYear: number | null }[];
}

type Facet = { g: 'MALE' | 'FEMALE' | 'OPEN'; age: number | null; min: number | null; max: number | null };
interface Raw {
  tournaments: { id: string; name: string; status: string; format: string; level: string; section: string; start: string; end: string; closes: string | null; fee: number; entered: boolean; sig: string }[];
  facets: Record<string, Facet[]>;
}

export function homeCatalog(db: Db): Promise<CatalogTournament[]> {
  return memo('home-catalog', 20_000, async () => {
    const res = (await db.execute(sql`
      with f as (
        select c.tournament_id, jsonb_agg(distinct jsonb_build_object('g', c.gender, 'age', nullif(substring(c.name from '[0-9]{2}'), '')::int, 'min', c.min_birth_year, 'max', c.max_birth_year)) as facets
        from categories c group by c.tournament_id),
      t as (
        select tn.id, tn.name, tn.status, tn.format, tn.level, tn.section, tn.start_date, tn.end_date, tn.registration_closes, tn.fee_agorot,
          (tn.status = 'CANCELLED' and exists (select 1 from entries e join categories c on c.id = e.category_id where c.tournament_id = tn.id)) as entered,
          coalesce(md5(f.facets::text), '') as sig
        from tournaments tn left join f on f.tournament_id = tn.id)
      select json_build_object(
        'tournaments', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'status', status, 'format', format, 'level', level, 'section', section,
            'start', start_date, 'end', end_date, 'closes', registration_closes, 'fee', fee_agorot, 'entered', entered, 'sig', sig) order by start_date desc), '[]'::json) from t),
        'facets', (select coalesce(json_object_agg(sig, facets), '{}'::json) from (select distinct md5(facets::text) as sig, facets from f) d)
      ) as data`)) as unknown as { data: Raw }[];
    const raw = res[0]!.data;
    return raw.tournaments.map((t) => ({
      id: t.id, name: t.name, status: t.status, format: t.format, level: t.level, section: t.section,
      startDate: new Date(t.start), endDate: new Date(t.end), registrationCloses: t.closes ? new Date(t.closes) : null, feeAgorot: t.fee, hasEntries: t.entered,
      cats: (raw.facets[t.sig] ?? []).map((x) => ({ gender: x.g, age: x.age, minBirthYear: x.min, maxBirthYear: x.max })),
    }));
  });
}
