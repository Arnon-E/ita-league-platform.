import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as api from './api';
import { T, Icon } from './theme';
import { locale, startAlign, tr } from './i18n';

const C = { navy: T.text, blue: T.blue, line: T.line, muted: T.muted };

function useData<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(true);
  useEffect(() => { fn().then(setData).catch((e) => setErr(e.message)).finally(() => setBusy(false)); }, []);
  return { data, err, busy };
}
const Wait = ({ err, busy }: { err: string; busy: boolean }) => (busy ? <ActivityIndicator color={T.blue} style={{ margin: 16 }} /> : err ? <Text style={st.err}>{err}</Text> : null);
const Head = ({ title, onBack }: { title: string; onBack?: () => void }) => (
  <View style={st.head}>{onBack && <Pressable onPress={onBack} hitSlop={10}><View style={st.backBtn}><Icon name="back" size={20} color={T.text} /></View></Pressable>}<Text style={st.h1}>{title}</Text></View>
);

function Leagues({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const { data, err, busy } = useData(api.leagues);
  if (open) return <LeagueView id={open} onBack={() => setOpen(null)} />;
  return (
    <View style={st.pad}>
      <Head title={tr('ליגות')} onBack={onBack} />
      <Wait err={err} busy={busy} />
      <FlatList contentContainerStyle={{ paddingBottom: 100 }} data={data ?? []} keyExtractor={(l) => l.id} ListEmptyComponent={!busy && !err ? <Text style={st.muted}>{tr('אין עדיין ליגות')}</Text> : null}
        renderItem={({ item }) => (
          <Pressable style={st.card} onPress={() => setOpen(item.id)}>
            <Text style={st.b}>{item.name}</Text>
            <Text style={st.muted}>{tr('{teams} קבוצות · {played}/{total} משחקים שוחקו', { teams: item.teams, played: item.played, total: item.total })}</Text>
          </Pressable>
        )} />
    </View>
  );
}

function LeagueView({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, err, busy } = useData(() => api.league(id));
  const [team, setTeam] = useState('');
  const [openTie, setOpenTie] = useState('');
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Head title={data?.name ?? tr('ליגה')} onBack={onBack} />
      <Wait err={err} busy={busy} />
      {(data?.groups ?? []).map((g) => (
        <View key={g.name} style={st.card}>
          <Text style={st.b}>{g.name}</Text>
          <View style={st.tr}><Text style={[st.th, { width: 22 }]}>#</Text><Text style={[st.th, { flex: 1 }]}>{tr('קבוצה')}</Text><Text style={st.th2}>{tr('מש׳')}</Text><Text style={st.th2}>{tr('נק׳')}</Text><Text style={st.th2}>{tr('נצ׳')}</Text><Text style={st.th2}>{tr('הפ׳')}</Text></View>
          {g.standings.map((s) => (
            <Pressable key={s.team} style={st.tr} onPress={() => setTeam(team === s.team ? '' : s.team)}>
              <Text style={{ width: 22 }}>{s.rank}</Text>
              <Text style={[{ flex: 1 }, team === s.team && { fontWeight: '800', color: C.blue }]} numberOfLines={2}>{s.team}</Text>
              <Text style={st.td2}>{s.played}</Text><Text style={[st.td2, { fontWeight: '800' }]}>{s.points}</Text><Text style={st.td2}>{s.wins}</Text><Text style={st.td2}>{s.losses}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      {data ? <Text style={st.muted}>{team ? tr('מסונן לפי: {team} (לחיצה נוספת מנקה)', { team }) : tr('לחצו על קבוצה כדי לראות רק את המשחקים שלה')}</Text> : null}
      {(data?.rounds ?? []).map((r) => {
        const ms = r.matches.filter((m) => !team || m.home.team === team || m.away.team === team);
        if (!ms.length) return null;
        return (
          <View key={r.name} style={st.card}>
            <Text style={st.b}>{r.name}</Text>
            {ms.map((m, i) => {
              const hw = m.done && (m.homeScore ?? 0) > (m.awayScore ?? 0);
              const aw = m.done && (m.awayScore ?? 0) > (m.homeScore ?? 0);
              return (
                <Pressable key={i} onPress={() => setOpenTie(openTie === `${r.name}${i}` ? '' : `${r.name}${i}`)} style={{ gap: 2, paddingVertical: 4, borderTopWidth: i ? 1 : 0, borderColor: C.line }}>
                  <View style={st.row}><Text style={[{ flex: 1 }, hw && { fontWeight: '800' }]}>{hw ? '✓ ' : ''}{m.home.team}</Text><Text style={[st.sc, hw && { fontWeight: '800' }]}>{m.done ? m.homeScore : ''}</Text></View>
                  <View style={st.row}><Text style={[{ flex: 1 }, aw && { fontWeight: '800' }]}>{aw ? '✓ ' : ''}{m.away.team}</Text><Text style={[st.sc, aw && { fontWeight: '800' }]}>{m.done ? m.awayScore : ''}</Text></View>
                  <Text style={st.muted}>{m.start ? new Date(m.start).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}{m.venue ? ` · ${m.venue}` : ''}{m.rubbers?.length ? ` · ${tr('לחצו לפירוט')}` : ''}</Text>
                  {openTie === `${r.name}${i}` && (m.rubbers ?? []).map((x) => (
                    <View key={x.n} style={{ paddingStart: 8, paddingVertical: 2 }}>
                      <Text style={x.winner === 'home' ? { fontWeight: '800' } : undefined}>{x.winner === 'home' ? '✓ ' : ''}{x.home.join(' / ')}</Text>
                      <Text style={{ color: C.muted }}>{x.sets.map((z) => `${z.h}-${z.g}`).join('  ')}</Text>
                      <Text style={x.winner === 'away' ? { fontWeight: '800' } : undefined}>{x.winner === 'away' ? '✓ ' : ''}{x.away.join(' / ')}</Text>
                    </View>
                  ))}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

function AboutScreen({ onBack }: { onBack: () => void }) {
  const { data, err, busy } = useData(api.about);
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Head title={tr('אודות האיגוד')} onBack={onBack} />
      <Wait err={err} busy={busy} />
      {data?.union.description ? <View style={st.card}><Text>{data.union.description}</Text></View> : null}
      {data?.union.about ? <View style={st.card}><Text>{data.union.about}</Text></View> : null}
      {data?.union.regulation ? <><Text style={st.h2}>{tr('תקנון')}</Text><View style={st.card}><Text>{data.union.regulation}</Text></View></> : null}
      {data?.union.statement ? <><Text style={st.h2}>{tr('הצהרת שחקן')}</Text><View style={st.card}><Text>{data.union.statement}</Text></View></> : null}
      {!!data?.forms.length && <Text style={st.h2}>{tr('טפסי הרשמה')}</Text>}
      {(data?.forms ?? []).map((f) => (
        <Pressable key={f.id} style={st.card} onPress={() => Linking.openURL(f.url)}><Text style={st.b}>{f.name}</Text><Text style={st.muted}>{f.description}</Text></Pressable>
      ))}
      {!!data?.events.length && <Text style={st.h2}>{tr('אירועים')}</Text>}
      {(data?.events ?? []).map((e, i) => (
        <Pressable key={i} style={st.card} disabled={!e.url} onPress={() => Linking.openURL(e.url)}>
          <Text style={st.b}>{e.title}</Text>
          <Text style={st.muted}>{e.start ? new Date(e.start).toLocaleDateString(locale()) : ''}{e.place ? ` · ${e.place}` : ''}</Text>
          {!!e.description && <Text>{e.description}</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Regulations({ onBack }: { onBack: () => void }) {
  const { data, err, busy } = useData(api.regulations);
  const [q, setQ] = useState('');
  const rows = (data ?? []).filter((r) => !q.trim() || r.title.includes(q.trim()) || r.category.includes(q.trim()));
  const cats = [...new Set(rows.map((r) => r.category))];
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Head title={tr('תקנונים ונהלים')} onBack={onBack} />
      <TextInput style={[st.input, startAlign()]} placeholder={tr('חיפוש מסמך')} placeholderTextColor={T.muted} value={q} onChangeText={setQ} />
      <Wait err={err} busy={busy} />
      {cats.map((c) => (
        <View key={c}>
          <Text style={st.h2}>{c}</Text>
          {rows.filter((r) => r.category === c).map((r) => (
            <Pressable key={r.id} style={st.card} onPress={() => Linking.openURL(r.url)}><Text style={st.b}>{r.title}</Text><Text style={st.muted}>{tr('פתיחה ↗')}</Text></Pressable>
          ))}
        </View>
      ))}
      {!busy && !err && !rows.length && <Text style={st.muted}>{tr('אין עדיין מסמכים')}</Text>}
    </ScrollView>
  );
}

function Clubs({ onBack }: { onBack: () => void }) {
  const { data, err, busy } = useData(api.clubs);
  const [q, setQ] = useState('');
  const rows = (data ?? []).filter((c) => !q.trim() || c.name.includes(q.trim()));
  return (
    <View style={st.pad}>
      <Head title={tr('מועדונים')} onBack={onBack} />
      <TextInput style={[st.input, startAlign()]} placeholder={tr('חיפוש מועדון')} placeholderTextColor={T.muted} value={q} onChangeText={setQ} />
      <Wait err={err} busy={busy} />
      <FlatList contentContainerStyle={{ paddingBottom: 100 }} data={rows} keyExtractor={(c) => c.id} renderItem={({ item }) => <View style={st.card}><Text style={st.b}>{item.name}</Text><Text style={st.muted}>{item.city ? `${item.city} · ` : ''}{tr('{n} שחקנים', { n: item.players })}</Text></View>} />
    </View>
  );
}

function Stats({ onBack }: { onBack: () => void }) {
  const { data, err, busy } = useData(api.stats);
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Head title={tr('סטטיסטיקות')} onBack={onBack} />
      <Wait err={err} busy={busy} />
      {data && <>
        <View style={st.row}>
          {([['תחרויות', data.totals.tournaments], ['שחקנים', data.totals.players], ['משחקים', data.totals.matches]] as const).map(([l, n]) => (
            <View key={l} style={[st.card, { flex: 1, alignItems: 'center' }]}><Text style={{ fontSize: 24, fontWeight: '800', color: C.navy }}>{n}</Text><Text style={st.muted}>{tr(l)}</Text></View>
          ))}
        </View>
        <Text style={st.h2}>{tr('מובילים בניצחונות')}</Text>
        {data.top.map((p, i) => <View key={p.id} style={st.card}><Text style={st.b}>{i + 1}. {p.name}</Text><Text style={st.muted}>{p.club ?? ''} · {tr('{wins} ניצחונות מתוך {played} ({pct}%)', { wins: p.wins, played: p.played, pct: Math.round((100 * p.wins) / p.played) })}</Text></View>)}
        {!data.top.length && <Text style={st.muted}>{tr('אין עדיין משחקים שהסתיימו')}</Text>}
        <Text style={st.h2}>{tr('מועדונים גדולים')}</Text>
        {data.clubs.map((c) => <View key={c.id} style={st.card}><Text style={st.b}>{c.name}</Text><Text style={st.muted}>{tr('{n} שחקנים', { n: c.players })}</Text></View>)}
      </>}
    </ScrollView>
  );
}

const ITEMS = [
  ['leagues', 'leagues', 'ליגות', 'ליגת Winner: טבלאות ולוח משחקים'],
  ['regs', 'doc', 'תקנונים ונהלים', 'כל התקנונים והמסמכים של האיגוד'],
  ['clubs', 'club', 'מועדונים', 'רשימת המועדונים וכמות השחקנים'],
  ['stats', 'stats', 'סטטיסטיקות', 'מובילים בניצחונות ומועדונים גדולים'],
  ['about', 'info', 'אודות האיגוד', 'מי אנחנו, טפסי הרשמה ואירועים'],
] as const;

/** The website's remaining sections (leagues, regulations, clubs, statistics, about); the menu opens one of them directly. */
export function More({ initial }: { initial?: string }) {
  const [page, setPage] = useState<string | null>(initial ?? null);
  const back = () => setPage(null);
  if (page === 'leagues') return <Leagues onBack={back} />;
  if (page === 'regs') return <Regulations onBack={back} />;
  if (page === 'about') return <AboutScreen onBack={back} />;
  if (page === 'clubs') return <Clubs onBack={back} />;
  if (page === 'stats') return <Stats onBack={back} />;
  return (
    <View style={st.pad}>
      <Head title={tr('עוד')} />
      {ITEMS.map(([k, ic, t, sub]) => (
        <Pressable key={k} style={[st.card, st.menu]} onPress={() => setPage(k)}>
          <View style={st.ic}><Icon name={ic} size={22} color={T.ink} /></View><View style={{ flex: 1 }}><Text style={st.b}>{tr(t)}</Text><Text style={st.muted}>{tr(sub)}</Text></View>
        </Pressable>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  menu: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ic: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.volt, alignItems: 'center', justifyContent: 'center' },
  pad: { padding: 16, gap: 10, paddingBottom: 110 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: T.line2, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 32, fontWeight: '800', color: T.text, letterSpacing: -0.8, flexShrink: 1 },
  h2: { fontSize: 22, fontWeight: '700', color: T.text, letterSpacing: -0.4, marginTop: 8, marginBottom: 6 },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 22, padding: 18, marginBottom: 8, gap: 4 },
  b: { fontSize: 16, fontWeight: '700', color: T.text },
  muted: { color: T.muted, fontSize: 14 },
  err: { backgroundColor: T.badbg, color: T.bad, padding: 12, borderRadius: 14, overflow: 'hidden', margin: 12 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line2, borderRadius: 14, paddingHorizontal: 16, minHeight: 48, fontSize: 16, textAlign: 'right', color: T.text },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, borderBottomWidth: 1, borderColor: T.line },
  th: { fontWeight: '600', color: T.muted, fontSize: 12 },
  th2: { width: 34, textAlign: 'center', fontWeight: '600', color: T.muted, fontSize: 12 },
  td2: { width: 34, textAlign: 'center', color: T.text },
  sc: { width: 28, textAlign: 'center', color: T.text },
});
