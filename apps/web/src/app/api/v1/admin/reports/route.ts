import { handle } from '@/lib/api';
import { assertCan } from '@/lib/permissions';
import { signedUrl } from '@/lib/storage';

const KINDS = ['players', 'entries', 'results', 'points'];

/** Body: { kind }. Returns a 5-minute link that downloads the CSV in a browser (the app has no cookie session). */
export const POST = (req: Request) => handle(req, async (actor) => {
  assertCan(actor, 'audit.read');
  const kind = String(((await req.json().catch(() => ({}))) as { kind?: string }).kind ?? '');
  if (!KINDS.includes(kind)) throw new Error('דוח לא קיים');
  const q = new URL(signedUrl(`report:${kind}`, 300), 'http://x').searchParams;
  return { url: `/api/reports/${kind}?exp=${q.get('exp')}&sig=${q.get('sig')}` };
});
