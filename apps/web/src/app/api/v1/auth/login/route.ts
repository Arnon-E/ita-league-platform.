import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { login } from '@/lib/auth';

/** Mobile login: returns a bearer token (12h, or 30 days with remember: true, so the app stays signed in). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string; remember?: boolean };
  if (!b.email || !b.password) return Response.json({ error: 'missing credentials' }, { status: 400 });
  const r = await login(db, b.email, b.password, new Date(), !!b.remember);
  if (!r.ok) return Response.json({ error: r.reason }, { status: r.reason === 'locked' ? 423 : 401 });
  const [u] = await db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, r.actor.id));
  return Response.json({ token: r.token, user: u });
}
