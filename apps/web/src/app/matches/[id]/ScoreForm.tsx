'use client';
import { useState } from 'react';
import { liveAction, resultAction } from '@/app/actions';

type S = { a: number; b: number; superTb?: boolean };
const won = (a: number, b: number) => a > b && a >= 6 && (a - b >= 2 || a === 7);

export function ScoreForm({ matchId, tournamentId, a, b, decider, setsToWin, initial, status, absent }: {
  matchId: string; tournamentId: string; a: { id: string; name: string }; b: { id: string; name: string };
  decider: 'set' | 'superTb'; setsToWin: number; initial: S[]; status: string; absent: string | null;
}) {
  const max = setsToWin * 2 - 1;
  const [mode, setMode] = useState<'COMPLETED' | 'RETIRED' | 'WALKOVER'>(status === 'WALKOVER' || status === 'RETIRED' ? status : 'COMPLETED');
  const [reason, setReason] = useState(status === 'RETIRED' ? 'INJURY' : 'NOTICE');
  const [absentId, setAbsentId] = useState(absent ?? b.id);
  const [g, setG] = useState<S[]>(() => Array.from({ length: max }, (_, i) => initial[i] ?? { a: 0, b: 0 }));
  const bump = (i: number, side: 'a' | 'b', d: number) =>
    setG((x) => x.map((s, k) => (k === i ? { ...s, [side]: Math.max(0, Math.min(side && i === max - 1 && decider === 'superTb' ? 30 : 7, s[side] + d)) } : s)));

  let sa = 0, sb = 0;
  const isTb = (i: number) => i === max - 1 && decider === 'superTb';
  g.forEach((s, i) => {
    if (isTb(i)) { if (s.a >= 10 && s.a - s.b >= 2) sa++; else if (s.b >= 10 && s.b - s.a >= 2) sb++; }
    else if (won(s.a, s.b)) sa++; else if (won(s.b, s.a)) sb++;
  });
  const done = sa === setsToWin || sb === setsToWin;
  const winner = mode === 'COMPLETED' ? (sa > sb ? a.name : b.name) : absentId === a.id ? b.name : a.name;
  const ready = mode !== 'COMPLETED' || done;

  return (
    <form action={resultAction} className="grid" style={{ maxWidth: 520 }}>
      <input type="hidden" name="match" value={matchId} /><input type="hidden" name="tournament" value={tournamentId} />
      <input type="hidden" name="mode" value={mode} /><input type="hidden" name="absent" value={absentId} />
      {mode !== 'WALKOVER' && g.map((s, i) => (
        <div key={i} className="card grid" style={{ gap: 8 }}>
          <strong className="muted">{isTb(i) ? 'סופר-טייברייק' : `סט ${i + 1}`}</strong>
          {(['a', 'b'] as const).map((side) => (
            <div key={side} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <span style={{ flex: 1, fontWeight: 700 }}>{side === 'a' ? a.name : b.name}</span>
              <button type="button" className="stp" aria-label="הפחתה" onClick={() => bump(i, side, -1)}>−</button>
              <span style={{ width: 36, textAlign: 'center', fontSize: 28, fontWeight: 800 }}>{s[side]}</span>
              <button type="button" className="stp" aria-label="הוספה" onClick={() => bump(i, side, 1)}>+</button>
              <input type="hidden" name={`${side}${i}`} value={s[side]} />
            </div>
          ))}
          {isTb(i) && <input type="hidden" name={`tb${i}`} value="1" />}
        </div>
      ))}
      <div className="row">
        {([['COMPLETED', 'סיום רגיל'], ['RETIRED', 'פרישה'], ['WALKOVER', 'ווק-אובר']] as const).map(([k, l]) => (
          <button key={k} type="button" className={`btn ${mode === k ? '' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setMode(k)}>{l}</button>
        ))}
      </div>
      {mode !== 'COMPLETED' && <input type="hidden" name="reason" value={reason} />}
      {mode !== 'COMPLETED' && (
        <label>{mode === 'WALKOVER' ? 'נסיבות ההיעדרות (משפיע על ניקוד)' : 'סיבת הפרישה (משפיעה על ניקוד)'}
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {mode === 'WALKOVER'
              ? [['NO_NOTICE', 'לא הגיע ללא הודעה (ללא ניקוד)'], ['NOTICE', 'הודיע מראש ללא אישור רפואי (ללא ניקוד)'], ['NOTICE_MEDICAL', 'הודיע מראש + אישור רפואי (ניקוד לשלב, עד פעמיים בשנה)']].map(([k, l]) => <option key={k} value={k}>{l}</option>)
              : [['INJURY', 'פציעה במהלך המשחק (ניקוד לשלב)'], ['NON_INJURY', 'ללא פציעה (ללא ניקוד)']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      )}
      {mode !== 'COMPLETED' && (
        <label>{mode === 'WALKOVER' ? 'מי לא הגיע?' : 'מי פרש?'}
          <select value={absentId} onChange={(e) => setAbsentId(e.target.value)}><option value={a.id}>{a.name}</option><option value={b.id}>{b.name}</option></select>
        </label>
      )}
      <div className={ready ? 'okmsg' : 'err'} style={{ margin: 0 }}>
        <strong>{ready ? `${winner} מנצח` : 'המשחק עדיין לא הסתיים'}</strong>
        <div className="muted">{ready ? 'המנצח יעלה אוטומטית לשלב הבא.' : 'הזינו תוצאה שמכריעה את המשחק.'}</div>
      </div>
      <button className="btn" disabled={!ready} style={{ minHeight: 54, fontSize: 17 }}>שמירה ועדכון הלוח</button>
      {mode === 'COMPLETED' && status === 'SCHEDULED' && <button type="submit" formAction={liveAction} className="btn ghost" style={{ minHeight: 54 }}>עדכון תוצאה חיה (המשחק נמשך)</button>}
    </form>
  );
}
