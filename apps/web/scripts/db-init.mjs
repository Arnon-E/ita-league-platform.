// Runs before `next build` on the host. First deploy:  if the database has no tables yet, create them from the schema,
// and (optionally) create the first super admin from ADMIN_EMAIL / ADMIN_PASSWORD. It never touches a database that already
// has tables, so redeploys cannot overwrite or alter real data.
import { spawnSync } from 'node:child_process';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
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
  await sql`alter table tournaments add column if not exists source_url text`;
  await sql`alter table tournaments add column if not exists register_url text`;
  await sql`create table if not exists external_leagues (
    id text primary key, name text not null, gender gender not null default 'OPEN', data jsonb not null, updated_at timestamptz not null default now())`;

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
} finally {
  await sql.end();
}
