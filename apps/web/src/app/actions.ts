'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Forbidden } from '@/lib/permissions';
import { db } from '@/db';
import { guarded, requireActor } from '@/lib/session';
import { addCategory, createTournament, setStatus, setTournamentCourts } from '@/services/tournaments';
import { confirmEntry, registerEntry, withdrawEntry } from '@/services/entries';
import { recordPayment } from '@/services/payments';
import { publishDraw, runDraw, swapDrawSlots } from '@/services/draws';
import { advanceToKnockout, awardPoints, recordLive, recordResult } from '@/services/results';
import { autoSchedule, setMatchSlot } from '@/services/schedule';
import type { SetScore } from '@ita/rules-engine';

const s = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const n = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
const d = (fd: FormData, k: string) => new Date(s(fd, k));
const back = (id: string, tab: string) => `/tournaments/${id}?tab=${tab}`;

export async function createTournamentAction(fd: FormData) {
  const a = await requireActor();
  let id = '';
  let err = '';
  try {
    const t = await createTournament(db, a, {
      name: s(fd, 'name'), startDate: d(fd, 'start'), endDate: d(fd, 'end'), feeAgorot: Math.round(n(fd, 'fee') * 100),
      format: s(fd, 'format') as 'KNOCKOUT', setsToWin: 2, decider: 'superTb', pointsTableKey: s(fd, 'points') || 'DEFAULT',
    });
    id = t.id;
  } catch (e) {
    err = e instanceof Forbidden ? 'אין הרשאה ליצור תחרות' : e instanceof Error ? e.message : 'שגיאה';
  }
  redirect(err ? `/tournaments/new?err=${encodeURIComponent(err)}` : `/tournaments/${id}?tab=overview`);
}

export async function statusAction(fd: FormData) {
  const a = await requireActor();
  const id = s(fd, 'id');
  await guarded(back(id, 'overview'), async () => { await setStatus(db, a, id, s(fd, 'to')); return 'הסטטוס עודכן'; });
}

export async function categoryAction(fd: FormData) {
  const a = await requireActor();
  const id = s(fd, 'id');
  await guarded(back(id, 'overview'), async () => {
    const fmt = s(fd, 'format');
    await addCategory(db, a, id, {
      name: s(fd, 'name'), gender: s(fd, 'gender') as 'MALE', ...(n(fd, 'capacity') ? { capacity: n(fd, 'capacity') } : {}),
      ...(fmt ? { format: fmt as 'KNOCKOUT' } : {}), ...(fmt === 'GROUPS_KNOCKOUT' ? { groupConfig: { groupSize: n(fd, 'groupSize') || 4, advancers: n(fd, 'advancers') || 2 } } : {}),
    });
    return 'הקטגוריה נוספה';
  });
}

export async function registerAction(fd: FormData) {
  const a = await requireActor();
  const id = s(fd, 'id');
  await guarded(back(id, 'entries'), async () => { await registerEntry(db, a, s(fd, 'category'), s(fd, 'player')); return 'השחקן נרשם'; });
}

export async function entryAction(fd: FormData) {
  const a = await requireActor();
  const id = s(fd, 'id');
  const entry = s(fd, 'entry');
  await guarded(back(id, 'entries'), async () => {
    const op = s(fd, 'op');
    if (op === 'pay') { await recordPayment(db, entry, n(fd, 'amount')); return 'התשלום נרשם'; }
    if (op === 'confirm') { const st = await confirmEntry(db, a, entry, { override: fd.get('override') === '1' }); return st === 'WAITLIST' ? 'נוסף לרשימת המתנה' : 'הרישום אושר'; }
    if (op === 'withdraw') { await withdrawEntry(db, a, entry); return 'הרישום בוטל'; }
  });
}

