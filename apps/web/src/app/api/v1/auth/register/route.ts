import { db } from '@/db';
import { login } from '@/lib/auth';
import { signUp } from '@/services/accounts';

/** Mobile sign-up: creates a PLAYER account and signs it in. Body: { name, email, phone?, password } */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { name?: string; email?: string; phone?: string; password?: string };
  try {
    const u = await signUp(db, { name: String(b.name ?? ''), email: String(b.email ?? ''), password: String(b.password ?? ''), phone: b.phone ? String(b.phone) : undefined });
    const r = await login(db, u.email, String(b.password));
    if (!r.ok) return Response.json({ error: r.reason }, { status: 401 });
    return Response.json({ token: r.token, user: { id: u.id, name: u.name, role: u.role } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
