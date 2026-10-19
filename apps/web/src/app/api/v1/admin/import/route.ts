import { db } from '@/db';
import { handle } from '@/lib/api';
import { importFromLogligDb } from '@/services/loglig-db';
import { importPlayersCsv, importPointsCsv } from '@/services/imports';

type Rep = { created: number; updated: number; errors: { row: number; reason: string }[] };
const brief = (r?: Rep) => (r ? { created: r.created, updated: r.updated, errors: r.errors.length, firstErrors: r.errors.slice(0, 5).map((e) => `שורה ${e.row}: ${e.reason}`) } : null);

/** Body: { kind: 'players' | 'points', csv, dry? } or { kind: 'db', url, playersSql?, pointsSql?, dry? }. Dry run unless dry is false. The services check import.run. */
export const POST = (req: Request) => handle(req, async (actor) => {
  const b = (await req.json().catch(() => ({}))) as { kind?: string; csv?: string; url?: string; playersSql?: string; pointsSql?: string; dry?: boolean };
  const dryRun = b.dry !== false;
  if (b.kind === 'db') {
    const r = await importFromLogligDb(db, actor, { url: String(b.url ?? ''), playersSql: b.playersSql, pointsSql: b.pointsSql, dryRun });
    return { dry: dryRun, players: brief(r.players), points: brief(r.points) };
  }
  const csv = String(b.csv ?? '');
  const rep = b.kind === 'points' ? await importPointsCsv(db, actor, csv, { dryRun }) : await importPlayersCsv(db, actor, csv, { dryRun });
  return { dry: dryRun, result: brief(rep) };
});
