import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, I18nManager, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { Platform } from 'react-native';
import * as api from './src/api';

async function registerPush() {
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const t = await Notifications.getExpoPushTokenAsync();
    await api.registerDevice(t.data, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch { /* push is optional: the in-app inbox still works */ }
}

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

const C = { navy: '#0B2545', blue: '#1659B5', blue2: '#2F7CF6', lime: '#D4F23C', bg: '#F4F6FA', line: '#E3E8F0', muted: '#5B6B80' };

type Tab = 't' | 'live' | 'rank' | 'players' | 'me';
const TABS: [Tab, string, string][] = [['t', 'תחרויות', '🏆'], ['live', 'משחקים', '🎾'], ['rank', 'דירוג', '📊'], ['players', 'שחקנים', '👥'], ['me', 'חשבון', '👤']];

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => { api.loadToken().then((t) => { setAuthed(!!t); setReady(true); }); }, []);
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  return <SafeAreaView style={s.screen}><Home authed={authed} setAuthed={setAuthed} /></SafeAreaView>;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  return (
    <View style={s.pad}>
      <Text style={s.h1}>כניסה</Text>
      {!!err && <Text style={s.err}>{err}</Text>}
      <TextInput style={s.input} placeholder="אימייל" placeholderTextColor="#8FA1BA" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="סיסמה" placeholderTextColor="#8FA1BA" secureTextEntry value={pw} onChangeText={setPw} />
      <Pressable style={s.btn} onPress={() => api.login(email, pw).then(onDone).catch((e) => setErr(e.message === 'invalid' ? 'אימייל או סיסמה שגויים' : e.message === 'locked' ? 'החשבון ננעל זמנית' : e.message))}><Text style={s.btnT}>כניסה</Text></Pressable>
    </View>
  );
}

function Home({ authed, setAuthed }: { authed: boolean; setAuthed: (v: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('t');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { if (authed) registerPush(); }, [authed]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {open ? <Tournament id={open} onBack={() => setOpen(null)} />
          : tab === 't' ? <TournamentList onOpen={setOpen} />
          : tab === 'live' ? <Live />
          : tab === 'rank' ? <Rankings />
          : tab === 'players' ? <Players />
          : authed ? <MyArea onLogout={() => api.logout().then(() => setAuthed(false))} /> : <Login onDone={() => setAuthed(true)} />}
      </View>
      <View style={s.tabbar}>
        {TABS.map(([k, l, ic]) => { const on = tab === k && !open; return <Pressable key={k} style={s.tab} onPress={() => { setOpen(null); setTab(k); }}><Text style={[s.tabIc, !on && { opacity: 0.45 }]}>{ic}</Text><Text style={[s.tabT, on && s.tabOn]}>{l}</Text>{on && <View style={s.tabDot} />}</Pressable>; })}
      </View>
    </View>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(true);
  const load = () => { setBusy(true); setErr(''); fn().then(setData).catch((e) => setErr(e.message)).finally(() => setBusy(false)); };
  useEffect(load, deps);
  return { data, err, busy, reload: load };
}

function Status({ err, busy, empty }: { err: string; busy: boolean; empty?: string | false }) {
  if (busy) return <ActivityIndicator style={{ margin: 16 }} />;
  if (err) return <Text style={s.err}>{err}</Text>;
  return empty ? <Text style={s.muted}>{empty}</Text> : null;
}

const STATUS_HE: Record<string, string> = { DRAFT: 'טיוטה', REGISTRATION_OPEN: 'הרשמה פתוחה', REGISTRATION_CLOSED: 'הרשמה סגורה', DRAWN: 'הוגרלה', IN_PROGRESS: 'מתקיימת', FINISHED: 'הסתיימה', CANCELLED: 'בוטלה' };

function TournamentList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, err, busy, reload } = useLoad(api.tournaments);
  return (
    <View style={s.pad}>
      <View style={s.hero}><Text style={s.heroT}>איגוד הטניס בישראל</Text><Text style={s.heroS}>תחרויות, לוחות משחקים ותוצאות חיות</Text></View>
      <Text style={s.h2}>תחרויות</Text>
      <Status err={err} busy={busy} empty={!!data && !data.length && 'אין עדיין תחרויות'} />
      <FlatList data={data ?? []} keyExtractor={(t) => t.id} onRefresh={reload} refreshing={false} renderItem={({ item }) => (
        <Pressable style={({ pressed }) => [s.card, pressed && s.pressed]} onPress={() => onOpen(item.id)}>
          <View style={[s.chip2, item.status === 'REGISTRATION_OPEN' ? s.chipOk : item.status === 'IN_PROGRESS' ? s.chipLive : null]}><Text style={s.chip2T}>{STATUS_HE[item.status] ?? item.status}</Text></View>
          <Text style={s.cardT}>{item.name}</Text>
        </Pressable>
      )} />
    </View>
  );
}

