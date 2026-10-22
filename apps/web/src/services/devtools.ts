import { sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { ensureDefaultRuleSet } from './rules';

/**
 * Tools for the development environment only: fill the (empty) development database with synthetic data at the live site's scale, and read
 * what each page costs the database. They refuse to run anywhere else, so they can never touch production data.
 */
export const devAllowed = () => !!process.env.VITEST || process.env.VERCEL_ENV === 'preview' || (process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV);

function guard() {
  if (!devAllowed()) throw new Error('available only on the development environment');
}

const FIRST = ['דניאל', 'נועה', 'איתי', 'מאיה', 'יובל', 'תמר', 'עומר', 'שירה', 'אורי', 'ליאור', 'רומי', 'גיא', 'ענבר', 'נדב', 'מיקה', 'אביב'];
const LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'דהן', 'אזולאי', 'חדד', 'שמעוני', 'גולן', 'רוזן', 'אורן', 'ברק', 'טל', 'שפירא'];
const arr = (xs: string[]) => sql.raw(`array[${xs.map((x) => `'${x}'`).join(',')}]`);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(n)));

export async function devSeedReset(db: Db) {
  guard();
  await db.execute(sql`delete from points_awards where loglig_key like 'seed:%'`);
  await db.execute(sql`delete from tournaments where name like 'DEV %'`); // categories, entries and matches go with them
  await db.execute(sql`delete from players where loglig_id like 'seed:%'`);
  await db.execute(sql`delete from clubs where name like 'DEV %'`);
}

