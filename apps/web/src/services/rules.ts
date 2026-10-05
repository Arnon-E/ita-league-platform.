import { and, eq } from 'drizzle-orm';
import { ITA_DEFAULT_RULESET, type RuleSet } from '@ita/rules-engine';
import type { Db } from '@/db';
import { schema } from '@/db';

const { ruleSets } = schema;

/** The serialisable part of a rule set. Functions (seedCount) come from the default. */
export function serialize(r: RuleSet) {
  return { seedTiers: r.seedTiers, tieBreakOrder: r.tieBreakOrder, group: r.group, refund: r.refund, ranking: r.ranking, points: r.points, verified: r.verified };
}

export function hydrate(key: string, version: number, data: ReturnType<typeof serialize>): RuleSet {
  const tiers: RuleSet['seedTiers'] = {};
  for (const [k, v] of Object.entries(data.seedTiers)) tiers[Number(k)] = v;
  return { ...ITA_DEFAULT_RULESET, id: key, version, ...data, seedTiers: tiers };
}

import { z } from 'zod';

const RuleDataSchema = z.object({
  seedTiers: z.record(z.string().regex(/^\d+$/), z.array(z.array(z.number().int().positive()))),
  tieBreakOrder: z.array(z.enum(['wins', 'headToHead', 'setDiff', 'gameDiff', 'draw'])).min(1),
  group: z.object({ minPlayers: z.number().int().min(2), voidIfPlayedLessThan: z.number().min(0).max(1), walkoverCountsInStats: z.boolean() }),
  refund: z.object({ beforeRegistrationClose: z.number().min(0).max(1), afterCloseBeforeDraw: z.number().min(0).max(1), afterDraw: z.number().min(0).max(1), medicalCertificateOverride: z.boolean() }),
  ranking: z.object({ windowWeeks: z.number().int().positive(), bestSingles: z.number().int().min(0), bestDoubles: z.number().int().min(0) }),
  points: z.record(z.string(), z.number().min(0)),
  verified: z.boolean(),
});

/** Validates an edited rule set. Each seed tier position must fit the draw size and appear once. */
export function parseRuleData(json: string): ReturnType<typeof serialize> {
  const data = RuleDataSchema.parse(JSON.parse(json));
  for (const [size, tiers] of Object.entries(data.seedTiers)) {
    const n = Number(size);
    const flat = tiers.flat();
    if (flat.some((p) => p > n)) throw new Error(`טבלת זריעה ${size}: מיקום גדול מגודל ההגרלה`);
    if (new Set(flat).size !== flat.length) throw new Error(`טבלת זריעה ${size}: מיקום מופיע פעמיים`);
  }
  return data as unknown as ReturnType<typeof serialize>;
}

export async function latestRuleSet(db: Db, key = 'ita-default') {
  const rows = await db.select().from(ruleSets).where(eq(ruleSets.key, key));
  if (!rows.length) return ensureDefaultRuleSet(db);
  return rows.reduce((a, b) => (b.version > a.version ? b : a));
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
