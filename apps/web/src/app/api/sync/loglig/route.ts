import { timingSafeEqual } from 'node:crypto';
import { mergeClubs } from '@/services/clubs';
import { db } from '@/db';
import { addResultOverride, dedupeMirror, importCompetition, removePairPlayers, removeTournament, validateCompetitionImport } from '@/services/loglig-competitions';
import { importClubs, importSiteInfo, validateClubsImport, validateSiteInfoImport } from '@/services/loglig-app';
import { importRegulations, validateRegulationsImport } from '@/services/regulations';
import { importLeague, validateLeagueImport } from '@/services/loglig-leagues';
import { createTestUser, removeTestUsers } from '@/services/test-users';
import { importRankings, validateRankingImport } from '@/services/loglig-rankings';
import { importRosterPhotos, importRosters, validateRosterImport } from '@/services/loglig-rosters';
import { importPhotos, photosNeeded, validatePhotos } from '@/services/loglig-photos';

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
    if (body?.kind === 'test-user-create') return Response.json(await createTestUser(db, body.role === 'FEDERATION_ADMIN' ? 'FEDERATION_ADMIN' : 'PLAYER'));
    if (body?.kind === 'test-user-delete') return Response.json(await removeTestUsers(db));
    if (body?.kind === 'cleanup-pairs') return Response.json(await removePairPlayers(db));
    if (body?.kind === 'merge-clubs') return Response.json(await mergeClubs(db, { dryRun: body.apply !== true }));
    if (body?.kind === 'dedupe') return Response.json(await dedupeMirror(db));
    if (body?.kind === 'override') return Response.json(await addResultOverride(db, body));
    if (body?.kind === 'remove-tournament' && typeof body.name === 'string' && body.name.trim()) return Response.json(await removeTournament(db, body.name.trim()));
    if (body?.kind === 'competition') return Response.json(await importCompetition(db, validateCompetitionImport(body)));
    if (body?.kind === 'clubs') return Response.json(await importClubs(db, validateClubsImport(body)));
    if (body?.kind === 'site-info') return Response.json(await importSiteInfo(db, validateSiteInfoImport(body)));
    if (body?.kind === 'regulations') return Response.json(await importRegulations(db, validateRegulationsImport(body)));
    if (body?.kind === 'photos-needed') return Response.json(await photosNeeded(db, Number(body.limit)));
    if (body?.kind === 'photos') return Response.json(await importPhotos(db, validatePhotos(body)));
    if (body?.kind === 'roster-photos') return Response.json(await importRosterPhotos(db, validateRosterImport({ ...body, kind: 'rosters' })));
    if (body?.kind === 'rosters') return Response.json(await importRosters(db, validateRosterImport(body)));
    if (body?.kind === 'league') return Response.json(await importLeague(db, validateLeagueImport(body)));
    return Response.json(await importRankings(db, validateRankingImport(body)));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
