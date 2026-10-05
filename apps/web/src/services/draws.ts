import { and, eq, inArray, ne } from 'drizzle-orm';
import {
  buildBracket, groupSizes, makeDraw, makeGroups, roundRobin,
  type Entrant, type GroupConfig, type Slot,
} from '@ita/rules-engine';
import type { Db } from '@/db';
import { schema } from '@/db';
import { assertCan } from '@/lib/permissions';
import type { Actor } from '@/lib/auth';
import { audit } from './audit';
import { loadRuleSet } from './rules';
import { rankMap } from './rankings';
import { scopeFor } from './tournaments';

const { categories, tournaments, entries, players, clubs, draws, drawLogs, groups, groupMembers, matches } = schema;

export type StoredSlot = { entryId: string | null; seed?: number };
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export const DEFAULT_GROUP_CONFIG: GroupConfig = { groupSize: 4, advancers: 2 };

export function formatOf(c: { format: string | null }, t: { format: string }) {
  return (c.format ?? t.format) as 'KNOCKOUT' | 'GROUPS_KNOCKOUT' | 'ROUND_ROBIN';
}

async function loadCategory(db: Db, categoryId: string) {
  const [row] = await db.select({ c: categories, t: tournaments }).from(categories)
    .innerJoin(tournaments, eq(tournaments.id, categories.tournamentId)).where(eq(categories.id, categoryId));
  if (!row) throw new Error('Category not found');
  return row;
}

async function hasResults(db: Db | Tx, categoryId: string): Promise<boolean> {
  const rows = await db.select({ id: matches.id }).from(matches)
    .where(and(eq(matches.categoryId, categoryId), ne(matches.status, 'SCHEDULED'))).limit(1);
  return rows.length > 0;
}

function toSlots(slots: Slot[]): StoredSlot[] {
  return slots.map((s) => (s.kind === 'bye' ? { entryId: null } : { entryId: s.player.id, ...(s.seed ? { seed: s.seed } : {}) }));
}

/** Creates the knockout matches. A bye never becomes a match: the player is placed directly in round 2. */
export async function insertKnockoutMatches(tx: Db | Tx, categoryId: string, slots: StoredSlot[]) {
  const entrantSlots: Slot[] = slots.map((s) => (s.entryId ? { kind: 'player', player: { id: s.entryId, name: s.entryId }, ...(s.seed ? { seed: s.seed } : {}) } : { kind: 'bye' }));
  const bracket = buildBracket(entrantSlots);
  const ids = new Map<string, string>();
  for (const r of bracket.rounds) for (const m of r) if (!m.bye) ids.set(m.id, crypto.randomUUID());
  const rows: (typeof matches.$inferInsert)[] = [];
  for (const r of bracket.rounds) {
    for (const m of r) {
      if (m.bye) continue;
      const feeders = r[0] && m.round > 1
        ? [bracket.rounds[m.round - 2]?.[m.index * 2], bracket.rounds[m.round - 2]?.[m.index * 2 + 1]]
          .filter((f): f is NonNullable<typeof f> => !!f && !f.bye).map((f) => ids.get(f.id) as string)
        : [];
      rows.push({
        id: ids.get(m.id) as string, categoryId, stage: 'KO', round: m.round, index: m.index, nodeId: m.id,
        aEntryId: m.a?.id ?? null, bEntryId: m.b?.id ?? null, feederIds: feeders,
      });
    }
  }
  if (rows.length) await tx.insert(matches).values(rows);
  return rows.length;
}

async function wipe(tx: Tx, categoryId: string) {
  await tx.delete(matches).where(eq(matches.categoryId, categoryId));
  await tx.delete(groups).where(eq(groups.categoryId, categoryId));
  await tx.delete(draws).where(eq(draws.categoryId, categoryId));
}

export interface RunDrawOptions { code?: number; seeds?: number; separateClubs?: boolean }

/**
 * Runs the draw for one category from confirmed entries, taking the official ranking into account.
 * Reproducible: the same code + same rule set + same entrants gives the same result.
 * Re-drawing is blocked once any result exists.
 */