const fmtSets = (sets: { a: number; b: number }[]) => `\u2066${(sets ?? []).map((x) => `${x.a}-${x.b}`).join('  ')}\u2069`;

function FeedCard({ r }: { r: api.FeedRow }) {
  return (
    <View style={s.card}>
      {r.status === 'SCHEDULED' && (r.sets ?? []).length > 0 && <View style={[s.chip2, s.chipLive]}><Text style={s.chip2T}>● חי</Text></View>}
      <Text style={s.cardT}>{r.a} – {r.b}</Text>
      <Text style={s.muted}>{r.tournament} · {r.category}</Text>
      <Text>{r.status === 'SCHEDULED' && (r.sets ?? []).length ? `חי · ${fmtSets(r.sets)}` : r.status === 'SCHEDULED' ? `${r.court ? `מגרש ${r.court} · ` : ''}${r.start ? new Date(r.start).toLocaleString('he-IL', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}` : fmtSets(r.sets)}</Text>
    </View>
  );
}

function Live() {
  const { data, err, busy, reload } = useLoad(api.live);
  const rows = [...(data?.live ?? []).map((r) => ['l' + r.id, r] as const), ...(data?.upcoming ?? []).map((r) => ['u' + r.id, r] as const), ...(data?.results ?? []).map((r) => ['r' + r.id, r] as const)];
  return (
    <View style={s.pad}>
      <Text style={s.h1}>משחקים</Text>
      <Status err={err} busy={busy} empty={!!data && !rows.length && 'אין משחקים להצגה'} />
      <FlatList data={rows} keyExtractor={(x) => x[0]} onRefresh={reload} refreshing={false} renderItem={({ item }) => <FeedCard r={item[1]} />} />
    </View>
  );
}

function Rankings() {
  const [g, setG] = useState<'MALE' | 'FEMALE'>('MALE');
  const { data, err, busy } = useLoad(() => api.rankings(g), [g]);
  return (
    <View style={s.pad}>
      <Text style={s.h1}>דירוג</Text>
      <View style={s.row}>{([['MALE', 'בנים/גברים'], ['FEMALE', 'בנות/נשים']] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, g === k && s.chipOn]} onPress={() => setG(k)}><Text style={g === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}</View>
      <Status err={err} busy={busy} empty={!!data && !data.length && 'אין עדיין נתוני דירוג'} />
      <FlatList data={data ?? []} keyExtractor={(r) => r.playerId} renderItem={({ item }) => (
        <View style={[s.card, s.row]}><Text style={s.num}>{item.rank}</Text><Text style={[s.b, { flex: 1 }]}>{item.name}</Text><Text style={s.b}>{item.points}</Text></View>
      )} />
    </View>
  );
}

function Players() {
  const [q, setQ] = useState('');
  const { data, err, busy } = useLoad(() => api.players(q), [q]);
  return (
    <View style={s.pad}>
      <Text style={s.h1}>שחקנים</Text>
      <TextInput style={s.input} placeholder="🔍  חיפוש שחקן לפי שם" placeholderTextColor="#8FA1BA" value={q} onChangeText={setQ} />
      <Status err={err} busy={busy} empty={!!data && !data.length && 'לא נמצאו שחקנים'} />
      <FlatList data={data ?? []} keyExtractor={(p) => p.id} renderItem={({ item }) => <View style={s.card}><Text style={s.b}>{item.name}</Text><Text style={s.muted}>{item.club ?? ''}</Text></View>} />
    </View>
  );
}

