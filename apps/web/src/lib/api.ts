import { verifySession, type Actor } from './auth';
import { Forbidden } from './permissions';
import { getActor } from './session';

export async function apiActor(req: Request): Promise<Actor | null> {
  const h = req.headers.get('authorization');
  if (h?.startsWith('Bearer ')) return verifySession(h.slice(7));
  try { return await getActor(); } catch { return null; }
}

export async function handle(req: Request, fn: (actor: Actor) => Promise<unknown>): Promise<Response> {
  const a = await apiActor(req);
  if (!a) return Response.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return Response.json(await fn(a));
  } catch (e) {
    if (e instanceof Forbidden) return Response.json({ error: 'forbidden', action: e.action }, { status: 403 });
    return Response.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}

/** Read-only endpoints open to everyone (the public site shows the same data). */
export async function handlePublic(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
