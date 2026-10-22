import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as api from './api';
import { T } from './theme';
import { locale, tr } from './i18n';
import { MatchCard, matchWhen } from './MatchCard';
import { useNav } from './Detail';

const DOC: Record<string, string> = { ID_PHOTO: 'תמונת ת״ז', PARENT_CONSENT: 'אישור הורים', MEDICAL_CERTIFICATE: 'אישור רפואי', OTHER: 'אחר' };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const score = (sets: { a: number; b: number }[]) => `⁦${sets.map((x) => `${x.a}-${x.b}`).join('  ')}⁩`;

/** Personal home for a signed-in player and/or parent: one card per player profile on the account. Renders nothing for guests or accounts without a profile. */
export function MyHome({ authed, onOpen, onGoAccount, onAdmin }: { authed: boolean; onOpen: (tournamentId: string) => void; onGoAccount: () => void; onAdmin?: () => void }) {
  const nav = useNav();
  const [h, setH] = useState<Awaited<ReturnType<typeof api.myHome>> | null>(null);
  const [err, setErr] = useState('');
  const load = () => { if (authed) api.myHome().then(setH).catch(() => setH(null)); else setH(null); };
  useEffect(load, [authed]);
  const answer = (id: string, accept: boolean) => api.answerSuggestion(id, accept).then(() => { setErr(''); load(); }).catch((e) => setErr(e.message));
  if (!h || (h.role === 'NONE' && !h.work)) return null;
  const w = h.work;
  return (
    <View style={{ gap: 10 }}>
      {w && (
        <View style={{ gap: 10 }}>
          <Text style={m.h2}>{tr(w.kind === 'ADMIN' ? 'מה מחכה לטיפול' : w.kind === 'CLUB' ? 'המועדון שלי' : 'התחרויות שלי')}</Text>
          {w.admin && <View style={m.stats}>{([['מסמכים לאישור', w.admin.pendingDocs], ['בקשות שיוך', w.admin.pendingClaims], ['הרשמה פתוחה', w.admin.openRegistration], ['מתקיימות', w.admin.inProgress]] as const).map(([l, n]) => <View key={l} style={m.stat}><Text style={m.statN}>{n}</Text><Text style={m.muted}>{tr(l)}</Text></View>)}</View>}
          {w.admin && !!onAdmin && <Pressable style={m.card} onPress={onAdmin}><Text style={{ fontWeight: '700', color: T.text, fontSize: 16 }}>{tr('לטיפול: מסמכים ובקשות שיוך')} ›</Text></Pressable>}
          {w.tournaments.map((x) => (
            <Pressable key={x.id} style={m.card} onPress={() => onOpen(x.id)}>
              <Text style={m.name}>{x.name}</Text>
              <Text style={m.muted}>{new Date(x.start).toLocaleDateString(locale())} – {new Date(x.end).toLocaleDateString(locale())}</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <View style={[m.pill, { backgroundColor: x.waiting ? T.warnbg : T.okbg }]}><Text style={{ color: x.waiting ? T.warn : T.ok, fontWeight: '700', fontSize: 12.5 }}>{x.waiting ? tr('{n} משחקים ממתינים לתוצאה', { n: x.waiting }) : tr('אין משחקים ממתינים')}</Text></View>
                <View style={[m.pill, { backgroundColor: T.surface2 }]}><Text style={m.muted}>{tr('{n} משחקים פתוחים', { n: x.upcoming })}</Text></View>
              </View>
            </Pressable>
          ))}
          {!w.admin && !w.club && !w.tournaments.length && <Text style={m.muted}>{tr('לא שובצת כרגע לתחרות פעילה.')}</Text>}
          {w.club && (
            <View style={m.card}>
              <Text style={m.name}>{w.club.name}</Text>
              <View style={m.stats}>
                <View style={m.stat}><Text style={m.statN}>{w.club.players}</Text><Text style={m.muted}>{tr('שחקנים')}</Text></View>
                <View style={m.stat}><Text style={m.statN}>{w.club.upcomingEntries}</Text><Text style={m.muted}>{tr('הרשמות ב-90 ימים')}</Text></View>
              </View>
              {w.club.top.map((p) => <View key={p.id} style={m.res}><Text style={m.b}>#{p.rank}</Text><Text style={[m.b, { flex: 1 }]} numberOfLines={1}>{p.name}</Text><Text style={m.muted}>{p.points}</Text></View>)}
            </View>
          )}
        </View>
      )}
      {(h.suggestions ?? []).length > 0 && (
        <View style={[m.card, { borderColor: T.volt, borderWidth: 1.5 }]}>
          <Text style={m.name}>{tr('בקשות הרשמה מהילדים')}</Text>
          {h.suggestions.map((x) => (
            <View key={x.id} style={{ gap: 6 }}>
              <Text style={m.b}>{x.player} {tr('רוצה להירשם')}</Text>
              <Pressable onPress={() => onOpen(x.tournamentId)}><Text style={m.muted}>{x.tournament} · {x.category}</Text></Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable style={m.reg} onPress={() => answer(x.id, true)}><Text style={m.regT}>{tr('רישום')}</Text></Pressable>
                <Pressable style={m.regOff} onPress={() => answer(x.id, false)}><Text style={m.regOffT}>{tr('לא לרשום')}</Text></Pressable>
              </View>
            </View>
          ))}
          {!!err && <Text style={{ color: T.bad }}>{err}</Text>}
        </View>
      )}
      {h.people.length > 0 && <Text style={m.h2}>{tr(h.role === 'PLAYER' ? 'הבית שלי' : h.role === 'PARENT' ? 'הילדים שלי' : 'אני והילדים')}</Text>}
      {h.people.map((p) => (
        <View key={p.id} style={m.card}>
          <Pressable style={({ pressed }) => [m.head, pressed && { opacity: 0.7 }]} onPress={() => nav.player(p.id)} accessibilityRole="link">
            <View style={m.av}><Text style={m.avT}>{p.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[m.name, m.link]}>{p.name}</Text>
              <Text style={m.muted}>{p.relation === 'CHILD' ? `${tr('ילד/ה')} · ` : ''}{tr('גיל {n}', { n: p.age })}{p.club ? ` · ${p.club}` : ''}</Text>
            </View>
          </Pressable>
          <View style={m.stats}>
            <View style={m.stat}><Text style={m.statN}>{p.rank ? `#${p.rank}` : '—'}</Text><Text style={m.muted}>{tr('דירוג')}</Text></View>
            <View style={m.stat}><Text style={m.statN}>{p.points}</Text><Text style={m.muted}>{tr('נקודות')}</Text></View>
            <View style={m.stat}><Text style={m.statN}>{`⁦${p.wins}/${p.losses}⁩`}</Text><Text style={m.muted}>{tr('נצ׳/הפ׳')}</Text></View>
            {p.form.length > 0 && <View style={m.form}>{p.form.map((w, i) => <View key={i} style={[m.dot, { backgroundColor: w ? T.okbg : T.badbg }]}><Text style={{ color: w ? T.ok : T.bad, fontWeight: '800', fontSize: 12 }}>{tr(w ? 'נ' : 'ה')}</Text></View>)}</View>}
          </View>
          {!h.isChild && p.todo.map((x, i) => (
            <Pressable key={i} onPress={onGoAccount} style={m.warn}><Text style={m.warnT}>{x.startsWith('DOCS:') ? tr('חסר: {list}', { list: x.slice(5).split(',').map((d) => tr(DOC[d] ?? d)).join(', ') }) : tr('ממתין לתשלום: {name}', { name: x.slice(4) })}</Text></Pressable>
          ))}
          {p.nextMatch && <View style={m.sec}><Text style={m.label}>{tr('המשחק הבא')}</Text><Text style={m.b}>{p.nextMatch.opponent ?? tr('יתברר')}</Text><Text style={m.muted}>{p.nextMatch.tournament}{p.nextMatch.start ? ` · ${when(p.nextMatch.start)}` : ''}{p.nextMatch.court ? ` · ${tr('מגרש {c}', { c: p.nextMatch.court })}` : ''}</Text></View>}
          {p.nextTournament && (
            <Pressable style={m.sec} onPress={() => onOpen(p.nextTournament!.id)}>
              <Text style={m.label}>{tr('התחרות הבאה')}</Text><Text style={m.b}>{p.nextTournament.name}</Text>
              <Text style={m.muted}>{new Date(p.nextTournament.start).toLocaleDateString(locale())} · {p.nextTournament.category}</Text>
            </Pressable>
          )}
          {(p.results ?? []).length > 0 && (
            <View style={m.sec}><Text style={m.label}>{tr('תוצאות אחרונות')}</Text>
              <View style={{ marginTop: 4 }}>{(p.results ?? []).map((r) => <MatchCard key={r.id} a={r.a} b={r.b} sets={r.sets} status={r.status} winner={r.winner} mine={r.mine} caption={`${r.tournament} · ${r.category}`} when={matchWhen(r.start, r.kind)} />)}</View>
            </View>
          )}
          {p.canRegister.length > 0 && (
            <View style={m.sec}><Text style={m.label}>{tr('אפשר להירשם')}</Text>
              <View style={{ gap: 6 }}>{p.canRegister.slice(0, 3).map((r) => (
                <Pressable key={r.categoryId} style={m.reg} onPress={() => onOpen(r.tournamentId)}><Text style={m.regT} numberOfLines={1}>{r.tournament} · {r.category}</Text></Pressable>
              ))}</View>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const m = StyleSheet.create({
  h2: { fontSize: 22, fontWeight: '700', color: T.text, letterSpacing: -0.4, marginTop: 8 },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 22, padding: 18, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  av: { width: 48, height: 48, borderRadius: 24, backgroundColor: T.volt, alignItems: 'center', justifyContent: 'center' }, avT: { color: T.ink, fontWeight: '800', fontSize: 18 },
  link: { color: T.blue, textDecorationLine: 'underline' },
  name: { fontSize: 18, fontWeight: '700', color: T.text }, muted: { color: T.muted, fontSize: 13 }, b: { color: T.text, fontWeight: '700', fontSize: 16 },
  stats: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  stat: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line, minWidth: 74 }, statN: { color: T.text, fontWeight: '700', fontSize: 20 },
  form: { flexDirection: 'row', gap: 4, marginStart: 'auto' }, dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  warn: { alignSelf: 'flex-start', backgroundColor: T.warnbg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }, warnT: { color: T.warn, fontWeight: '600', fontSize: 13 },
  sec: { gap: 2, paddingTop: 10, borderTopWidth: 1, borderColor: T.line }, label: { color: T.muted, fontSize: 12.5 },
  res: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }, pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  reg: { alignSelf: 'flex-start', backgroundColor: T.volt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%' }, regT: { color: T.ink, fontWeight: '700', fontSize: 14 },
  regOff: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: T.line }, regOffT: { color: T.muted, fontWeight: '600', fontSize: 14 },
});