function Tournament({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof api.tournament>> | null>(null);
  const [score, setScore] = useState<api.Match | null>(null);
  const load = () => api.tournament(id).then(setD);
  useEffect(() => { load(); }, [id]);
  if (score) return <Score m={score} onDone={() => { setScore(null); load(); }} />;
  return (
    <View style={s.pad}>
      <Pressable onPress={onBack}><Text>← חזרה</Text></Pressable>
      <Text style={s.h1}>{d?.tournament.name}</Text>
      <FlatList data={d?.matches ?? []} keyExtractor={(m) => m.id} renderItem={({ item: m }) => (
        <Pressable style={s.card} disabled={!m.a.id || !m.b.id || !api.canScore()} onPress={() => setScore(m)}>
          <Text style={s.b}>{m.a.name ?? 'טרם נקבע'} – {m.b.name ?? 'טרם נקבע'}</Text>
          <Text>{m.status === 'SCHEDULED' ? (m.court ? `מגרש ${m.court}` : 'טרם שובץ') : `הסתיים ${fmtSets(m.sets)}`}</Text>
        </Pressable>
      )} />
    </View>
  );
}

const DOCS: [string, string][] = [['ID_PHOTO', 'תמונת ת״ז'], ['MEDICAL_CERTIFICATE', 'אישור רפואי'], ['PARENT_CONSENT', 'אישור הורים']];

function MyArea({ onLogout }: { onLogout: () => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof api.me>> | null>(null);
  const [open, setOpen] = useState<Awaited<ReturnType<typeof api.openCategories>>>([]);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const load = () => { api.me().then(setD).catch((e) => setErr(e.message)); api.openCategories().then(setOpen).catch(() => {}); };
  useEffect(load, []);
  const upload = async (playerId: string, type: string) => {
    setErr(''); setMsg('');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    try { await api.uploadDocument(playerId, type, { uri: a.uri, name: a.fileName ?? 'doc.jpg', mime: a.mimeType ?? 'image/jpeg' }); setMsg('המסמך הועלה וממתין לאישור'); load(); } catch (e) { setErr((e as Error).message); }
  };
  const register = (cat: string, pid: string) => api.enter(cat, pid).then(() => { setMsg('נרשמתם לקטגוריה'); load(); }).catch((e) => setErr(e.message));
  const pay = (entryId: string) => api.checkout(entryId).then((r) => Linking.openURL(r.url)).catch((e) => setErr(e.message));
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={s.row}><Text style={s.h1}>האזור שלי</Text><Pressable onPress={onLogout}><Text style={s.b}>יציאה</Text></Pressable></View>
      {!!err && <Text style={s.err}>{err}</Text>}{!!msg && <Text style={s.ok}>{msg}</Text>}
      {api.canScore() && <View style={s.card}><Text style={s.cardT}>הזנת תוצאות</Text><Text style={s.muted}>היכנסו ללשונית תחרויות, בחרו תחרות ולחצו על משחק כדי להזין תוצאה או לעדכן תוצאה חיה.</Text></View>}
      {d?.players.map((p) => (
        <View key={p.id} style={s.card}>
          <Text style={s.b}>{p.name}</Text>
          <Text>{p.documents.ok ? 'כל המסמכים תקינים' : `חסר: ${p.documents.missing.map((m) => DOCS.find((x) => x[0] === m)?.[1] ?? m).join(', ')}`}</Text>
          {DOCS.map(([k, l]) => <Pressable key={k} style={s.link} onPress={() => upload(p.id, k)}><Text style={s.linkT}>העלאת {l}</Text></Pressable>)}
          {open.map((o) => <Pressable key={o.categoryId} style={s.link} onPress={() => register(o.categoryId, p.id)}><Text style={s.linkT}>הרשמה: {o.tournament} · {o.category}</Text></Pressable>)}
        </View>
      ))}
      <Text style={s.h2}>ההרשמות שלי</Text>
      {!!d && !d.entries.length && <Text style={s.muted}>אין עדיין הרשמות לתחרויות.</Text>}
      {d?.entries.map((e) => (
        <View key={e.id} style={s.card}><Text style={s.b}>{e.tournament} · {e.category}</Text><Text>{e.status} · {e.payment}</Text>
          {e.payment === 'UNPAID' && <Pressable style={s.link} onPress={() => pay(e.id)}><Text style={s.linkT}>לתשלום</Text></Pressable>}</View>
      ))}
      <Text style={s.h2}>התראות</Text>
      {!!d && !d.notifications.length && <Text style={s.muted}>אין התראות חדשות.</Text>}
      {d?.notifications.map((n) => <View key={n.id} style={s.card}><Text style={s.b}>{n.title}</Text><Text>{n.body}</Text></View>)}
    </ScrollView>
  );
}

/** Quick result entry: tap +/- per set; server validates the score and propagates the winner. */
function Score({ m, onDone }: { m: api.Match; onDone: () => void }) {
  const [g, setG] = useState<number[][]>(() => [0, 1, 2].map((i) => { const x = (m.sets ?? [])[i]; return x ? [x.a, x.b] : [0, 0]; })); const [err, setErr] = useState('');
  const bump = (i: number, k: 0 | 1, d: number) => setG((x) => x.map((r, j) => (j === i ? r.map((v, q) => (q === k ? Math.max(0, Math.min(i === 2 ? 30 : 7, v + d)) : v)) : r)));
  const save = () => api.sendResult(m.id, { status: 'COMPLETED', sets: g.map(([a, b], i) => ({ a: a as number, b: b as number, ...(i === 2 ? { superTb: true } : {}) })).filter((x) => x.a || x.b) }).then(onDone).catch((e) => setErr(e.message));
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Pressable onPress={onDone}><Text>ביטול ←</Text></Pressable>
      <Text style={s.h1}>הזנת תוצאה</Text>
      {!!err && <Text style={s.err}>{err}</Text>}
      {g.map((set, i) => (
        <View key={i} style={s.card}>
          <Text>{i === 2 ? 'סופר-טייברייק' : `סט ${i + 1}`}</Text>
          {([m.a.name, m.b.name] as const).map((name, k) => (
            <View key={k} style={s.row}><Text style={[s.b, { flex: 1 }]}>{name}</Text>
              <Pressable style={s.stp} onPress={() => bump(i, k as 0 | 1, -1)}><Text style={s.stpT}>−</Text></Pressable>
              <Text style={s.num}>{set[k]}</Text>
              <Pressable style={s.stp} onPress={() => bump(i, k as 0 | 1, 1)}><Text style={s.stpT}>+</Text></Pressable>
            </View>
          ))}
        </View>
      ))}
      {!!err && <Text style={s.err}>{err}</Text>}
      <Pressable style={s.btn} onPress={save}><Text style={s.btnT}>שמירה</Text></Pressable>
      <Pressable style={[s.btn, { backgroundColor: '#fff', borderWidth: 1, borderColor: C.blue }]} onPress={() => api.sendLive(m.id, g.map(([a, b], i) => ({ a: a as number, b: b as number, ...(i === 2 ? { superTb: true } : {}) })).filter((x) => x.a || x.b)).then(onDone).catch((e) => setErr(e.message))}><Text style={[s.btnT, { color: C.blue }]}>עדכון תוצאה חיה · המשחק נמשך</Text></Pressable>
      <Text style={s.b}>ווק-אובר: מי לא הגיע</Text>
      {([m.a, m.b] as const).map((p, k) => p.id && (
        <View key={k} style={s.card}>
          <Text style={s.b}>{p.name}</Text>
          {([['NO_NOTICE', 'לא הגיע, ללא הודעה'], ['NOTICE', 'הודיע מראש'], ['NOTICE_MEDICAL', 'הודיע + אישור רפואי']] as const).map(([reason, label]) => (
            <Pressable key={reason} style={s.link} onPress={() => api.sendResult(m.id, { status: 'WALKOVER', absentEntryId: p.id, reason }).then(onDone).catch((e) => setErr(e.message))}><Text style={s.linkT}>{label}</Text></Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 16, gap: 10, paddingBottom: 48 },
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 0 }, pad: { padding: 16, gap: 10, flex: 1 },
  h1: { fontSize: 28, fontWeight: '800', color: C.navy, letterSpacing: -0.3 }, h2: { fontSize: 19, fontWeight: '700', color: C.navy, marginTop: 4 },
  hero: { backgroundColor: C.blue, borderRadius: 22, padding: 22, gap: 4, shadowColor: '#0B2545', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  heroT: { color: '#fff', fontSize: 26, fontWeight: '800' }, heroS: { color: '#CFE0F7', fontSize: 15 },
  cardT: { fontSize: 17, fontWeight: '700', color: C.navy }, pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
  chip2: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, backgroundColor: '#EEF2F8' }, chip2T: { fontSize: 12, fontWeight: '800', color: C.blue },
  chipOk: { backgroundColor: '#E2F6EA' }, chipLive: { backgroundColor: C.lime },
  tabIc: { fontSize: 20 }, tabDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.blue, marginTop: 1 }, b: { fontWeight: '700', color: C.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16, marginBottom: 10, gap: 8, shadowColor: '#0B2545', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#BCC8D6', borderRadius: 10, padding: 12, minHeight: 48, textAlign: 'right' },
  btn: { backgroundColor: C.blue, borderRadius: 14, minHeight: 54, alignItems: 'center', justifyContent: 'center' }, btnT: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ok: { backgroundColor: '#E3F4EA', color: '#14663C', padding: 10, borderRadius: 10 },
  link: { minHeight: 44, justifyContent: 'center' }, linkT: { color: C.blue, fontWeight: '700' },
  err: { backgroundColor: '#FBE4E4', color: '#9B1C1C', padding: 10, borderRadius: 10 },
  stp: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#BCC8D6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, stpT: { fontSize: 24, fontWeight: '700' },
  muted: { color: '#55657A' },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: '#fff' }, tab: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 1 },
  tabT: { color: '#55657A', fontWeight: '600', fontSize: 13 }, tabOn: { color: C.blue, fontWeight: '800' },
  chip: { paddingHorizontal: 14, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: '#BCC8D6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, chipOn: { backgroundColor: C.blue, borderColor: C.blue }, chipOnT: { color: '#fff', fontWeight: '700' },
  num: { width: 32, textAlign: 'center', fontSize: 28, fontWeight: '800' },
});
