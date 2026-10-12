import { timingSafeEqual } from 'node:crypto';
import { db } from '@/db';
import { importCompetition, removePairPlayers, removeTournament, validateCompetitionImport } from '@/services/loglig-competitions';
import { importClubs, importSiteInfo, validateClubsImport, validateSiteInfoImport } from '@/services/loglig-app';
import { importRegulations, validateRegulationsImport } from '@/services/regulations';
import { importLeague, validateLeagueImport } from '@/services/loglig-leagues';
import { importRankings, validateRankingImport } from '@/services/loglig-rankings';

export const maxDuration = 60;

const authorized = (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('authorization') ?? '';
  if (!secret) return false;
  const a = Buffer.from(got), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Local sync scripts push public Loglig data here. Body: { gender, rows } (rankings) or { kind: 'competition', ... }. Bearer CRON_SECRET. */
export async function POST(req: Request) {
  if (!authorized(req)) return new Response('Unauthorized', { status: 401 });
  try {
    const body = await req.json();
    if (body?.kind === 'cleanup-pairs') return Response.json(await removePairPlayers(db));
    if (body?.kind === 'remove-tournament' && typeof body.name === 'string' && body.name.trim()) return Response.json(await removeTournament(db, body.name.trim()));
    if (body?.kind === 'competition') return Response.json(await importCompetition(db, validateCompetitionImport(body)));
    if (body?.kind === 'clubs') return Response.json(await importClubs(db, validateClubsImport(body)));
    if (body?.kind === 'site-info') return Response.json(await importSiteInfo(db, validateSiteInfoImport(body)));
    if (body?.kind === 'regulations') return Response.json(await importRegulations(db, validateRegulationsImport(body)));
    if (body?.kind === 'league') return Response.json(await importLeague(db, validateLeagueImport(body)));
    return Response.json(await importRankings(db, validateRankingImport(body)));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
