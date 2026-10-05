import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, I18nManager, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
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

const C = { navy: '#0B2545', blue: '#14427A', bg: '#F3F5F7', line: '#DDE3EA' };

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => { api.loadToken().then((t) => { setAuthed(!!t); setReady(true); }); }, []);
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />;
  return <SafeAreaView style={s.screen}>{authed ? <Home onLogout={() => api.logout().then(() => setAuthed(false))} /> : <Login onDone={() => setAuthed(true)} />}</SafeAreaView>;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState('');
  return (
    <View style={s.pad}>
      <Text style={s.h1}>כניסה</Text>
      {!!err && <Text style={s.err}>{err}</Text>}
      <TextInput style={s.input} placeholder="אימייל" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} placeholder="סיסמה" secureTextEntry value={pw} onChangeText={setPw} />
      <Pressable style={s.btn} onPress={() => api.login(email, pw).then(onDone).catch((e) => setErr(e.message === 'invalid' ? 'אימייל או סיסמה שגויים' : e.message === 'locked' ? 'החשבון ננעל זמנית' : e.message))}><Text style={s.btnT}>כניסה</Text></Pressable>
    </View>
  );
}

function Home({ onLogout }: { onLogout: () => void }) {
  const [list, setList] = useState<{ id: string; name: string; status: string }[]>([]);
  const [inbox, setInbox] = useState<{ id: string; title: string; body: string }[]>([]);
  useEffect(() => { registerPush(); api.me().then((m) => setInbox(m.notifications.slice(0, 3))).catch(() => {}); }, []);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.tournaments().then(setList).catch(() => {}); }, []);
  const [tab, setTab] = useState<'t' | 'me'>('t');
  if (open) return <Tournament id={open} onBack={() => setOpen(null)} />;
  if (tab === 'me') return <MyArea onBack={() => setTab('t')} />;
  return (
    <View style={s.pad}>
      <View style={s.row}><Text style={s.h1}>תחרויות</Text><Pressable onPress={() => setTab('me')}><Text style={s.b}>האזור שלי</Text></Pressable><Pressable onPress={onLogout}><Text>יציאה</Text></Pressable></View>
      {inbox.map((n) => <View key={n.id} style={s.card}><Text style={s.b}>{n.title}</Text><Text>{n.body}</Text></View>)}
      <FlatList data={list} keyExtractor={(t) => t.id} renderItem={({ item }) => (
        <Pressable style={s.card} onPress={() => setOpen(item.id)}><Text style={s.b}>{item.name}</Text><Text>{item.status}</Text></Pressable>
      )} />
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
        <Pressable style={s.card} disabled={!m.a.id || !m.b.id} onPress={() => setScore(m)}>
          <Text style={s.b}>{m.a.name ?? 'טרם נקבע'} – {m.b.name ?? 'טרם נקבע'}</Text>
          <Text>{m.status === 'SCHEDULED' ? (m.court ? `מגרש ${m.court}` : 'טרם שובץ') : 'הסתיים'}</Text>
        </Pressable>
      )} />
    </View>
  );
}

const DOCS: [string, string][] = [['ID_PHOTO', 'תמונת ת״ז'], ['MEDICAL_CERTIFICATE', 'אישור רפואי'], ['PARENT_CONSENT', 'אישור הורים']];

