// Runs before `next build` on the host. First deploy:  if the database has no tables yet, create them from the schema,
// and (optionally) create the first super admin from ADMIN_EMAIL / ADMIN_PASSWORD. It never touches a database that already
// has tables, so redeploys cannot overwrite or alter real data.
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

// Same rule as src/db/index.ts: a Vercel Preview build only ever touches the development database.
const preview = process.env.VERCEL_ENV === 'preview';
const url = preview ? process.env.DEV_DATABASE_URL_UNPOOLED || process.env.DEV_DATABASE_URL : process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url || /localhost|127\.0\.0\.1/.test(url)) {
  console.log('[db-init] no remote DATABASE_URL, skipping');
  process.exit(0);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const [{ exists }] = await sql`select to_regclass('public.users') is not null as exists`;
  if (exists) {
    console.log('[db-init] tables already exist, leaving the database untouched');
  } else {
    console.log('[db-init] empty database: creating tables');
    const r = spawnSync('npx', ['drizzle-kit', 'push', '--force'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url }, shell: true });
    if (r.status !== 0) throw new Error('drizzle-kit push failed');
  }

  // additive column changes for databases created before the column existed (never drops or rewrites anything)
  // a competition known only from the federation's Gantt (name and dates): shown as "planned" until its own page or draws exist
  await sql`alter type tournament_status add value if not exists 'PLANNED'`;
  await sql`alter table tournaments add column if not exists source_url text`;
  await sql`alter table tournaments add column if not exists register_url text`;
  await sql`alter table tournaments add column if not exists contacts jsonb`;
  await sql`alter table tournaments add column if not exists section text not null default 'YOUTH'`;
  await sql`alter table clubs add column if not exists info jsonb`;
  await sql`alter table doubles_matches add column if not exists group_name text`;
  await sql`alter table users add column if not exists sessions_valid_after timestamptz`;
  await sql`alter table players add column if not exists loglig_user_id text unique`;
  await sql`alter table players add column if not exists photo text`;
  await sql`alter table entries add column if not exists source text`;
  await sql`create table if not exists site_info (key text primary key, data jsonb not null, updated_at timestamptz not null default now())`;
  await sql`create table if not exists regulations (
    id text primary key, title text not null, url text not null, category text not null default 'אחר', sort integer not null default 100, updated_at timestamptz not null default now())`;
  await sql`create table if not exists external_leagues (
    id text primary key, name text not null, gender gender not null default 'OPEN', data jsonb not null, updated_at timestamptz not null default now())`;

  await sql`create table if not exists abroad_events (
    id text primary key, name text not null, venue text not null default '', city text not null default '', country text not null default '',
    start_date timestamptz not null, end_date timestamptz not null, surface text not null default '', category text not null default '', age_group integer,
    closed boolean not null default false, entry_opens timestamptz, entry_deadline timestamptz, withdrawal_deadline timestamptz,
    fee text not null default '', hospitality text not null default '', indoor boolean, url text not null, updated_at timestamptz not null default now())`;
  await sql`alter table abroad_events add column if not exists circuit text not null default 'TE'`;
  await sql`create index if not exists abroad_events_start_idx on abroad_events (start_date)`;
  await sql`alter table tournaments add column if not exists acceptance jsonb`;
  await sql`create table if not exists claim_requests (
    id text primary key, user_id text not null references users(id) on delete cascade, player_id text references players(id) on delete set null,
    first_name text not null, last_name text not null, birth_date timestamptz not null, id_hash text, for_child boolean not null default false,
    reason text, status text not null default 'PENDING', reviewed_by_id text, review_note text, reviewed_at timestamptz, created_at timestamptz not null default now())`;
  await sql`create index if not exists claim_requests_status_idx on claim_requests (status)`;
  await sql`create table if not exists doubles_matches (
    id text primary key, tournament_id text not null references tournaments(id) on delete cascade, category text not null, stage text not null,
    round integer not null, a1 text references players(id) on delete set null, a2 text references players(id) on delete set null,
    b1 text references players(id) on delete set null, b2 text references players(id) on delete set null, a_name text not null, b_name text not null,
    status text not null, sets jsonb not null default '[]', winner text, schedule_kind text, scheduled_start timestamptz, court text)`;
  await sql`create table if not exists doubles_brackets (
    tournament_id text not null references tournaments(id) on delete cascade, category text not null, tree jsonb not null, primary key (tournament_id, category))`;
  for (const c of ['tournament_id', 'a1', 'a2', 'b1', 'b2']) await sql.unsafe(`create index if not exists doubles_${c === 'tournament_id' ? 'tournament' : c}_idx on doubles_matches (${c})`);
  // the live feed's "latest results" sorts finished matches by this expression; without an index it sorts the whole table per visit
  await sql`create index if not exists matches_result_time_idx on matches ((coalesce(scheduled_start, not_before, updated_at))) where status <> 'SCHEDULED'`;
  await sql`create table if not exists entry_suggestions (
    id text primary key, player_id text not null references players(id) on delete cascade, category_id text not null references categories(id) on delete cascade,
    status text not null default 'PENDING', created_at timestamptz not null default now())`;
  await sql`create unique index if not exists entry_suggestion_uq on entry_suggestions (player_id, category_id)`;
  await sql`create table if not exists ranking_snapshot (
    gender gender not null, player_id text not null references players(id) on delete cascade, rank integer not null,
    points_cents integer not null, best_cents integer not null, counted integer not null, primary key (gender, player_id))`;
  await sql`create index if not exists ranking_snapshot_rank_idx on ranking_snapshot (gender, rank)`;
  await sql`create index if not exists ranking_snapshot_player_idx on ranking_snapshot (player_id)`;
  await sql`create table if not exists ranking_snapshot_meta (id integer primary key, computed_at timestamptz not null)`;
  await sql`create table if not exists result_overrides (
    id text primary key, tournament text not null, player_a text not null, player_b text not null, winner text not null, note text,
    created_at timestamptz not null default now())`;

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error('ADMIN_PASSWORD needs 10+ characters with letters and digits');
    const hash = await bcrypt.hash(password, 10);
    const res = await sql`
      insert into users (id, email, name, password_hash, role, active)
      values (gen_random_uuid()::text, ${email}, 'מנהל על', ${hash}, 'SUPER_ADMIN', true)
      on conflict (email) do nothing returning id`;
    console.log(res.length ? '[db-init] first super admin created' : '[db-init] admin account already exists, left unchanged');
  }
} catch (e) {
  // A database that cannot be reached right now (over its plan's quota, suspended, a network blip) must not block shipping code that needs no schema change.
  // Anything else (a failing migration, bad credentials) still fails the build.
  const msg = String(e?.message ?? e);
  if (/quota|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|CONNECT_TIMEOUT|terminating connection|too many connections/i.test(msg)) {
    console.warn('[db-init] database not reachable, skipping schema checks for this build:', msg.slice(0, 200));
  } else throw e;
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}
