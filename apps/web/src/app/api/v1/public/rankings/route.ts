import { inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { handlePublic } from '@/lib/api';
import { rankingFor } from '@/services/rankings';
import { ensureDefaultRuleSet, loadRuleSet } from '@/services/rules';

export const GET = (req: Request) => handlePublic(async () => {
  const g = new URL(req.url).searchParams.get('g');
  const gender = (g === 'FEMALE' ? 'FEMALE' : 'MALE') as 'MALE' | 'FEMALE';
  const rs = await ensureDefaultRuleSet(db);
  const rows = await rankingFor(db, gender, new Date(), await loadRuleSet(db, rs.id));
  const ps = rows.length ? await db.select().from(schema.players).where(inArray(schema.players.id, rows.map((r) => r.playerId))) : [];
  const nm = new Map(ps.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  return rows.map((r) => ({ playerId: r.playerId, rank: r.rank, points: r.points, name: nm.get(r.playerId) ?? '?' }));
});