export async function runDraw(db: Db, actor: Actor, categoryId: string, opts: RunDrawOptions = {}) {
  const { c, t } = await loadCategory(db, categoryId);
  assertCan(actor, 'draw.run', await scopeFor(db, actor, t.id));
  if (!['REGISTRATION_CLOSED', 'DRAWN'].includes(t.status)) throw new Error('ההגרלה אפשרית רק אחרי סגירת ההרשמה');
  if (await hasResults(db, categoryId)) throw new Error('אי אפשר להגריל מחדש אחרי שהוזנו תוצאות');

  const rules = await loadRuleSet(db, t.ruleSetId);
  const rows = await db.select({ e: entries, p: players, club: clubs.name }).from(entries)
    .innerJoin(players, eq(players.id, entries.playerId)).leftJoin(clubs, eq(clubs.id, players.clubId))
    .where(and(eq(entries.categoryId, categoryId), eq(entries.status, 'CONFIRMED')));
  const format = formatOf(c, t);
  const min = format === 'KNOCKOUT' ? 2 : rules.group.minPlayers;
  if (rows.length < min) throw new Error(`נדרשים לפחות ${min} שחקנים מאושרים`);

  const ranks = await rankMap(db, c.gender, new Date(), rules);
  const entrants: Entrant[] = rows.map(({ e, p, club }) => {
    const rank = ranks.get(p.id);
    return { id: e.id, name: `${p.firstName} ${p.lastName}`, ...(club ? { club } : {}), ...(rank !== undefined ? { rank } : {}) };
  });
  const code = opts.code ?? Math.floor(Math.random() * 2 ** 31);

  await db.transaction(async (tx) => {
    await wipe(tx, categoryId);
    for (const en of entrants) await tx.update(entries).set({ rankAtDraw: en.rank ?? null }).where(eq(entries.id, en.id));

    let storedSlots: StoredSlot[];
    let size: number;
    if (format === 'KNOCKOUT') {
      const d = makeDraw(entrants, { code, ruleSet: rules, ...(opts.seeds !== undefined ? { seeds: opts.seeds } : {}), ...(opts.separateClubs !== undefined ? { separateClubs: opts.separateClubs } : {}) });
      storedSlots = toSlots(d.slots);
      size = d.size;
    } else {
      const cfg = (c.groupConfig as GroupConfig | null) ?? (format === 'ROUND_ROBIN' ? { groupSize: entrants.length, groupCount: 1, advancers: 0 } : DEFAULT_GROUP_CONFIG);
      const gs = makeGroups(entrants, cfg);
      storedSlots = [];
      for (let gi = 0; gi < gs.length; gi++) {
        const [g] = await tx.insert(groups).values({ categoryId, name: `בית ${String.fromCharCode(0x5d0 + gi)}`, position: gi }).returning();
        const members = gs[gi] as Entrant[];
        await tx.insert(groupMembers).values(members.map((m) => ({ groupId: (g as NonNullable<typeof g>).id, entryId: m.id })));
        const fx = roundRobin(members.map((m) => m.id));
        if (fx.length) {
          await tx.insert(matches).values(fx.map((f, i) => ({
            categoryId, groupId: (g as NonNullable<typeof g>).id, stage: 'GROUP', round: f.round, index: i, aEntryId: f.a, bEntryId: f.b,
          })));
        }
        members.forEach((m) => storedSlots.push({ entryId: m.id }));
      }
      size = entrants.length;
    }
    if (format === 'KNOCKOUT') await insertKnockoutMatches(tx, categoryId, storedSlots);
    const [dr] = await tx.insert(draws).values({
      categoryId, code, ruleSetKey: rules.id, ruleSetVersion: rules.version, size, slots: storedSlots,
    }).returning();
    await tx.insert(drawLogs).values({ drawId: (dr as NonNullable<typeof dr>).id, userId: actor.id, action: 'RUN', detail: { code, entrants: entrants.length, format } });
    if (t.status === 'REGISTRATION_CLOSED') await tx.update(tournaments).set({ status: 'DRAWN' }).where(eq(tournaments.id, t.id));
  });
  await audit(db, actor, 'draw.run', 'category', categoryId, { code, format });
  return { code, format, entrants: entrants.length };
}

/** Manual swap of two positions in a knockout draw, with a full audit trail. Blocked once results exist. */
export async function swapDrawSlots(db: Db, actor: Actor, categoryId: string, i: number, j: number, reason: string) {
  const { c, t } = await loadCategory(db, categoryId);
  assertCan(actor, 'draw.edit', await scopeFor(db, actor, t.id));
  if (!reason.trim()) throw new Error('חובה לציין סיבה להחלפה');
  if (formatOf(c, t) !== 'KNOCKOUT') throw new Error('החלפת משבצות נתמכת בטבלת הדחה בלבד');
  if (await hasResults(db, categoryId)) throw new Error('אי אפשר לשנות הגרלה אחרי שהוזנו תוצאות');
  const [d] = await db.select().from(draws).where(eq(draws.categoryId, categoryId));
  if (!d) throw new Error('לא בוצעה הגרלה');
  const slots = (d.slots as StoredSlot[]).slice();
  if (!slots[i] || !slots[j] || i === j) throw new Error('משבצת לא חוקית');
  const a = slots[i] as StoredSlot;
  const b = slots[j] as StoredSlot;
  slots[i] = b;
  slots[j] = a;
  await db.transaction(async (tx) => {
    await tx.delete(matches).where(eq(matches.categoryId, categoryId));
    await insertKnockoutMatches(tx, categoryId, slots);
    await tx.update(draws).set({ slots }).where(eq(draws.id, d.id));
    await tx.insert(drawLogs).values({ drawId: d.id, userId: actor.id, action: 'SWAP', detail: { i, j, a, b, reason } });
  });
  await audit(db, actor, 'draw.swap', 'category', categoryId, { i, j, reason });
}

export async function publishDraw(db: Db, actor: Actor, categoryId: string) {
  const { t } = await loadCategory(db, categoryId);
  assertCan(actor, 'draw.run', await scopeFor(db, actor, t.id));
  const [d] = await db.select().from(draws).where(eq(draws.categoryId, categoryId));
  if (!d) throw new Error('לא בוצעה הגרלה');
  await db.update(draws).set({ publishedAt: new Date() }).where(eq(draws.id, d.id));
  await db.insert(drawLogs).values({ drawId: d.id, userId: actor.id, action: 'PUBLISH' });
  await audit(db, actor, 'draw.publish', 'category', categoryId);
}

export { groupSizes, inArray };
