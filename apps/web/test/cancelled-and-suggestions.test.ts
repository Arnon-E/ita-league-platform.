import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus } from '@/services/tournaments';
import { registerEntry } from '@/services/entries';
import { answerSuggestion, pendingSuggestions, setChildLogin, suggestEntry } from '@/services/children';
import { login } from '@/lib/auth';
import { inbox } from '@/services/notifications';
import { myHome } from '@/services/home';

beforeAll(resetDb);

describe('cancelled tournaments', () => {
  it('take no new categories, can be restored, and disappear from the entrant\'s home', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', 'f@c.il');
    const { actor: parent } = await mkUser('PLAYER', 'p@c.il');
    const kid = await mkPlayer('ילד', { birth: new Date('2014-04-04') });
    await db.insert(schema.guardians).values({ playerId: kid.id, userId: parent.id });
    const t = await createTournament(db, fed, { name: 'תחרות לביטול', startDate: new Date('2099-12-10'), endDate: new Date('2099-12-12'), feeAgorot: 0 });
    const c = await addCategory(db, fed, t.id, { name: 'U14', gender: 'MALE' });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
    await registerEntry(db, parent, c.id, kid.id);
    expect((await myHome(db, parent)).people[0]?.nextTournament?.name).toBe('תחרות לביטול');

    await setStatus(db, fed, t.id, 'CANCELLED');
    expect((await myHome(db, parent)).people[0]?.nextTournament).toBeNull();
    await expect(addCategory(db, fed, t.id, { name: 'U16', gender: 'MALE' })).rejects.toThrow('בוטלה');

    await setStatus(db, fed, t.id, 'DRAFT');
    await expect(addCategory(db, fed, t.id, { name: 'U16', gender: 'MALE' })).resolves.toBeTruthy();
  });
});

describe("a child's request", () => {
  it('shows up for the parent, who can register the child from it', async () => {
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', 'f2@c.il');
    const { actor: parent } = await mkUser('PLAYER', 'p2@c.il');
    const kid = await mkPlayer('דני', { birth: new Date('2014-03-03') });
    await db.insert(schema.guardians).values({ playerId: kid.id, userId: parent.id });
    await setChildLogin(db, parent, kid.id, 'dannyx', 'Passw0rd!!x');
    const r = await login(db, 'dannyx', 'Passw0rd!!x');
    if (!r.ok) throw new Error('child login failed');
    const child = r.actor;
    const t = await createTournament(db, fed, { name: 'פתוחה', startDate: new Date('2099-12-01'), endDate: new Date('2099-12-03'), feeAgorot: 0 });
    const cat = await addCategory(db, fed, t.id, { name: 'U14', gender: 'MALE' });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');

    await suggestEntry(db, child, cat.id);
    const pending = await pendingSuggestions(db, parent);
    expect(pending.map((x) => x.player)).toHaveLength(1);
    expect((await myHome(db, parent)).suggestions).toHaveLength(1);
    // the open request is a card with buttons, not a repeated line in the notification list
    expect((await inbox(db, parent.id)).some((n) => n.kind === 'ENTRY_SUGGESTION')).toBe(false);

    await answerSuggestion(db, parent, pending[0]!.id, true, (categoryId, playerId) => registerEntry(db, parent, categoryId, playerId));
    expect(await pendingSuggestions(db, parent)).toHaveLength(0);
    expect((await db.select().from(schema.entries).where(eq(schema.entries.playerId, kid.id))).length).toBe(1);

    // the child hears the answer, whichever way it went
    const heard = async () => (await db.select().from(schema.notifications).where(eq(schema.notifications.userId, child.id))).filter((n) => n.kind === 'ENTRY_SUGGESTION_ANSWER');
    expect((await heard()).some((n) => n.title === 'ההורה רשם אותך')).toBe(true);
    const cat2 = await addCategory(db, fed, (await db.select().from(schema.categories).where(eq(schema.categories.id, cat.id)))[0]!.tournamentId, { name: 'U16', gender: 'MALE' });
    await suggestEntry(db, child, cat2.id);
    const again = (await pendingSuggestions(db, parent))[0]!;
    await answerSuggestion(db, parent, again.id, false, async () => {});
    expect((await heard()).some((n) => n.title === 'ההורה דחה את הבקשה')).toBe(true);
  });
});
