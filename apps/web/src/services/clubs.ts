import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';

const { clubs, players, users, follows } = schema;

/** Known spellings of the same club (the right-hand side is the name we keep). */
export const CLUB_ALIASES: Record<string, string> = {
  'מכבי ראשון לציון גלי הדר': 'מכבי גלי הדר ראשון לציון',
};

/**
 * The one club a source string stands for. Loglig lists a player registered with several clubs as "A, B": that player belongs to
 * the first (the current one), not to a club called "A, B". Known alternative spellings are mapped to the name we keep.
 */
export function canonicalClub(raw: string): string {
  const first = (raw.split(',')[0] ?? '').replace(/\s+/g, ' ').trim();
  const name = first || raw.replace(/\s+/g, ' ').trim();
  return CLUB_ALIASES[name] ?? name;
}

/**
 * Folds every club whose name is not canonical (combined "A, B" names, known alternative spellings) into its canonical club,
 * moving players, club managers and followers, then deletes the leftover. With dryRun it only reports the plan.
 */
export async function mergeClubs(db: Db, opts: { dryRun?: boolean } = {}) {
  const all = await db.select().from(clubs);
  const byName = new Map(all.map((c) => [c.name, c]));
  const plan = all.filter((c) => canonicalClub(c.name) !== c.name).map((c) => ({ id: c.id, from: c.name, to: canonicalClub(c.name), playersCount: 0 }));
  const counts = (await db.execute(sql`select club_id as id, count(*)::int as n from players where club_id is not null group by club_id`)) as unknown as { id: string; n: number }[];
  const n = new Map(counts.map((r) => [r.id, r.n]));
  for (const p of plan) p.playersCount = n.get(p.id) ?? 0;
  if (opts.dryRun || !plan.length) return { dryRun: !!opts.dryRun, merged: 0, playersMoved: 0, plan };

  let playersMoved = 0;
  await db.transaction(async (tx) => {
    for (const p of plan) {
      const from = byName.get(p.from)!;
      let target = byName.get(p.to);
      if (!target) {
        // the canonical club does not exist yet: this one becomes it
        await tx.update(clubs).set({ name: p.to }).where(eq(clubs.id, from.id));
        byName.delete(p.from); byName.set(p.to, { ...from, name: p.to });
        continue;
      }
      const moved = await tx.update(players).set({ clubId: target.id }).where(eq(players.clubId, from.id)).returning({ id: players.id });
      playersMoved += moved.length;
      await tx.update(users).set({ clubId: target.id }).where(eq(users.clubId, from.id));
      await tx.execute(sql`delete from follows f where f.kind = 'CLUB' and f.target_id = ${from.id} and exists (select 1 from follows g where g.user_id = f.user_id and g.kind = 'CLUB' and g.target_id = ${target.id})`);
      await tx.update(follows).set({ targetId: target.id }).where(and(eq(follows.kind, 'CLUB'), eq(follows.targetId, from.id)));
      // keep whatever the leftover knew that the kept club does not
      if (from.info && !target.info) await tx.update(clubs).set({ info: from.info, city: target.city ?? from.city }).where(eq(clubs.id, target.id));
      await tx.delete(clubs).where(eq(clubs.id, from.id));
      byName.delete(p.from);
    }
  });
  return { dryRun: false, merged: plan.length, playersMoved, plan };
}
