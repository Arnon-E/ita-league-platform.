// Imports the saved .loglig-dump files (rankings, competitions) straight into the database in DATABASE_URL (no web server needed).
//   DATABASE_URL=postgresql://... npx tsx scripts/loglig-sync/import-local.ts
import { existsSync, readFileSync } from 'node:fs';
import { db, sql } from '../../src/db';
import { importCompetition, validateCompetitionImport } from '../../src/services/loglig-competitions';
import { importRankings, validateRankingImport } from '../../src/services/loglig-rankings';

async function main() {
  for (const g of ['MALE', 'FEMALE']) {
    const f = `.loglig-dump/rankings-${g}.json`;
    if (!existsSync(f)) continue;
    const raw = JSON.parse(readFileSync(f, 'utf8'));
    console.log('rankings', g, JSON.stringify(await importRankings(db, validateRankingImport({ gender: g, rows: Array.isArray(raw) ? raw : raw.rows }))));
  }
  const docs = JSON.parse(readFileSync('.loglig-dump/competitions.json', 'utf8'));
  for (const d of docs) {
    const t = Date.now();
    console.log(JSON.stringify(await importCompetition(db, validateCompetitionImport(d))), `${Date.now() - t}ms`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
