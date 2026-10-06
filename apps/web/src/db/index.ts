import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/ita';
const g = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };
// Serverless hosts start many short-lived instances, so each keeps one connection (use the provider's pooled URL).
const max = Number(process.env.DB_POOL_MAX) || (process.env.VERCEL ? 1 : 10);
export const sql = g.__sql ?? postgres(url, { max, prepare: !process.env.VERCEL });
if (process.env.NODE_ENV !== 'production') g.__sql = sql;
export const db = drizzle(sql, { schema });
export type Db = typeof db;
export { schema };
