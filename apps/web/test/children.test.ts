import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { login } from '@/lib/auth';
import { mkPlayer, mkUser, resetDb } from './helpers';
import { addCategory, createTournament, setStatus } from '@/services/tournaments';
import { registerEntry } from '@/services/entries';
import { uploadDocument } from '@/services/documents';
import { childLoginName, setChildLogin, suggestEntry } from '@/services/children';
import { myHome } from '@/services/home';
import { dispatchQueued } from '@/services/notifications';

beforeAll(resetDb);

describe("child's own login", () => {
  it('lets a parent create a login; the child can view and suggest, but not act', async () => {
    const { actor: parent } = await mkUser('PLAYER', 'mom@t.il');
    const { actor: stranger } = await mkUser('PLAYER', 'other@t.il');
    const { actor: fed } = await mkUser('FEDERATION_ADMIN', 'fed@t.il');
    const kid = await mkPlayer('דני', { birth: new Date('2014-03-03') });
    await db.insert(schema.guardians).values({ playerId: kid.id, userId: parent.id, relation: 'parent' });

    // only the parent may create it, with a sane user name and password
    await expect(setChildLogin(db, stranger, kid.id, 'danny', 'Passw0rd!!x')).rejects.toThrow('רק הורה');
    await expect(setChildLogin(db, parent, kid.id, 'a b', 'Passw0rd!!x')).rejects.toThrow('שם משתמש');
    await expect(setChildLogin(db, parent, kid.id, 'danny', 'short')).rejects.toThrow();
    await setChildLogin(db, parent, kid.id, 'Danny.12', 'Passw0rd!!x');
    expect(await childLoginName(db, kid.id)).toBe('danny.12');
    await expect(setChildLogin(db, parent, (await mkPlayer('אחר')).id, 'danny.12', 'Passw0rd!!x')).rejects.toThrow('רק הורה'); // not their child

    // the child signs in with just the user name
    const r = await login(db, 'danny.12', 'Passw0rd!!x');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const child = r.actor;
    expect((await login(db, 'danny.12', 'wrong-password-1')).ok).toBe(false);

    // the child sees their own home; the parent still sees the child
    const ch = await myHome(db, child);
    expect(ch.isChild).toBe(true);
    expect(ch.people[0]?.name).toContain('דני');
    const ph = await myHome(db, parent);
    expect(ph.role).toBe('PARENT');
    expect(ph.people[0]?.childLogin).toBe('danny.12');

    // view only: no registering, no uploading documents
    const t = await createTournament(db, fed, { name: 'טורניר ילדים', startDate: new Date('2026-12-01'), endDate: new Date('2026-12-03'), feeAgorot: 5000 });
    const cat = await addCategory(db, fed, t.id, { name: 'U14', gender: 'MALE' });
    await setStatus(db, fed, t.id, 'REGISTRATION_OPEN');
    await expect(registerEntry(db, child, cat.id, kid.id)).rejects.toThrow('לצפייה בלבד');
    await expect(uploadDocument(db, child, kid.id, 'ID_PHOTO', new Uint8Array([1]), 'image/jpeg')).rejects.toThrow('לצפייה בלבד');

    // but a suggestion reaches the parent as a notification
    await suggestEntry(db, child, cat.id);
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, parent.id));
    expect(notes.some((n) => n.kind === 'ENTRY_SUGGESTION')).toBe(true);
    expect(notes.filter((n) => n.kind === 'ENTRY_SUGGESTION').map((n) => n.channel).sort()).toEqual(['EMAIL', 'PUSH']);
    // ...and it is pushed to the parent's phone
    await db.insert(schema.deviceTokens).values({ userId: parent.id, token: 'ExponentPushToken[parent]', platform: 'android' });
    const pushed: string[] = [];
    await dispatchQueued(db, { PUSH: async (n) => { if (n.userId === parent.id) pushed.push(n.title); } });
    expect(pushed.some((x) => x.includes('דני'))).toBe(true);

    // the parent can still register the child, and reset the password
    await registerEntry(db, parent, cat.id, kid.id);
    await setChildLogin(db, parent, kid.id, 'danny.12', 'N3wPassw0rd!!');
    expect((await login(db, 'danny.12', 'N3wPassw0rd!!')).ok).toBe(true);
    expect((await login(db, 'danny.12', 'Passw0rd!!x')).ok).toBe(false);
  });
});
