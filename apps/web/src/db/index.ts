import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// A Vercel Preview (the development site) uses ONLY the separate development database (DEV_DATABASE_URL), never DATABASE_URL,
// even if that variable happens to be shared with Preview. Without DEV_DATABASE_URL a preview cannot reach any database.
const preview = process.env.VERCEL_ENV === 'preview';
const url = preview
  ? process.env.DEV_DATABASE_URL ?? 'postgresql://invalid:invalid@preview-has-no-dev-database.invalid:5432/none'
  : process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/ita';
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };
// fetch_types: false skips the driver's startup read of the array types (343 rows on every new connection, i.e. on every cold start). Nothing here uses array columns or array parameters.
// Serverless hosts start many short-lived instances, so each keeps one connection (use the provider's pooled URL).
const max = Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 1 : 10);
export const sql = g.__sql ?? postgres(url, { max, prepare: !process.env.VERCEL, fetch_types: false });
if (process.env.NODE_ENV !== 'production') g.__sql = sql;
export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { schema };
