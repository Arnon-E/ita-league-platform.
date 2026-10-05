import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { login } from '@/lib/auth';

/** Mobile login: returns a bearer token (12h). */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (!b.email || !b.password) return Response.json({ error: 'missing credentials' }, { status: 400 });
  const r = await login(db, b.email, b.password);
  if (!r.ok) return Response.json({ error: r.reason }, { status: r.reason === 'locked' ? 423 : 401 });
  const [u] = await db.select({ id: schema.users.id, name: schema.users.name, role: schema.users.role }).from(schema.users).where(eq(schema.users.id, r.actor.id));
  return Response.json({ token: r.token, user: u });
}
