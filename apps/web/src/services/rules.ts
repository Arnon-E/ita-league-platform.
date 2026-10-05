import { and, eq } from 'drizzle-orm';
import { ITA_DEFAULT_RULESET, type RuleSet } from '@ita/rules-engine';
import type { Db } from '@/db';
import { schema } from '@/db';

const { ruleSets } = schema;

/** The serialisable part of a rule set. Functions (seedCount) come from the default. */
export function serialize(r: RuleSet) {
  return { seedTiers: r.seedTiers, tieBreakOrder: r.tieBreakOrder, group: r.group, refund: r.refund, ranking: r.ranking };
}

export function hydrate(key: string, version: number, data: ReturnType<typeof serialize>): RuleSet {
  const tiers: RuleSet['seedTiers'] = {};
  for (const [k, v] of Object.entries(data.seedTiers)) tiers[Number(k)] = v;
  return { ...ITA_DEFAULT_RULESET, id: key, version, ...data, seedTiers: tiers };
}

export async function ensureDefaultRuleSet(db: Db) {
  const [found] = await db.select().from(ruleSets).where(and(eq(ruleSets.key, 'ita-default'), eq(ruleSets.version, 1)));
  if (found) return found;
  const [row] = await db.insert(ruleSets).values({
    key: 'ita-default', version: 1, name: 'ברירת מחדל לפי תקנוני האיגוד (לאימות)', data: serialize(ITA_DEFAULT_RULESET),
  }).returning();
  return row as NonNullable<typeof row>;
}

export async function loadRuleSet(db: Db, ruleSetId: string): Promise<RuleSet> {
  const [r] = await db.select().from(ruleSets).where(eq(ruleSets.id, ruleSetId));
  if (!r) throw new Error('Rule set not found');
  return hydrate(r.key, r.version, r.data as ReturnType<typeof serialize>);
}

/** A new version never edits an old one, so draws stay reproducible. */
export async function publishRuleSetVersion(db: Db, key: string, name: string, rules: RuleSet) {
  const rows = await db.select().from(ruleSets).where(eq(ruleSets.key, key));
  const version = rows.reduce((m, r) => Math.max(m, r.version), 0) + 1;
  const [row] = await db.insert(ruleSets).values({ key, version, name, data: serialize(rules) }).returning();
  return row as NonNullable<typeof row>;
}
