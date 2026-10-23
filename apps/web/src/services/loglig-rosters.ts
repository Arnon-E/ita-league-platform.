import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { schema } from '@/db';
import { splitName } from './loglig-rankings';

const { tournaments, categories, entries, players } = schema;

/**
 * Who is registered, straight from Loglig's public roster of each category. Before the draw there are no matches to read players from,
 * so a competition looks empty here although Loglig already lists everyone. These entries are marked source 'loglig': registration,
 * payment and cancellation happen on Loglig, so the app only shows them (no pay / cancel buttons, no payment reminders).
 */
export interface RosterPlayerIn { userId: number; name: string; image: string | null }
export interface RosterCategoryIn { teamId: number; title: string; players: RosterPlayerIn[] }
export interface RosterCompetitionIn { id: number; title: string; start: string; categories: RosterCategoryIn[] }
export interface RosterImport { kind: 'rosters'; competitions: RosterCompetitionIn[] }

const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function validateRosterImport(x: unknown): RosterImport {
  const b = x as Partial<RosterImport> | null;
  if (!b || b.kind !== 'rosters' || !Array.isArray(b.competitions)) throw new Error('invalid roster import');
  const competitions = b.competitions.slice(0, 60).map((c) => {
    const start = String(c?.start ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error('invalid competition start');
    return {
      id: Number(c?.id) || 0, title: clean(c?.title, 160), start,
      categories: (Array.isArray(c?.categories) ? c.categories : []).slice(0, 40).map((k) => ({
        teamId: Number(k?.teamId) || 0, title: clean(k?.title, 160),
        players: (Array.isArray(k?.players) ? k.players : []).slice(0, 400).map((p) => ({
          userId: Number(p?.userId) || 0, name: clean(p?.name, 120), image: /^[\w.\-]{1,160}$/.test(String(p?.image ?? '')) ? String(p?.image) : null,
        })).filter((p) => p.userId > 0 && p.name),
      })),
    };
  }).filter((c) => c.title);
  return { kind: 'rosters', competitions };
}

/** Tournament names differ slightly between the ITA site and Loglig ("מס'" and quotes), so compare a squeezed form. */
const norm = (s: string) => s.replace(/מס[׳'’]?\.?\s/g, ' ').replace(/["'`׳״.,\-–]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** "סבב זוגות 2 2026 - בנים 14 מוקדמות" or our "זוגות בנים 14" -> gender, age and whether it is a qualifying round. */
export function parseCategoryTitle(title: string): { gender: 'MALE' | 'FEMALE' | 'OPEN'; age: number | null; qualifying: boolean } {
  const tail = title.includes(' - ') ? title.slice(title.lastIndexOf(' - ') + 3) : title;
  const gender = /בנות|נשים|נערות/.test(tail) ? 'FEMALE' : /בנים|גברים|נערים/.test(tail) ? 'MALE' : 'OPEN';
  const age = (tail.match(/(\d{2})(?!\d)/) ?? [])[1];
  return { gender, age: age ? Number(age) : null, qualifying: /מוקדמות|קדם/.test(tail) };
}

export async function importRosters(db: Db, input: RosterImport) {
  const stats = { competitions: 0, unmatched: [] as string[], categories: 0, newCategories: 0, players: 0, newPlayers: 0, entriesAdded: 0, entriesRemoved: 0 };
  const open = await db.select().from(tournaments).where(inArray(tournaments.status, ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'DRAWN', 'IN_PROGRESS', 'DRAFT']));
  for (const comp of input.competitions) {
    const t = open.find((x) => norm(x.name) === norm(comp.title)) ?? open.find((x) => norm(x.name).includes(norm(comp.title)) || norm(comp.title).includes(norm(x.name)));
    if (!t) { stats.unmatched.push(comp.title); continue; }
    stats.competitions++;
    const year = t.startDate.getUTCFullYear();
    let cats = await db.select().from(categories).where(eq(categories.tournamentId, t.id));
    for (const rc of comp.categories) {
      const want = parseCategoryTitle(rc.title);
      let cat = cats.find((c) => { const p = parseCategoryTitle(c.name); return p.gender === want.gender && p.age === want.age && p.qualifying === want.qualifying; });
      if (!cat) {
        const name = clean(rc.title.includes(' - ') ? rc.title.slice(rc.title.lastIndexOf(' - ') + 3) : rc.title, 120);
        [cat] = await db.insert(categories).values({ tournamentId: t.id, name, gender: want.gender, minBirthYear: want.age ? year - want.age : null, format: 'KNOCKOUT' }).returning();
        cats = [...cats, cat!];
        stats.newCategories++;
      }
      stats.categories++;
      const keep: string[] = [];
      // One read of everything this category's roster needs (three queries), then the matching happens in memory and the writes go out as batches.
      // It used to ask the database about each player in turn (several queries per player, hundreds per refresh).
      const gender = want.gender === 'OPEN' ? 'MALE' : want.gender;
      const rows = rc.players.filter((rp, i, a) => a.findIndex((x) => x.userId === rp.userId) === i);
      const uids = rows.map((rp) => String(rp.userId));
      const byUser = new Map<string, typeof players.$inferSelect>();
      for (const x of uids.length ? await db.select().from(players).where(inArray(players.logligUserId, uids)) : []) byUser.set(x.logligUserId!, x);
      const rest = uids.filter((u) => !byUser.has(u));
      const byKey = new Map<string, typeof players.$inferSelect>();
      for (const x of rest.length ? await db.select().from(players).where(inArray(players.logligId, rest.map((u) => `ll:${u}`))) : []) byKey.set(x.logligId!, x);
      // players we only know by name: read those names once; a name match is only used for someone not yet linked to a Loglig user
      const unknownNames = [...new Set(rows.filter((rp) => !byUser.has(String(rp.userId)) && !byKey.has(`ll:${rp.userId}`)).map((rp) => { const n = splitName(rp.name); return `${n.first} ${n.last}`.toLowerCase(); }))];
      const byName = new Map<string, (typeof players.$inferSelect)[]>();
      if (unknownNames.length) {
        const found = await db.select().from(players).where(and(eq(players.gender, gender), sql`lower(${players.firstName} || ' ' || ${players.lastName}) in (select jsonb_array_elements_text(${JSON.stringify(unknownNames)}::jsonb))`));
        for (const x of found) { const k = `${x.firstName} ${x.lastName}`.toLowerCase(); byName.set(k, [...(byName.get(k) ?? []), x]); }
      }
      const linked = new Set<string>(); // players taken during this roster: like before, one player is never matched twice by name
      const changes: { id: string; uid: string; photo: string | null }[] = [];
      const fresh: { rp: RosterPlayerIn; first: string; last: string }[] = [];
      const picked: ({ id: string } | null)[] = [];
      for (const rp of rows) {
        const uid = String(rp.userId);
        const { first, last } = splitName(rp.name);
        let p: typeof players.$inferSelect | undefined = byUser.get(uid) ?? byKey.get(`ll:${rp.userId}`);
        if (!p) {
          const named = (byName.get(`${first} ${last}`.toLowerCase()) ?? []).filter((x) => !x.logligUserId && !linked.has(x.id));
          const fits = want.age ? named.filter((x) => { const age = year - x.birthDate.getUTCFullYear(); return age <= want.age! && age >= want.age! - 3; }) : named;
          p = (fits.length ? fits : named.length === 1 ? named : [])[0];
        }
        if (p) {
          if (p.logligUserId !== uid || p.photo !== rp.image) changes.push({ id: p.id, uid, photo: rp.image });
          linked.add(p.id);
          picked.push(p);
        } else { fresh.push({ rp, first, last }); picked.push(null); }
      }
      stats.players += rc.players.length;
      // people we did not know: created in one statement
      const made = fresh.length ? await db.insert(players).values(fresh.map((f) => ({
        firstName: f.first, lastName: f.last, gender, birthDate: new Date(Date.UTC(year - (want.age ?? 14), 6, 1)), logligId: `lu:${f.rp.userId}`, logligUserId: String(f.rp.userId), photo: f.rp.image,
      }))).returning({ id: players.id, key: players.logligId }) : [];
      stats.newPlayers += made.length;
      const madeBy = new Map(made.map((m) => [m.key, m.id]));
      // Loglig user id and photo of the known players that changed, in one statement
      if (changes.length) {
        await db.execute(sql`update players pl set loglig_user_id = t.uid, photo = t.photo from jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) as t(id text, uid text, photo text) where pl.id = t.id`);
      }
      for (let i = 0; i < rows.length; i++) keep.push(picked[i] ? picked[i]!.id : madeBy.get(`lu:${rows[i]!.userId}`)!);
      // registrations that are missing, in one statement
      const has = new Set((keep.length ? await db.select({ id: entries.playerId }).from(entries).where(and(eq(entries.categoryId, cat!.id), inArray(entries.playerId, keep))) : []).map((x) => x.id));
      const add = [...new Set(keep.filter((id) => !has.has(id)))];
      if (add.length) { await db.insert(entries).values(add.map((id) => ({ categoryId: cat!.id, playerId: id, status: 'CONFIRMED' as const, source: 'loglig' }))); stats.entriesAdded += add.length; }
      // people who left Loglig's list are no longer registered there; entries made inside this app are never touched
      const gone = await db.select({ id: entries.id }).from(entries).where(and(eq(entries.categoryId, cat!.id), eq(entries.source, 'loglig'), keep.length ? notInArray(entries.playerId, keep) : undefined));
      if (gone.length && rc.players.length) {
        await db.delete(entries).where(inArray(entries.id, gone.map((g) => g.id)));
        stats.entriesRemoved += gone.length;
      }
    }
  }
  return stats;
}


/**
 * Rosters of competitions that already finished are only partly complete on Loglig (some withdrew, some are listed under another
 * stage), so they are not used to create entries. They are still the best source of a Loglig user id and photo for players who are
 * not in the ranking: each roster player is matched to someone we already know (user id, ranking key, or the same name and gender
 * within the category's age group) and only the user id and photo are filled in. Nobody and nothing is created.
 */
export async function importRosterPhotos(db: Db, input: RosterImport, now = new Date()) {
  const stats = { seen: 0, matched: 0, updated: 0, ambiguous: 0, unknown: 0 };
  const year = now.getUTCFullYear();
  for (const comp of input.competitions) {
    for (const rc of comp.categories) {
      const want = parseCategoryTitle(rc.title);
      for (const rp of rc.players) {
        stats.seen++;
        if (!rp.image) continue;
        const uid = String(rp.userId);
        let [p] = await db.select().from(players).where(eq(players.logligUserId, uid));
        if (!p) [p] = await db.select().from(players).where(eq(players.logligId, `ll:${rp.userId}`));
        if (!p) {
          const { first, last } = splitName(rp.name);
          const named = (await db.select().from(players).where(and(eq(players.gender, want.gender === 'OPEN' ? 'MALE' : want.gender), sql`lower(${players.firstName} || ' ' || ${players.lastName}) = ${`${first} ${last}`.toLowerCase()}`)))
            .filter((x) => !x.logligUserId);
          const fits = want.age ? named.filter((x) => { const age = year - x.birthDate.getUTCFullYear(); return age <= want.age! + 1 && age >= want.age! - 3; }) : named;
          if (fits.length > 1) { stats.ambiguous++; continue; }
          p = fits[0];
        }
        if (!p) { stats.unknown++; continue; }
        stats.matched++;
        if (p.photo && p.photo !== '') continue;
        const [taken] = await db.select({ id: players.id }).from(players).where(and(eq(players.logligUserId, uid), sql`${players.id} <> ${p.id}`));
        await db.update(players).set({ photo: rp.image, ...(p.logligUserId || taken ? {} : { logligUserId: uid }) }).where(eq(players.id, p.id));
        stats.updated++;
      }
    }
  }
  return stats;
}