/** Players, clubs, tournaments, categories, entries, matches and ranking points, shaped like the live data (default 5,600 players, 300 tournaments). */
export async function devSeed(db: Db, o: { players?: number; tournaments?: number; reset?: boolean } = {}) {
  guard();
  if (o.reset) await devSeedReset(db);
  const have = (await db.execute(sql`select count(*)::int as n from clubs where name like 'DEV %'`)) as unknown as { n: number }[];
  if ((have[0]?.n ?? 0) > 0) return { seeded: false, reason: 'already seeded (pass reset to start over)' };
  const P = clamp(o.players ?? 5600, 10, 20000), T = clamp(o.tournaments ?? 300, 3, 1000), C = clamp(P / 30, 3, 300);
  const rs = await ensureDefaultRuleSet(db);
  const per = Math.max(1, Math.floor(P / 2 / 24)); // every category takes about 24 players of its gender

  await db.execute(sql`
    insert into clubs (id, name, city, info)
    select gen_random_uuid()::text, 'DEV מועדון ' || g, (array['תל אביב','חיפה','ירושלים','באר שבע','רעננה','נתניה'])[1 + g % 6],
      jsonb_build_object('area', 'מרכז', 'phone', '03-0000000', 'description', repeat('מועדון טניס סינתטי לבדיקות. ', 8),
        'roster', (select jsonb_agg(jsonb_build_object('name', 'שחקן ' || g || '-' || k, 'year', 2005 + k % 12)) from generate_series(1, 40) k))
    from generate_series(1, ${C}) g`);
  await db.execute(sql`
    insert into players (id, first_name, last_name, birth_date, gender, club_id, loglig_id)
    select gen_random_uuid()::text, (${arr(FIRST)})[1 + abs(hashtext('f' || g)) % ${FIRST.length}], (${arr(LAST)})[1 + abs(hashtext('l' || g)) % ${LAST.length}],
      make_date(2005 + abs(hashtext('b' || g)) % 12, 1 + abs(hashtext('m' || g)) % 12, 1 + abs(hashtext('d' || g)) % 28)::timestamptz,
      (case when g % 2 = 0 then 'MALE' else 'FEMALE' end)::gender,
      (select id from clubs where name = 'DEV מועדון ' || (1 + abs(hashtext('c' || g)) % ${C})), 'seed:' || g
    from generate_series(1, ${P}) g`);
  await db.execute(sql`
    insert into tournaments (id, name, start_date, end_date, status, format, rule_set_id, level, section, fee_agorot, registration_closes)
    select gen_random_uuid()::text, 'DEV תחרות ' || g, d, d + interval '2 days',
      (case when d < now() - interval '3 days' then 'FINISHED' when d < now() then 'IN_PROGRESS' when g % 5 = 0 then 'REGISTRATION_OPEN' else 'REGISTRATION_CLOSED' end)::tournament_status,
      'KNOCKOUT'::tournament_format, ${rs.id}, (array['NATIONAL','REGIONAL','CIRCUIT'])[1 + g % 3], (array['YOUTH','YOUTH','ADULTS'])[1 + g % 3], 0, d - interval '5 days'
    from (select g, now() - interval '400 days' + (g::double precision / ${T}) * interval '800 days' as d from generate_series(1, ${T}) g) x`);
  await db.execute(sql`
    insert into categories (id, tournament_id, name, gender)
    select gen_random_uuid()::text, t.id, c.name, c.gender::gender from tournaments t
    cross join (values ('U12 בנים','MALE'),('U12 בנות','FEMALE'),('U14 בנים','MALE'),('U14 בנות','FEMALE'),('U16 בנים','MALE'),('U16 בנות','FEMALE')) c(name, gender)
    where t.name like 'DEV %'`);
  await db.execute(sql`
    with pn as (select id, gender, row_number() over (partition by gender order by id) rn from players where loglig_id like 'seed:%'),
         cn as (select c.id, c.gender, row_number() over (order by c.id) k from categories c join tournaments t on t.id = c.tournament_id where t.name like 'DEV %')
    insert into entries (id, category_id, player_id, status, payment_status)
    select gen_random_uuid()::text, cn.id, pn.id, 'CONFIRMED', 'PAID' from cn join pn on pn.gender = cn.gender and (pn.rn + cn.k) % ${per} = 0`);
  await db.execute(sql`
    with e as (select en.id, en.category_id, row_number() over (partition by en.category_id order by en.id) rn from entries en
                 join categories c on c.id = en.category_id join tournaments t on t.id = c.tournament_id where t.name like 'DEV %'),
         pairs as (select a.category_id, a.id a_id, b.id b_id, (a.rn + 1) / 2 idx from e a join e b on b.category_id = a.category_id and b.rn = a.rn + 1 where a.rn % 2 = 1)
    insert into matches (id, category_id, stage, round, index, a_entry_id, b_entry_id, status, sets, winner_entry_id, scheduled_start, schedule_kind)
    select gen_random_uuid()::text, p.category_id, 'KO', 1, p.idx, p.a_id, p.b_id,
      (case when t.status = 'FINISHED' then 'COMPLETED' else 'SCHEDULED' end)::match_status,
      case when t.status = 'FINISHED' then '[{"a":6,"b":3},{"a":6,"b":4}]'::jsonb else '[]'::jsonb end,
      case when t.status = 'FINISHED' then p.a_id end, t.start_date + (p.idx * interval '40 minutes'), 'EXACT'::schedule_kind
    from pairs p join categories c on c.id = p.category_id join tournaments t on t.id = c.tournament_id`);
  await db.execute(sql`
    update matches set live = true where id in (select m.id from matches m join categories c on c.id = m.category_id join tournaments t on t.id = c.tournament_id
      where t.name like 'DEV %' and t.status = 'IN_PROGRESS' and m.status = 'SCHEDULED' limit 6)`);
  await db.execute(sql`
    insert into points_awards (id, player_id, tournament_id, points, multiplier, kind, date, loglig_key)
    select gen_random_uuid()::text, p.id, t.id, 50 + abs(hashtext(p.id || t.id)) % 950, 1, 'singles', t.start_date, 'seed:' || p.id || ':' || t.id
    from entries en join players p on p.id = en.player_id join categories c on c.id = en.category_id
      join tournaments t on t.id = c.tournament_id and t.name like 'DEV %' and t.status = 'FINISHED' and t.start_date > now() - interval '360 days'
    on conflict do nothing`);
  const n = (await db.execute(sql`select (select count(*) from players where loglig_id like 'seed:%')::int as players, (select count(*) from clubs where name like 'DEV %')::int as clubs,
    (select count(*) from tournaments where name like 'DEV %')::int as tournaments, (select count(*) from entries e join categories c on c.id = e.category_id join tournaments t on t.id = c.tournament_id where t.name like 'DEV %')::int as entries,
    (select count(*) from points_awards where loglig_key like 'seed:%')::int as awards`)) as unknown as Record<string, number>[];
  return { seeded: true, ...n[0] };
}

/** What the database was asked since the last reset: calls and rows returned (the rows are what the host bills as data transfer). */
export async function devStats(db: Db, action: 'reset' | 'snapshot') {
  guard();
  await db.execute(sql`create extension if not exists pg_stat_statements`);
  if (action === 'reset') { await db.execute(sql`select pg_stat_statements_reset()`); return { ok: true }; }
  const mine = sql`dbid = (select oid from pg_database where datname = current_database()) and query not ilike '%pg_stat_statements%' and query not ilike '%create extension%'`;
  const total = (await db.execute(sql`select coalesce(sum(calls), 0)::int as calls, coalesce(sum(rows), 0)::int as rows from pg_stat_statements where ${mine}`)) as unknown as { calls: number; rows: number }[];
  const top = (await db.execute(sql`select calls::int, rows::int, round(rows::numeric / nullif(calls, 0), 1)::float as rows_per_call, left(regexp_replace(query, '\\s+', ' ', 'g'), 130) as q
    from pg_stat_statements where ${mine} order by rows desc limit 8`)) as unknown as { calls: number; rows: number; rows_per_call: number; q: string }[];
  return { calls: total[0]?.calls ?? 0, rows: total[0]?.rows ?? 0, top };
}