function MyArea({ onBack }: { onBack: () => void }) {
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
    <ScrollView contentContainerStyle={s.pad}>
      <Pressable onPress={onBack}><Text>← חזרה</Text></Pressable>
      <Text style={s.h1}>האזור שלי</Text>
      {!!err && <Text style={s.err}>{err}</Text>}{!!msg && <Text style={s.ok}>{msg}</Text>}
      {d?.players.map((p) => (
        <View key={p.id} style={s.card}>
          <Text style={s.b}>{p.name}</Text>
          <Text>{p.documents.ok ? 'כל המסמכים תקינים' : `חסר: ${p.documents.missing.map((m) => DOCS.find((x) => x[0] === m)?.[1] ?? m).join(', ')}`}</Text>
          {DOCS.map(([k, l]) => <Pressable key={k} style={s.link} onPress={() => upload(p.id, k)}><Text style={s.linkT}>העלאת {l}</Text></Pressable>)}
          {open.map((o) => <Pressable key={o.categoryId} style={s.link} onPress={() => register(o.categoryId, p.id)}><Text style={s.linkT}>הרשמה: {o.tournament} · {o.category}</Text></Pressable>)}
        </View>
      ))}
      <Text style={s.h1}>ההרשמות שלי</Text>
      {d?.entries.map((e) => (
        <View key={e.id} style={s.card}><Text style={s.b}>{e.tournament} · {e.category}</Text><Text>{e.status} · {e.payment}</Text>
          {e.payment === 'UNPAID' && <Pressable style={s.link} onPress={() => pay(e.id)}><Text style={s.linkT}>לתשלום</Text></Pressable>}</View>
      ))}
      <Text style={s.h1}>התראות</Text>
      {d?.notifications.map((n) => <View key={n.id} style={s.card}><Text style={s.b}>{n.title}</Text><Text>{n.body}</Text></View>)}
    </ScrollView>
  );
}

/** Quick result entry: tap +/- per set; server validates the score and propagates the winner. */
function Score({ m, onDone }: { m: api.Match; onDone: () => void }) {
  const [g, setG] = useState([[0, 0], [0, 0], [0, 0]]); const [err, setErr] = useState('');
  const bump = (i: number, k: 0 | 1, d: number) => setG((x) => x.map((r, j) => (j === i ? r.map((v, q) => (q === k ? Math.max(0, Math.min(i === 2 ? 30 : 7, v + d)) : v)) : r)));
  const save = () => api.sendResult(m.id, { status: 'COMPLETED', sets: g.map(([a, b], i) => ({ a: a as number, b: b as number, ...(i === 2 ? { superTb: true } : {}) })).filter((x) => x.a || x.b) }).then(onDone).catch((e) => setErr(e.message));
  return (
    <View style={s.pad}>
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
      <Pressable style={s.btn} onPress={save}><Text style={s.btnT}>שמירה</Text></Pressable>
      <Text style={s.b}>ללא משחק (וואלה) — מי לא הגיע?</Text>
      {([m.a, m.b] as const).map((p, k) => p.id && (
        <View key={k} style={s.card}>
          <Text style={s.b}>{p.name}</Text>
          {([['NO_NOTICE', 'לא הגיע, ללא הודעה'], ['NOTICE', 'הודיע מראש'], ['NOTICE_MEDICAL', 'הודיע + אישור רפואי']] as const).map(([reason, label]) => (
            <Pressable key={reason} style={s.link} onPress={() => api.sendResult(m.id, { status: 'WALKOVER', absentEntryId: p.id, reason }).then(onDone).catch((e) => setErr(e.message))}><Text style={s.linkT}>{label}</Text></Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg }, pad: { padding: 16, gap: 10, flex: 1 },
  h1: { fontSize: 24, fontWeight: '800', color: C.navy }, b: { fontWeight: '700', color: C.navy },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, marginBottom: 8, gap: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#BCC8D6', borderRadius: 10, padding: 12, minHeight: 48, textAlign: 'right' },
  btn: { backgroundColor: C.blue, borderRadius: 12, minHeight: 52, alignItems: 'center', justifyContent: 'center' }, btnT: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ok: { backgroundColor: '#E3F4EA', color: '#14663C', padding: 10, borderRadius: 10 },
  link: { minHeight: 44, justifyContent: 'center' }, linkT: { color: C.blue, fontWeight: '700' },
  err: { backgroundColor: '#FBE4E4', color: '#9B1C1C', padding: 10, borderRadius: 10 },
  stp: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#BCC8D6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, stpT: { fontSize: 24, fontWeight: '700' },
  num: { width: 32, textAlign: 'center', fontSize: 28, fontWeight: '800' },
});
