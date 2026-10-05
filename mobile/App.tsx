import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, I18nManager, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Notifications from 'expo-notifications';
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
  if (open) return <Tournament id={open} onBack={() => setOpen(null)} />;
  return (
    <View style={s.pad}>
      <View style={s.row}><Text style={s.h1}>תחרויות</Text><Pressable onPress={onLogout}><Text>יציאה</Text></Pressable></View>
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
  err: { backgroundColor: '#FBE4E4', color: '#9B1C1C', padding: 10, borderRadius: 10 },
  stp: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#BCC8D6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }, stpT: { fontSize: 24, fontWeight: '700' },
  num: { width: 32, textAlign: 'center', fontSize: 28, fontWeight: '800' },
});