export async function drawAction(fd: FormData) {
  const a = await requireActor();
  const id = s(fd, 'id');
  const cat = s(fd, 'category');
  await guarded(back(id, 'draw'), async () => {
    const op = s(fd, 'op');
    if (op === 'run') { const r = await runDraw(db, a, cat, { ...(s(fd, 'code') ? { code: n(fd, 'code') } : {}), separateClubs: fd.get('clubs') === '1' }); return `ההגרלה בוצעה (קוד ${r.code})`; }
    if (op === 'swap') { await swapDrawSlots(db, a, cat, n(fd, 'i') - 1, n(fd, 'j') - 1, s(fd, 'reason')); return 'המשבצות הוחלפו'; }
    if (op === 'publish') { await publishDraw(db, a, cat); return 'ההגרלה פורסמה'; }
    if (op === 'advance') { const r = await advanceToKnockout(db, a, cat, { force: fd.get('force') === '1' }); return `${r.qualified} שחקנים עלו לשלב ההדחה`; }
    if (op === 'points') { const r = await awardPoints(db, a, cat); return `חולקו נקודות ל-${r.awarded} שחקנים`; }
  });
}

export async function courtsAction(fd: FormData) {
  const a = await requireActor();
  const id = s(fd, 'id');
  await guarded(back(id, 'schedule'), async () => {
    const labels = s(fd, 'labels').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    const r = await setTournamentCourts(db, a, id, labels.map((label) => ({ label })));
    return `המגרשים עודכנו${r.unassigned.length ? ` · ${r.unassigned.length} משחקים הוסרו משיבוץ` : ''}`;
  });
}

export async function autoScheduleAction(fd: FormData) {
  const a = await requireActor();
  const id = s(fd, 'id');
  await guarded(back(id, 'schedule'), async () => {
    const r = await autoSchedule(db, a, id, {
      firstDayStart: new Date(`${s(fd, 'day')}T${s(fd, 'from') || '09:00'}:00`), days: n(fd, 'days') || 1, dailyMinutes: (n(fd, 'hours') || 10) * 60, restMin: n(fd, 'rest') || 30,
    });
    return `שובצו ${r.assigned} משחקים${r.unassigned.length ? ` · ${r.unassigned.length} ללא שיבוץ` : ''}${r.conflicts.length ? ` · ${r.conflicts.length} התנגשויות` : ''}`;
  });
}

export async function slotAction(fd: FormData) {
  const a = await requireActor();
  const id = s(fd, 'id');
  await guarded(back(id, 'schedule'), async () => {
    const kind = s(fd, 'kind');
    const m = s(fd, 'match');
    if (kind === 'CLEAR') await setMatchSlot(db, a, m, { kind: 'CLEAR' });
    else if (kind === 'NOT_BEFORE') await setMatchSlot(db, a, m, { kind: 'NOT_BEFORE', notBefore: d(fd, 'when') });
    else await setMatchSlot(db, a, m, { kind: 'EXACT', courtLabel: s(fd, 'court'), start: d(fd, 'when') });
    return 'המשחק עודכן';
  });
}

export async function liveAction(fd: FormData) {
  const a = await requireActor();
  const match = s(fd, 'match');
  await guarded(`/matches/${match}`, async () => {
    const sets: SetScore[] = [];
    for (let i = 0; i < 3; i++) {
      const x = fd.get(`a${i}`); const y = fd.get(`b${i}`);
      if (x === null || y === null || (Number(x) === 0 && Number(y) === 0)) continue;
      sets.push({ a: Number(x), b: Number(y), ...(fd.get(`tb${i}`) === '1' ? { superTb: true } : {}) });
    }
    await recordLive(db, a, match, sets);
    return 'התוצאה החיה עודכנה';
  });
}

export async function resultAction(fd: FormData) {
  const a = await requireActor();
  const match = s(fd, 'match');
  const tid = s(fd, 'tournament');
  await guarded(`/matches/${match}`, async () => {
    const mode = s(fd, 'mode');
    const sets: SetScore[] = [];
    for (let i = 0; i < 3; i++) {
      const x = fd.get(`a${i}`); const y = fd.get(`b${i}`);
      if (x === null || y === null || (Number(x) === 0 && Number(y) === 0)) continue;
      sets.push({ a: Number(x), b: Number(y), ...(fd.get(`tb${i}`) === '1' ? { superTb: true } : {}) });
    }
    await recordResult(db, a, match, mode === 'COMPLETED'
      ? { status: 'COMPLETED', sets }
      : { status: mode as 'WALKOVER', ...(mode === 'RETIRED' ? { sets } : {}), absentEntryId: s(fd, 'absent'), reason: s(fd, 'reason') as 'NOTICE' });
    revalidatePath(`/tournaments/${tid}`);
    return 'התוצאה נשמרה';
  });
}
