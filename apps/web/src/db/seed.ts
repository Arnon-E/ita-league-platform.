import { db, sql, schema } from './index';
import { hashPassword } from '@/lib/auth';
import { ensureDefaultRuleSet } from '@/services/rules';
import { createTournament, addCategory, setTournamentCourts, setStatus } from '@/services/tournaments';
import { registerEntry, confirmEntry } from '@/services/entries';
import { recordPayment } from '@/services/payments';

/** Demo data. Password for every demo user: Passw0rd!! */
async function main() {
  const pw = await hashPassword('Passw0rd!!');
  const mk = async (email: string, name: string, role: (typeof schema.users.$inferInsert)['role']) => {
    const [u] = await db.insert(schema.users).values({ email, name, role, passwordHash: pw }).onConflictDoNothing().returning();
    return u ?? (await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) }))!;
  };
  const sa = await mk('super@ita.test', 'מנהל על', 'SUPER_ADMIN');
  await mk('fed@ita.test', 'מנהל איגוד', 'FEDERATION_ADMIN');
  await mk('manager@ita.test', 'מנהל טורניר', 'TOURNAMENT_MANAGER');
  await mk('ref@ita.test', 'שופט', 'REFEREE');
  await ensureDefaultRuleSet(db);
  const clubNames = ['הרצליה', 'רמת השרון', 'תל אביב', 'חיפה', 'באר שבע'];
  const clubs = [];
  for (const name of clubNames) {
    const [c] = await db.insert(schema.clubs).values({ name }).onConflictDoNothing().returning();
    clubs.push(c ?? (await db.query.clubs.findFirst({ where: (t, { eq }) => eq(t.name, name) }))!);
  }
  const first = ['איתמר', 'עומר', 'נועם', 'יונתן', 'אורי', 'דניאל', 'רועי', 'אמיר', 'גיא', 'תומר', 'ליאם', 'אלון', 'שחר', 'עידו', 'מיכאל', 'ניר'];
  const last = ['רז', 'דגן', 'כהן', 'לוי', 'מזרחי', 'אביב', 'שמש', 'ברק', 'פרידמן', 'גולן', 'חן', 'טל', 'נחום', 'סגל', 'וייס', 'אור'];
  const pids: string[] = [];
  for (let i = 0; i < 16; i++) {
    const [p] = await db.insert(schema.players).values({
      firstName: first[i]!, lastName: last[i]!, birthDate: new Date(`200${8 + (i % 2)}-0${1 + (i % 9)}-15`), gender: 'MALE', clubId: clubs[i % clubs.length]!.id,
    }).returning();
    pids.push(p!.id);
    for (const type of ['ID_PHOTO', 'MEDICAL_CERTIFICATE', 'PARENT_CONSENT'] as const) {
      await db.insert(schema.documents).values({ playerId: p!.id, type, status: 'APPROVED', storageKey: `demo/${p!.id}/${type}`, mime: 'image/jpeg' });
    }
    await db.insert(schema.pointsAwards).values({ playerId: p!.id, points: (16 - i) * 10, kind: 'singles', date: new Date(Date.now() - 30 * 86400000) });
  }
  const t = await createTournament(db, sa as never, {
    name: 'אליפות הצעירים — רמת השרון', startDate: new Date(Date.now() + 14 * 86400000), endDate: new Date(Date.now() + 16 * 86400000), feeAgorot: 15000, format: 'KNOCKOUT',
  });
  await setTournamentCourts(db, sa as never, t.id, [{ label: '1' }, { label: '2' }, { label: 'מרכזי' }]);
  const cat = await addCategory(db, sa as never, t.id, { name: 'בנים עד 16', gender: 'MALE' });
  await setStatus(db, sa as never, t.id, 'REGISTRATION_OPEN');
  for (const pid of pids.slice(0, 12)) {
    const e = await registerEntry(db, sa as never, cat.id, pid);
    await recordPayment(db, e.id, 15000);
    await confirmEntry(db, sa as never, e.id);
  }
  console.log('seeded. login: super@ita.test / Passw0rd!!');
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
