import { db } from '@/db';
import { handle } from '@/lib/api';
import { assertCan } from '@/lib/permissions';
import { audit } from '@/services/audit';
import { hydrate, latestRuleSet, parseRuleData, publishRuleSetVersion, serialize } from '@/services/rules';

export const GET = (req: Request) => handle(req, async (actor) => {
  assertCan(actor, 'ruleset.manage');
  const cur = await latestRuleSet(db);
  const rs = hydrate(cur.key, cur.version, cur.data as ReturnType<typeof serialize>);
  return { name: cur.name, version: cur.version, verified: !!rs.verified, json: JSON.stringify(serialize(rs), null, 2) };
});

/** Body: { name?, json }. Publishes the next version; running tournaments keep theirs. */
export const POST = (req: Request) => handle(req, async (actor) => {
  assertCan(actor, 'ruleset.manage');
  const b = (await req.json().catch(() => ({}))) as { name?: string; json?: string };
  const data = parseRuleData(String(b.json ?? ''));
  const cur = await latestRuleSet(db);
  const row = await publishRuleSetVersion(db, cur.key, String(b.name ?? '').trim() || cur.name, hydrate(cur.key, cur.version + 1, data));
  await audit(db, actor, 'ruleset.publish', 'ruleset', row.id, { version: row.version, verified: data.verified });
  return { version: row.version };
});
