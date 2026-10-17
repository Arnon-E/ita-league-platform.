import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, ScrollView, I18nManager, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { Platform } from 'react-native';
import * as api from './src/api';
import { More } from './src/More';
import { MyHome } from './src/MyHome';
import { T, Icon, BallMark, CourtLines } from './src/theme';

async function registerPush() {
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.registerDevice(t.data, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch { /* push is optional: the in-app inbox still works */ }
}

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);


type Tab = 't' | 'live' | 'rank' | 'players' | 'more' | 'me';
const TABS: [Tab, string, 'home' | 'live' | 'rank' | 'players' | 'more' | 'me'][] = [['t', 'בית', 'home'], ['live', 'משחקים', 'live'], ['rank', 'דירוג', 'rank'], ['players', 'שחקנים', 'players'], ['more', 'עוד', 'more'], ['me', 'חשבון', 'me']];

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => { api.loadToken().then((t) => { setAuthed(!!t); setReady(true); }); }, []);
  if (!ready) return <ActivityIndicator color={T.blue} style={{ flex: 1, backgroundColor: T.bg }} />;
  return <SafeAreaView style={s.screen}><StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} /><Home authed={authed} setAuthed={setAuthed} /></SafeAreaView>;
}

function Login({ onDone }: { onDone: (signedUp: boolean) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [remember, setRemember] = useState(true); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const fail = (e: Error) => { setBusy(false); setErr(e.message === 'invalid' ? 'אימייל או סיסמה שגויים' : e.message === 'locked' ? 'החשבון ננעל זמנית' : e.message); };
  const submit = () => {
    if (!email.trim() || !pw || (mode === 'signup' && !name.trim())) { setErr('יש למלא את כל השדות החובה'); return; }
    setErr(''); setBusy(true);
    (mode === 'login' ? api.login(email.trim(), pw, remember) : api.register(name.trim(), email.trim(), phone.trim(), pw, remember)).then(() => { setBusy(false); onDone(mode === 'signup'); }).catch(fail);
  };
  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>{mode === 'login' ? 'כניסה' : 'הרשמה'}</Text>
      {mode === 'signup' && <Text style={s.muted}>יצירת חשבון אחד לשחקנים, להורים ולאוהדים. בשלב הבא תבחרו מי משחק.</Text>}
      {!!err && <Text style={s.err}>{err}</Text>}
      {mode === 'signup' && <TextInput style={s.input} placeholder="שם מלא" placeholderTextColor={T.muted} value={name} onChangeText={setName} />}
      <TextInput style={s.input} placeholder={mode === 'login' ? 'אימייל או שם משתמש' : 'אימייל'} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} keyboardType={mode === 'login' ? 'default' : 'email-address'} value={email} onChangeText={setEmail} />
      {mode === 'signup' && <TextInput style={s.input} placeholder="טלפון (לא חובה)" placeholderTextColor={T.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />}
      <TextInput style={s.input} placeholder={mode === 'signup' ? 'סיסמה (10 תווים, אותיות וספרות)' : 'סיסמה'} placeholderTextColor={T.muted} secureTextEntry value={pw} onChangeText={setPw} />
      <Pressable style={[s.chip, { alignSelf: 'flex-start' }, remember && s.chipOn]} onPress={() => setRemember(!remember)}><Text style={remember ? s.chipOnT : s.b}>{remember ? '✓ ' : ''}השאר אותי מחובר</Text></Pressable>
      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}><Text style={s.btnT}>{mode === 'login' ? 'כניסה' : 'יצירת חשבון'}</Text></Pressable>
      <Pressable style={s.link} onPress={() => { setErr(''); setMode(mode === 'login' ? 'signup' : 'login'); }}><Text style={s.linkT}>{mode === 'login' ? 'אין חשבון? הרשמה' : 'כבר רשומים? כניסה'}</Text></Pressable>
    </ScrollView>
  );
}

function Welcome({ onPick, onSkip }: { onPick: (w: 'self' | 'child' | 'follow') => void; onSkip: () => void }) {
  const opts: ['self' | 'child' | 'follow', string, string][] = [
    ['self', 'אני משחק/ת', 'פרופיל שחקן על שמי: דירוג, משחקים והרשמה לתחרויות'],
    ['child', 'הילד/ה שלי משחק/ת', 'פרופיל לילד/ה, אפשר להוסיף כמה שרוצים. אני מנהל/ת את ההרשמות והמסמכים'],
    ['follow', 'אני רק עוקב/ת', 'לעקוב אחרי שחקנים ותחרויות ולקבל התראות, בלי פרופיל'],
  ];
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.h1}>ברוכים הבאים</Text>
      <Text style={s.muted}>מי משחק? כך נתאים לכם את מסך הבית.</Text>
      {opts.map(([k, t, sub]) => <Pressable key={k} style={({ pressed }) => [s.card, pressed && s.pressed]} onPress={() => onPick(k)}><Text style={s.cardT}>{t}</Text><Text style={s.muted}>{sub}</Text></Pressable>)}
      <Pressable style={s.link} onPress={onSkip}><Text style={s.linkT}>דילוג, אחליט אחר כך</Text></Pressable>
    </ScrollView>
  );
}

function Home({ authed, setAuthed }: { authed: boolean; setAuthed: (v: boolean) => void }) {
  const [tab, setTab] = useState<Tab>('t');
  const [open, setOpen] = useState<string | null>(null);
  const [who, setWho] = useState<'ask' | 'self' | 'child' | null>(null);
  const [, bump] = useState(0);
  // sessions started before the name was stored: fetch it once so the header can show who is signed in
  useEffect(() => { if (authed && !api.currentUserName()) api.me().then((m) => api.rememberUserName(m.name)).then(() => bump((n) => n + 1)).catch(() => {}); }, [authed]);
  useEffect(() => { if (authed) registerPush(); }, [authed]);
  useEffect(() => { api.setAuthLostHandler(() => setAuthed(false)); return () => api.setAuthLostHandler(null); }, [setAuthed]);
  return (
    <View style={{ flex: 1 }}>
      {authed && !!api.currentUserName() && (
        <Pressable style={s.who} onPress={() => { setOpen(null); setWho(null); setTab('me'); }} accessibilityLabel="פרטים אישיים">
          <View style={s.whoAv}><Text style={s.whoAvT}>{api.currentUserName()!.trim().charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}><Text style={s.b} numberOfLines={1}>{api.currentUserName()}</Text><Text style={s.muted}>פרטים אישיים והמעקב שלי</Text></View>
          <Icon name="back" size={18} color={T.muted} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        {open ? <Tournament id={open} onBack={() => setOpen(null)} onGoAccount={() => { setOpen(null); setTab('me'); }} />
          : tab === 't' ? <TournamentList onOpen={setOpen} authed={authed} onGoAccount={() => setTab('me')} />
          : tab === 'live' ? <Live />
          : tab === 'rank' ? <Rankings />
          : tab === 'players' ? <Players />
          : tab === 'more' ? <More />
          : authed ? (who === 'ask' ? <Welcome onPick={(w) => { if (w === 'follow') { setWho(null); setTab('rank'); } else setWho(w); }} onSkip={() => { setWho(null); setTab('t'); }} /> : <MyArea onOpenTournament={(id) => setOpen(id)} preset={who} onLogoutAll={() => { setWho(null); setAuthed(false); }} onLogout={() => api.logout().then(() => { setWho(null); setAuthed(false); })} />) : <Login onDone={(signedUp) => { setAuthed(true); if (signedUp) setWho('ask'); }} />}
      </View>
      <View style={s.tabbar}>
        {TABS.map(([k, l, ic]) => { const on = tab === k && !open; return <Pressable key={k} style={[s.tab, on && s.tabActive]} onPress={() => { setOpen(null); setTab(k); }}><Icon name={ic} size={21} color={on ? T.btnText : T.muted} /><Text style={[s.tabT, on && s.tabOn]}>{l}</Text></Pressable>; })}
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
  if (busy) return <ActivityIndicator color={T.blue} style={{ margin: 16 }} />;
  if (err) return <Text style={s.err}>{err}</Text>;
  return empty ? <Text style={s.muted}>{empty}</Text> : null;
}

const STATUS_HE: Record<string, string> = { DRAFT: 'טיוטה', REGISTRATION_OPEN: 'הרשמה פתוחה', REGISTRATION_CLOSED: 'הרשמה סגורה', DRAWN: 'הוגרלה', IN_PROGRESS: 'מתקיימת', FINISHED: 'הסתיימה', CANCELLED: 'בוטלה' };

function TournamentList({ onOpen, authed, onGoAccount }: { onOpen: (id: string) => void; authed: boolean; onGoAccount: () => void }) {
  const { data, err, busy, reload } = useLoad(api.tournaments);
  const [level, setLevel] = useState('');
  const [sec, setSec] = useState('');
  const [st, setSt] = useState('up');
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const isDone = (x: { status: string; endDate: string }) => x.status === 'FINISHED' || x.status === 'CANCELLED' || +new Date(x.endDate) < Date.now();
  // open registration, then running, then upcoming soonest first, then finished latest first
  const rank = (x: { status: string; endDate: string }) => (x.status === 'REGISTRATION_OPEN' ? 0 : x.status === 'IN_PROGRESS' ? 1 : isDone(x) ? 3 : 2);
  const dm = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  const shown = [...(data ?? [])]
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 3 ? +new Date(b.startDate) - +new Date(a.startDate) : +new Date(a.startDate) - +new Date(b.startDate)))
    .filter((x) => (!q.trim() || x.name.includes(q.trim())) && (!level || x.level === level) && (!sec || x.section === sec)
      && (st === 'all' || (st === 'up' ? !isDone(x) : st === 'open' ? x.status === 'REGISTRATION_OPEN' : st === 'live' ? x.status === 'IN_PROGRESS' : isDone(x))));
  return (
      <FlatList style={s.pad} contentContainerStyle={{ paddingBottom: 100, gap: 10 }} ListHeaderComponent={<View style={{ gap: 10 }}>
      <View style={s.hero}><CourtLines /><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><BallMark size={26} /><Text style={s.heroBrand}>ITA</Text></View><Text style={s.heroT}>איגוד הטניס בישראל</Text><Text style={s.heroS}>תחרויות, לוחות משחקים ותוצאות חיות</Text></View>
      <MyHome authed={authed} onOpen={onOpen} onGoAccount={onGoAccount} />
      <Text style={s.h2}>תחרויות</Text>
      <TextInput style={s.input} placeholder="חיפוש לפי שם תחרות" placeholderTextColor={T.muted} value={q} onChangeText={setQ} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
        {([['up', 'קרובות'], ['open', 'הרשמה פתוחה'], ['live', 'מתקיימת'], ['done', 'הסתיימה'], ['all', 'הכול']] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, st === k && s.chipOn]} onPress={() => setSt(k)}><Text style={st === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
        <Pressable style={[s.chip, (more || !!level || !!sec) && s.chipOn]} onPress={() => setMore(!more)}><Text style={(more || !!level || !!sec) ? s.chipOnT : s.b}>{level || sec ? 'סינון ·' : 'סינון'}</Text></Pressable>
      </ScrollView>
      {more && <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
          {([['', 'כל הסוגים'], ['NATIONAL', 'ארצית'], ['REGIONAL', 'אזורית'], ['INTERNATIONAL', 'בינלאומית'], ['CIRCUIT', 'סבב']] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, level === k && s.chipOn]} onPress={() => setLevel(k)}><Text style={level === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0, marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
          {([['', 'כל הקטגוריות'], ['YOUTH', 'נוער'], ['ADULTS', 'בוגרים'], ['MASTERS', 'מאסטרס'], ['OTHER', 'אחר']] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, sec === k && s.chipOn]} onPress={() => setSec(k)}><Text style={sec === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
        </ScrollView>
      </>}
      <Status err={err} busy={busy} empty={!!data && !shown.length && 'אין תחרויות לפי הסינון'} />
      </View>} data={shown} keyExtractor={(t) => t.id} onRefresh={reload} refreshing={false} renderItem={({ item }) => (
        <Pressable style={({ pressed }) => [s.card, pressed && s.pressed]} onPress={() => onOpen(item.id)}>
          <View style={[s.chip2, item.status === 'REGISTRATION_OPEN' ? s.chipOk : item.status === 'IN_PROGRESS' ? s.chipLive : null]}><Text style={s.chip2T}>{STATUS_HE[item.status] ?? item.status}</Text></View>
          <Text style={s.cardT}>{item.name}</Text>
          <Text style={s.muted}>{`${dm(item.startDate)} – ${dm(item.endDate)}`}{item.status === 'REGISTRATION_OPEN' && item.registrationCloses ? ` · הרשמה עד ${dm(item.registrationCloses)}` : ''}</Text>
        </Pressable>
      )} />
  );
}

const fmtSets = (sets: { a: number; b: number }[]) => `\u2066${(sets ?? []).map((x) => `${x.a}-${x.b}`).join('  ')}\u2069`;

function FeedCard({ r }: { r: api.FeedRow }) {
  return (
    <View style={s.card}>
      {r.status === 'SCHEDULED' && (r.sets ?? []).length > 0 && <View style={[s.chip2, s.chipLive]}><Text style={s.chip2T}>● חי</Text></View>}
      {r.status === 'SCHEDULED' && !(r.sets ?? []).length ? <>
        <Text style={s.cardT}>{r.a} – {r.b}</Text>
        <Text>{`${r.court ? `מגרש ${r.court} · ` : ''}${r.start ? new Date(r.start).toLocaleString('he-IL', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`}</Text>
      </> : <View style={{ gap: 2 }}>
        {(['a', 'b'] as const).map((side) => {
          const won = r.winner === side;
          return (
            <View key={side} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ width: 18, color: T.ok, fontWeight: '800' }}>{won ? '✓' : ''}</Text>
              <Text style={[s.b, { flex: 1 }, won && { fontWeight: '800' }, !won && r.winner && { opacity: 0.6 }]}>{side === 'a' ? r.a : r.b}</Text>
              {(r.sets ?? []).map((x, i) => { const mine = side === 'a' ? x.a : x.b; const other = side === 'a' ? x.b : x.a; return <Text key={i} style={[{ width: 26, textAlign: 'center' }, mine > other && { fontWeight: '800' }]}>{mine}</Text>; })}
            </View>
          );
        })}
        {r.status === 'WALKOVER' && <Text style={s.muted}>ווק-אובר</Text>}
        {r.status === 'RETIRED' && <Text style={s.muted}>פרישה</Text>}
      </View>}
      <Text style={s.muted}>{r.tournament} · {r.category}</Text>
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
      <FlatList contentContainerStyle={{ paddingBottom: 100 }} data={rows} keyExtractor={(x) => x[0]} onRefresh={reload} refreshing={false} renderItem={({ item }) => <FeedCard r={item[1]} />} />
    </View>
  );
}

function Rankings() {
  const [g, setG] = useState<'MALE' | 'FEMALE'>('MALE');
  const [age, setAge] = useState<number | undefined>(undefined);
  const { data, err, busy } = useLoad(() => api.rankings(g, age), [g, age]);
  return (
    <View style={s.pad}>
      <Text style={s.h1}>דירוג</Text>
      <View style={s.row}>{([['MALE', 'בנים/גברים'], ['FEMALE', 'בנות/נשים']] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, g === k && s.chipOn]} onPress={() => setG(k)}><Text style={g === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
        {([[undefined, 'כללי'], [12, 'עד 12'], [14, 'עד 14'], [16, 'עד 16'], [18, 'עד 18']] as const).map(([a, l]) => <Pressable key={l} style={[s.chip, age === a && s.chipOn]} onPress={() => setAge(a)}><Text style={age === a ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
      </ScrollView>
      <Status err={err} busy={busy} empty={!!data && !data.length && 'אין עדיין נתוני דירוג'} />
      <FlatList contentContainerStyle={{ paddingBottom: 100 }} data={data ?? []} keyExtractor={(r) => r.playerId} renderItem={({ item }) => (
        <View style={[s.card, s.row]}><Text style={s.num}>{item.rank}</Text><Text style={[s.b, { flex: 1 }]}>{item.name}</Text><Text style={s.b}>{item.points}</Text></View>
      )} />
    </View>
  );
}

function Players() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<{ id: string; name: string; club: string | null; birthYear?: number }[]>([]);
  const [busy, setBusy] = useState(true); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  const PAGE = 50;
  useEffect(() => {
    let live = true;
    setBusy(true); setErr(''); setDone(false);
    api.players(q, 0, PAGE).then((r) => { if (live) { setRows(r); setDone(r.length < PAGE); } }).catch((e) => live && setErr(e.message)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [q]);
  const more = () => {
    if (busy || done) return;
    setBusy(true);
    api.players(q, rows.length, PAGE).then((r) => { setRows((x) => [...x, ...r]); setDone(r.length < PAGE); }).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  const data = rows;
  return (
    <View style={s.pad}>
      <Text style={s.h1}>שחקנים</Text>
      <TextInput style={s.input} placeholder="חיפוש שחקן לפי שם" placeholderTextColor={T.muted} value={q} onChangeText={setQ} />
      <Status err={err} busy={busy} empty={!!data && !data.length && 'לא נמצאו שחקנים'} />
      <FlatList contentContainerStyle={{ paddingBottom: 100 }} data={data} keyExtractor={(p) => p.id} onEndReached={more} onEndReachedThreshold={0.6} renderItem={({ item }) => <View style={s.card}><Text style={s.b}>{item.name}</Text><Text style={s.muted}>{item.club ?? ''}{item.birthYear ? ` · ${item.birthYear}` : ''}</Text></View>} />
    </View>
  );
}

function Tournament({ id, onBack, onGoAccount }: { id: string; onBack: () => void; onGoAccount: () => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof api.tournament>> | null>(null);
  const [score, setScore] = useState<api.Match | null>(null);
  const load = () => api.tournament(id).then(setD);
  const [photos, setPhotos] = useState<{ id: string; caption: string | null }[]>([]);
  const [following, setFollowing] = useState(false); const [fErr, setFErr] = useState('');
  const [fg, setFg] = useState(''); const [fage, setFage] = useState(''); const [fcat, setFcat] = useState('');
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    api.gallery(id).then(setPhotos).catch(() => {});
    if (api.isAuthed()) api.follows().then((f) => setFollowing(f.some((x) => x.kind === 'TOURNAMENT' && x.target === id))).catch(() => {});
  }, [id]);
  const toggle = () => {
    if (!api.isAuthed()) { setFErr('כדי לעקוב אחרי תחרות יש להתחבר בלשונית חשבון.'); return; }
    setFErr(''); api.toggleFollow('TOURNAMENT', id).then((r) => setFollowing(r.following)).catch((e) => setFErr(e.message));
  };
  if (score) return <Score m={score} onDone={() => { setScore(null); load(); }} />;
  return (
    <View style={s.pad}>
      <Pressable onPress={onBack}><Text style={s.b}>→ חזרה</Text></Pressable>
      <Text style={s.h1}>{d?.tournament.name}</Text>
      <Pressable style={[s.chip, following && s.chipOn, { alignSelf: 'flex-start' }]} onPress={toggle}><Text style={following ? s.chipOnT : s.b}>{following ? '★ במעקב' : '☆ מעקב'}</Text></Pressable>
      {!!fErr && <Text style={s.err}>{fErr}</Text>}
      {photos.length > 0 && (
        <FlatList horizontal data={photos} keyExtractor={(p) => p.id} style={{ flexGrow: 0, flexShrink: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}
          renderItem={({ item }) => <View><Image source={{ uri: api.photoUrl(item.id) }} style={s.photo} />{!!item.caption && <Text style={s.muted}>{item.caption}</Text>}</View>} />
      )}
      {d && d.tournament.status === 'REGISTRATION_OPEN' && (d.tournament.registerUrl
        ? <View style={s.card}>
            <Text style={s.cardT}>הרשמה לתחרות</Text>
            <Text style={s.muted}>{`ההרשמה מתבצעת באתר Loglig ונפתחת בדפדפן.${d.tournament.registrationCloses ? ` נסגרת ב-${new Date(d.tournament.registrationCloses).toLocaleDateString('he-IL')}.` : ''}`}</Text>
            <Pressable style={s.btn} onPress={() => Linking.openURL(d.tournament.registerUrl!)}><Text style={s.btnT}>להרשמה</Text></Pressable>
          </View>
        : <RegisterBox tournamentName={d.tournament.name} categories={d.categories} onGoAccount={onGoAccount} />)}
      {d && !d.matches.length && <Text style={s.muted}>לוח המשחקים והתוצאות יופיעו כאן אחרי ההגרלה.</Text>}
      {(d?.categories.length ?? 0) > 1 && (() => {
        const cats = d!.categories;
        const ageOf = (n: string) => (n.match(/(\d{2})/) ?? [])[1] ?? '';
        const ages = [...new Set(cats.map((c) => ageOf(c.name)).filter(Boolean))].sort();
        const chip = (on: boolean, label: string, press: () => void, key: string) => (
          <Pressable key={key} style={[s.chip, on && s.chipOn]} onPress={press}><Text style={on ? s.chipOnT : s.b}>{label}</Text></Pressable>
        );
        const shownCats = cats.filter((c) => (!fg || c.gender === fg) && (!fage || ageOf(c.name) === fage));
        return (
          <View style={{ gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
              {chip(!fg, 'בנים ובנות', () => { setFg(''); setFcat(''); }, 'g0')}
              {chip(fg === 'MALE', 'בנים', () => { setFg('MALE'); setFcat(''); }, 'g1')}
              {chip(fg === 'FEMALE', 'בנות', () => { setFg('FEMALE'); setFcat(''); }, 'g2')}
              {chip(!fage, 'כל הגילאים', () => { setFage(''); setFcat(''); }, 'a0')}
              {ages.map((a) => chip(fage === a, `גיל ${a}`, () => { setFage(a); setFcat(''); }, 'a' + a))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8 }}>
              {chip(!fcat, 'כל הקטגוריות', () => setFcat(''), 'c0')}
              {shownCats.map((c) => chip(fcat === c.id, c.name, () => setFcat(c.id), c.id))}
            </ScrollView>
          </View>
        );
      })()}
      <FlatList contentContainerStyle={{ paddingBottom: 100 }}
        data={(d?.matches ?? []).filter((m) => {
          if (fcat) return m.categoryId === fcat;
          if (!fg && !fage) return true;
          const c = d?.categories.find((x) => x.id === m.categoryId);
          return !!c && (!fg || c.gender === fg) && (!fage || ((c.name.match(/(\d{2})/) ?? [])[1] ?? '') === fage);
        })}
        keyExtractor={(m) => m.id} initialNumToRender={12}
        renderItem={({ item: m }) => {
          const done = m.status !== 'SCHEDULED' && m.status !== 'VOID';
          const win = m.winnerEntryId ? (m.winnerEntryId === m.a.id ? 'a' : m.winnerEntryId === m.b.id ? 'b' : null) : null;
          const row = (side: 'a' | 'b') => {
            const won = done && win === side;
            return (
              <View key={side} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ width: 18, color: T.ok, fontWeight: '800' }}>{won ? '✓' : ''}</Text>
                <Text style={[s.b, { flex: 1 }, won && { fontWeight: '800' }, done && win && !won && { opacity: 0.6 }]}>{(side === 'a' ? m.a.name : m.b.name) ?? 'טרם נקבע'}</Text>
                {done && (m.sets ?? []).map((x, i) => { const mine = side === 'a' ? x.a : x.b; const other = side === 'a' ? x.b : x.a; return <Text key={i} style={[{ width: 26, textAlign: 'center' }, mine > other && { fontWeight: '800' }]}>{mine}</Text>; })}
              </View>
            );
          };
          return (
            <Pressable style={s.card} disabled={!m.a.id || !m.b.id || !api.canScore()} onPress={() => setScore(m)}>
              {row('a')}{row('b')}
              <Text style={s.muted}>{m.status === 'SCHEDULED' ? (m.court ? `מגרש ${m.court}` : 'טרם שובץ') : m.status === 'WALKOVER' ? 'ווק-אובר' : m.status === 'RETIRED' ? 'פרישה' : ''}</Text>
            </Pressable>
          );
        }} />
    </View>
  );
}

const ENTRY_HE: Record<string, string> = { PENDING: 'ממתין לאישור', CONFIRMED: 'מאושר', WAITLIST: 'ברשימת המתנה', WITHDRAWN: 'פרש', REJECTED: 'נדחה' };
const PAY_HE: Record<string, string> = { UNPAID: 'לא שולם', PAID: 'שולם', REFUNDED: 'הוחזר', PARTIALLY_REFUNDED: 'הוחזר חלקית' };

const DOCS: [string, string][] = [['ID_PHOTO', 'תמונת ת״ז'], ['MEDICAL_CERTIFICATE', 'אישור רפואי'], ['PARENT_CONSENT', 'אישור הורים']];

/** Registration right on the competition screen: pick which of my players joins which category. */
function RegisterBox({ tournamentName, categories, onGoAccount }: { tournamentName: string; categories: api.Cat[]; onGoAccount: () => void }) {
  const [me, setMe] = useState<Awaited<ReturnType<typeof api.me>> | null>(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const authed = api.isAuthed();
  const load = () => { api.me().then(setMe).catch((e) => setErr(e.message)); };
  useEffect(() => { if (authed) load(); }, [authed]);

  if (!authed) {
    return (
      <View style={s.card}>
        <Text style={s.cardT}>הרשמה לתחרות</Text>
        <Text style={s.muted}>כדי להירשם יש להתחבר או ליצור חשבון, ולהוסיף שחקן.</Text>
        <Pressable style={s.btn} onPress={onGoAccount}><Text style={s.btnT}>כניסה / הרשמה</Text></Pressable>
      </View>
    );
  }
  if (!me) return err ? <Text style={s.err}>{err}</Text> : <ActivityIndicator color={T.blue} style={{ margin: 8 }} />;
  if (!me.players.length) {
    return (
      <View style={s.card}>
        <Text style={s.cardT}>הרשמה לתחרות</Text>
        <Text style={s.muted}>אין עדיין שחקן בחשבון. הוסיפו שחקן (או ילד/ה) כדי להירשם.</Text>
        <Pressable style={s.btn} onPress={onGoAccount}><Text style={s.btnT}>הוספת שחקן</Text></Pressable>
      </View>
    );
  }
  const entered = (cat: string, player: string) => me.entries.some((e) => e.tournament === tournamentName && e.category === cat && e.player === player);
  const register = (cat: api.Cat, p: MePlayer) => {
    setErr(''); setMsg('');
    if (me?.isChild) { api.suggestEntry(cat.id).then(() => setMsg(`ההצעה להירשם ל${cat.name} נשלחה להורה`)).catch((e) => setErr(e.message)); return; }
    api.enter(cat.id, p.id).then(() => { setMsg(`${p.name} נרשם/ה ל${cat.name}`); load(); }).catch((e) => setErr(e.message));
  };
  return (
    <View style={s.card}>
      <Text style={s.cardT}>הרשמה לתחרות</Text>
      {!!msg && <Text style={s.ok}>{msg}</Text>}
      {!!err && <Text style={s.err}>{err}</Text>}
      {me.players.map((p) => (
        <View key={p.id} style={{ gap: 6 }}>
          <Text style={s.b}>{p.name}</Text>
          {categories.map((c) => {
            const ok = fits(c, p);
            const done = entered(c.name, p.name);
            return (
              <Pressable key={c.id} disabled={!ok || done} style={[s.chip, { alignSelf: 'flex-start' }, (!ok || done) && { opacity: 0.55 }]} onPress={() => register(c, p)}>
                <Text style={s.b}>{done ? `✓ רשום/ה: ${c.name}` : ok ? `${me.isChild ? 'הצעה להורה' : 'הרשמה'}: ${c.name}` : `${c.name} (${why(c, p)})`}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function MyArea({ onLogout, preset, onLogoutAll, onOpenTournament }: { onLogout: () => void; preset?: 'self' | 'child' | null; onLogoutAll: () => void; onOpenTournament: (id: string) => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof api.me>> | null>(null);
  const [open, setOpen] = useState<Awaited<ReturnType<typeof api.openCategories>>>([]);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => { if (err || msg) scrollRef.current?.scrollTo({ y: 0, animated: true }); }, [err, msg]);
  const load = () => { api.me().then(setD).catch((e) => setErr(e.message)); api.openCategories().then(setOpen).catch(() => {}); };
  useEffect(load, []);
  const upload = async (playerId: string, type: string) => {
    setErr(''); setMsg('');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    try { await api.uploadDocument(playerId, type, { uri: a.uri, name: a.fileName ?? 'doc.jpg', mime: a.mimeType ?? 'image/jpeg' }); setMsg('המסמך הועלה וממתין לאישור'); load(); } catch (e) { setErr((e as Error).message); }
  };
  const child = !!d?.isChild;
  const register = (cat: string, pid: string) => (child ? api.suggestEntry(cat).then(() => setMsg('ההצעה נשלחה להורה')) : api.enter(cat, pid).then(() => { setMsg('נרשמתם לקטגוריה'); load(); })).catch((e) => setErr(e.message));
  const pay = (entryId: string) => api.checkout(entryId).then((r) => Linking.openURL(r.url)).catch((e) => setErr(e.message));
  return (
    <ScrollView ref={scrollRef} contentContainerStyle={s.scroll}>
      <View style={s.row}><Text style={s.h1}>האזור שלי</Text><Pressable onPress={onLogout}><Text style={s.b}>יציאה</Text></Pressable></View>
      {!!err && <Text style={s.err}>{err}</Text>}{!!msg && <Text style={s.ok}>{msg}</Text>}
      {api.canScore() && <View style={s.card}><Text style={s.cardT}>הזנת תוצאות</Text><Text style={s.muted}>היכנסו ללשונית תחרויות, בחרו תחרות ולחצו על משחק כדי להזין תוצאה או לעדכן תוצאה חיה.</Text></View>}
      {!child && <AddPlayer preset={preset} onAdded={(m) => { setMsg(m); load(); }} onError={setErr} />}
      {child && <Text style={s.muted}>זה חשבון צפייה. אפשר לראות תחרויות, דירוגים ותוצאות, ולהציע להורה להירשם.</Text>}
      {d?.players.map((p) => (
        <View key={p.id} style={s.card}>
          <Text style={s.b}>{p.name}</Text>
          <Text>{p.documents.ok ? 'כל המסמכים תקינים' : `חסר: ${p.documents.missing.map((m) => DOCS.find((x) => x[0] === m)?.[1] ?? m).join(', ')}`}</Text>
          {!child && DOCS.map(([k, l]) => <Pressable key={k} style={s.link} onPress={() => upload(p.id, k)}><Text style={s.linkT}>העלאת {l}</Text></Pressable>)}
          {!child && <EditProfile player={p} onDone={(m) => { setMsg(m); load(); }} onError={setErr} />}
          {!child && !p.own && <ChildLogin player={p} onDone={(m) => { setMsg(m); load(); }} onError={setErr} />}
          {open.filter((o) => fits(o, p)).map((o) => <Pressable key={o.categoryId} style={s.link} onPress={() => register(o.categoryId, p.id)}><Text style={s.linkT}>{child ? 'הצעה להורה' : 'הרשמה'}: {o.tournament} · {o.category}</Text></Pressable>)}
          {open.length > 0 && open.filter((o) => fits(o, p)).length === 0 && <Text style={s.muted}>אין כרגע תחרות פתוחה שמתאימה לשחקן הזה. {open.map((o) => `${o.tournament} · ${o.category} (${why(o, p)})`).join('; ')}</Text>}
        </View>
      ))}
      <Following onOpenTournament={onOpenTournament} />
      <Text style={s.h2}>ההרשמות שלי</Text>
      {!!d && !d.entries.some((e) => e.status !== 'WITHDRAWN' && e.status !== 'REJECTED') && <Text style={s.muted}>אין הרשמות פעילות.</Text>}
      {d?.entries.filter((e) => e.status !== 'WITHDRAWN' && e.status !== 'REJECTED').map((e) => (
        <View key={e.id} style={s.card}><Text style={s.b}>{e.tournament} · {e.category}</Text><Text>{ENTRY_HE[e.status] ?? e.status} · {PAY_HE[e.payment] ?? e.payment}</Text>
          {e.payment === 'UNPAID' && !child && <Pressable style={s.link} onPress={() => pay(e.id)}><Text style={s.linkT}>לתשלום</Text></Pressable>}
          {!child && e.status !== 'WITHDRAWN' && e.status !== 'REJECTED' && e.payment === 'UNPAID' && <Pressable style={s.link} onPress={() => Alert.alert('ביטול הרשמה', `לבטל את ההרשמה של ${e.player} ל${e.tournament} (${e.category})?`, [{ text: 'לא', style: 'cancel' }, { text: 'ביטול הרשמה', style: 'destructive', onPress: () => api.cancelEntry(e.id).then(() => { setMsg('ההרשמה בוטלה'); load(); }).catch((x) => setErr(x.message)) }])}><Text style={[s.linkT, { color: T.bad }]}>ביטול הרשמה</Text></Pressable>}</View>
      ))}
      {!!d && d.entries.some((e) => e.status === 'WITHDRAWN' || e.status === 'REJECTED') && <Text style={s.muted}>{`הרשמות שבוטלו: ${d.entries.filter((e) => e.status === 'WITHDRAWN' || e.status === 'REJECTED').length}`}</Text>}
      <Text style={s.h2}>התראות</Text>
      {!!d && !d.notifications.length && <Text style={s.muted}>אין התראות חדשות.</Text>}
      {d?.notifications.map((n) => <View key={n.id} style={s.card}><Text style={s.b}>{n.title}</Text><Text>{n.body}</Text></View>)}
      <Pressable style={[s.btn, s.btnGhost, { marginTop: 16 }]} onPress={() => Alert.alert('התנתקות מכל המכשירים', 'החשבון ינותק בכל הטלפונים והדפדפנים, כולל זה. להמשיך?', [{ text: 'ביטול', style: 'cancel' }, { text: 'התנתקות', style: 'destructive', onPress: () => api.logoutAll().then(onLogoutAll).catch((e) => setErr(e.message)) }])}><Text style={[s.btnT, { color: T.text }]}>התנתקות מכל המכשירים</Text></Pressable>
    </ScrollView>
  );
}

/** Who the signed-in user follows: players (rank, last results, next match), tournaments and clubs. */
function Following({ onOpenTournament }: { onOpenTournament: (id: string) => void }) {
  const [o, setO] = useState<api.FollowOverview | null>(null);
  useEffect(() => { api.followOverview().then(setO).catch(() => setO(null)); }, []);
  if (!o || (!o.players.length && !o.tournaments.length && !o.clubs.length)) return null;
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.h2}>המעקב שלי</Text>
      {o.players.map((p) => (
        <View key={p.id} style={s.card}>
          <Text style={s.cardT}>{p.name}</Text>
          <Text style={s.muted}>{p.rank ? `דירוג #${p.rank} · ${p.points} נקודות` : 'ללא דירוג'}{p.club ? ` · ${p.club}` : ''}</Text>
          {p.next && <Text style={s.b}>הבא: {p.next.vs}<Text style={s.muted}>{` · ${p.next.competition}`}</Text></Text>}
          {p.recent.length > 0 && <Text style={s.muted}>{p.recent.slice(0, 3).map((r) => `${r.won ? 'ניצחון' : 'הפסד'} ${r.score}`).join(' · ')}</Text>}
        </View>
      ))}
      {o.tournaments.map((x) => <Pressable key={x.id} style={s.card} onPress={() => onOpenTournament(x.id)}><Text style={s.cardT}>{x.name}</Text><Text style={s.muted}>{new Date(x.startDate).toLocaleDateString('he-IL')} – {new Date(x.endDate).toLocaleDateString('he-IL')}</Text></Pressable>)}
      {o.clubs.map((c) => <View key={c.id} style={s.card}><Text style={s.cardT}>{c.name}</Text></View>)}
    </View>
  );
}

/** Fix a profile's details, or remove it from the account. Mirrors the server rules (history is kept, an empty profile is deleted). */
function EditProfile({ player, onDone, onError }: { player: { id: string; first: string; last: string; birth: string; gender: 'MALE' | 'FEMALE'; synced: boolean; name: string }; onDone: (msg: string) => void; onError: (e: string) => void }) {
  const [openForm, setOpenForm] = useState(false);
  const [first, setFirst] = useState(player.first); const [last, setLast] = useState(player.last); const [birth, setBirth] = useState(player.birth);
  const [gender, setGender] = useState(player.gender);
  if (!openForm) return <Pressable style={s.link} onPress={() => setOpenForm(true)}><Text style={s.linkT}>עריכת פרטים או מחיקה</Text></Pressable>;
  const save = () => { onError(''); api.updatePlayer(player.id, { first: first.trim(), last: last.trim(), birth: birth.trim(), gender }).then(() => { setOpenForm(false); onDone('הפרטים עודכנו'); }).catch((e) => onError(e.message)); };
  const remove = () => Alert.alert('מחיקת פרופיל', `להסיר את ${player.name} מהחשבון? פרופיל בלי הרשמות ותוצאות נמחק לגמרי. אם יש היסטוריה, הוא מוסר מהחשבון ונשאר ברשומות האיגוד.`, [
    { text: 'ביטול', style: 'cancel' },
    { text: 'מחיקה', style: 'destructive', onPress: () => api.removePlayer(player.id).then((r) => { setOpenForm(false); onDone(r.deleted ? 'הפרופיל נמחק' : 'הפרופיל הוסר מהחשבון'); }).catch((e) => onError(e.message)) },
  ]);
  return (
    <View style={{ gap: 8 }}>
      {player.synced ? <Text style={s.muted}>הפרופיל מסונכרן ממערכת האיגוד, לשינוי פרטים יש לפנות לאיגוד.</Text> : <>
        <TextInput style={s.input} placeholder="שם פרטי" placeholderTextColor={T.muted} value={first} onChangeText={setFirst} />
        <TextInput style={s.input} placeholder="שם משפחה" placeholderTextColor={T.muted} value={last} onChangeText={setLast} />
        <TextInput style={s.input} placeholder="תאריך לידה (YYYY-MM-DD)" placeholderTextColor={T.muted} keyboardType="numbers-and-punctuation" value={birth} onChangeText={setBirth} />
        <View style={s.row}>{([['MALE', 'בן / גבר'], ['FEMALE', 'בת / אישה']] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, gender === k && s.chipOn]} onPress={() => setGender(k)}><Text style={gender === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}</View>
        <Pressable style={s.btn} onPress={save}><Text style={s.btnT}>שמירה</Text></Pressable>
      </>}
      <Pressable style={[s.btn, s.btnGhost]} onPress={remove}><Text style={[s.btnT, { color: T.bad }]}>מחיקת פרופיל</Text></Pressable>
      <Pressable style={s.link} onPress={() => setOpenForm(false)}><Text style={s.linkT}>סגירה</Text></Pressable>
    </View>
  );
}

/** A parent creates (or resets) a child's login: a user name and a password, no email. */
function ChildLogin({ player, onDone, onError }: { player: { id: string; childLogin: string | null }; onDone: (msg: string) => void; onError: (e: string) => void }) {
  const [openForm, setOpenForm] = useState(false);
  const [u, setU] = useState(player.childLogin ?? ''); const [pw, setPw] = useState('');
  if (!openForm) return <Pressable style={s.link} onPress={() => setOpenForm(true)}><Text style={s.linkT}>{player.childLogin ? `כניסה לילד/ה: ${player.childLogin} · עדכון סיסמה` : 'יצירת כניסה לילד/ה'}</Text></Pressable>;
  const save = () => {
    onError('');
    api.setChildLogin(player.id, u.trim(), pw).then((r) => { setOpenForm(false); setPw(''); onDone(`הכניסה של הילד/ה מוכנה. שם משתמש: ${r.username}`); }).catch((e) => onError(e.message));
  };
  return (
    <View style={{ gap: 8 }}>
      <TextInput style={s.input} placeholder="שם משתמש (אנגלית)" placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} value={u} onChangeText={setU} />
      <TextInput style={s.input} placeholder="סיסמה (10 תווים, אותיות וספרות)" placeholderTextColor={T.muted} secureTextEntry value={pw} onChangeText={setPw} />
      <View style={s.row}><Pressable style={[s.btn, { flex: 1 }]} onPress={save}><Text style={s.btnT}>שמירה</Text></Pressable><Pressable style={s.chip} onPress={() => setOpenForm(false)}><Text style={s.b}>ביטול</Text></Pressable></View>
    </View>
  );
}

/** Does a player fit a category (gender and birth-year limits)? Mirrors the server rule so we never offer something that will be refused. */
type OpenCat = Awaited<ReturnType<typeof api.openCategories>>[number];
type MePlayer = Awaited<ReturnType<typeof api.me>>['players'][number];
type Limits = { gender: 'MALE' | 'FEMALE' | 'OPEN'; minBirthYear: number | null; maxBirthYear: number | null };
const fits = (o: Limits, p: MePlayer) =>
  (o.gender === 'OPEN' || o.gender === p.gender) && !(o.minBirthYear && p.birthYear < o.minBirthYear) && !(o.maxBirthYear && p.birthYear > o.maxBirthYear);
const why = (o: Limits, p: MePlayer) =>
  o.gender !== 'OPEN' && o.gender !== p.gender ? (o.gender === 'MALE' ? 'לבנים/גברים בלבד' : 'לבנות/נשים בלבד')
    : o.minBirthYear && p.birthYear < o.minBirthYear ? `שנת לידה ${o.minBirthYear} ואילך` : `שנת לידה עד ${o.maxBirthYear}`;

function AddPlayer({ onAdded, onError, preset }: { onAdded: (msg: string) => void; onError: (e: string) => void; preset?: 'self' | 'child' | null }) {
  const [openForm, setOpenForm] = useState(!!preset);
  const [first, setFirst] = useState(''); const [last, setLast] = useState(''); const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE'); const [child, setChild] = useState(preset === 'child');
  if (!openForm) return <Pressable style={s.btn} onPress={() => setOpenForm(true)}><Text style={s.btnT}>+ הוספת שחקן</Text></Pressable>;
  const save = () => {
    onError('');
    api.addPlayer({ first: first.trim(), last: last.trim(), birth: birth.trim(), gender, forChild: child })
      .then((r) => { setOpenForm(false); setFirst(''); setLast(''); setBirth(''); onAdded(r.pending ? 'נמצא שחקן קיים שאי אפשר לחבר אוטומטית. הבקשה נשלחה לאישור האיגוד' : r.linkedExisting ? 'נמצא שחקן קיים באיגוד, והוא חובר לחשבון שלך עם הדירוג וההיסטוריה' : 'הפרופיל נוצר'); }).catch((e) => onError(e.message));
  };
  return (
    <View style={s.card}>
      <Text style={s.cardT}>הוספת שחקן</Text>
      <TextInput style={s.input} placeholder="שם פרטי" placeholderTextColor={T.muted} value={first} onChangeText={setFirst} />
      <TextInput style={s.input} placeholder="שם משפחה" placeholderTextColor={T.muted} value={last} onChangeText={setLast} />
      <TextInput style={s.input} placeholder="תאריך לידה (YYYY-MM-DD)" placeholderTextColor={T.muted} keyboardType="numbers-and-punctuation" value={birth} onChangeText={setBirth} />
      <View style={s.row}>{([['MALE', 'בן / גבר'], ['FEMALE', 'בת / אישה']] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, gender === k && s.chipOn]} onPress={() => setGender(k)}><Text style={gender === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}</View>
      <Pressable style={[s.chip, child && s.chipOn, { alignSelf: 'flex-start' }]} onPress={() => setChild(!child)}><Text style={child ? s.chipOnT : s.b}>{child ? '✓ ' : ''}זה ילד/ה שלי (הורה נרשם עבור ילד)</Text></Pressable>
      <View style={s.row}><Pressable style={[s.btn, { flex: 1 }]} onPress={save}><Text style={s.btnT}>שמירה</Text></Pressable><Pressable style={[s.chip, { minHeight: 54 }]} onPress={() => setOpenForm(false)}><Text style={s.b}>ביטול</Text></Pressable></View>
    </View>
  );
}

/** Quick result entry: tap +/- per set; server validates the score and propagates the winner. */
function Score({ m, onDone }: { m: api.Match; onDone: () => void }) {
  const [g, setG] = useState<number[][]>(() => [0, 1, 2].map((i) => { const x = (m.sets ?? [])[i]; return x ? [x.a, x.b] : [0, 0]; })); const [err, setErr] = useState('');
  const bump = (i: number, k: 0 | 1, d: number) => setG((x) => x.map((r, j) => (j === i ? r.map((v, q) => (q === k ? Math.max(0, Math.min(i === 2 ? 30 : 7, v + d)) : v)) : r)));
  const save = () => api.sendResult(m.id, { status: 'COMPLETED', sets: g.map(([a, b], i) => ({ a: a as number, b: b as number, ...(i === 2 ? { superTb: true } : {}) })).filter((x) => x.a || x.b) }).then(onDone).catch((e) => setErr(e.message));
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Pressable onPress={onDone}><Text style={s.b}>ביטול ←</Text></Pressable>
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
      <Pressable style={[s.btn, s.btnGhost]} onPress={() => api.sendLive(m.id, g.map(([a, b], i) => ({ a: a as number, b: b as number, ...(i === 2 ? { superTb: true } : {}) })).filter((x) => x.a || x.b)).then(onDone).catch((e) => setErr(e.message))}><Text style={[s.btnT, { color: T.text }]}>עדכון תוצאה חיה · המשחק נמשך</Text></Pressable>
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
  scroll: { padding: 16, gap: 10, paddingBottom: 110 },
  screen: { flex: 1, backgroundColor: T.bg, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 24 : 0 }, pad: { padding: 16, gap: 10, flex: 1, paddingBottom: 0 },
  h1: { fontSize: 32, fontWeight: '800', color: T.text, letterSpacing: -0.8, lineHeight: 36 }, h2: { fontSize: 22, fontWeight: '700', color: T.text, letterSpacing: -0.4, marginTop: 8 },
  hero: { backgroundColor: T.ink, borderRadius: 28, padding: 24, gap: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginBottom: 4 },
  heroBrand: { color: '#fff', fontWeight: '800', fontSize: 20, letterSpacing: -0.4 },
  heroT: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -1.2, lineHeight: 36, marginTop: 8 }, heroS: { color: '#AEBBB4', fontSize: 15, lineHeight: 22 },
  cardT: { fontSize: 18, fontWeight: '700', color: T.text, letterSpacing: -0.2 }, pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  chip2: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line }, chip2T: { fontSize: 12.5, fontWeight: '600', color: T.text },
  chipOk: { backgroundColor: T.okbg, borderColor: 'transparent' }, chipLive: { backgroundColor: T.volt, borderColor: 'transparent' },
  photo: { width: 220, height: 150, borderRadius: 20, backgroundColor: T.line },
  b: { fontWeight: '700', color: T.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 22, padding: 18, marginBottom: 10, gap: 8 },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line2, borderRadius: 14, paddingHorizontal: 16, minHeight: 48, textAlign: 'right', color: T.text, fontSize: 16 },
  btn: { backgroundColor: T.btn, borderRadius: 999, minHeight: 50, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' }, btnT: { color: T.btnText, fontWeight: '700', fontSize: 16 },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: T.line2 },
  ok: { backgroundColor: T.okbg, color: T.ok, padding: 12, borderRadius: 14, overflow: 'hidden' },
  link: { minHeight: 44, justifyContent: 'center' }, linkT: { color: T.blue, fontWeight: '700' },
  err: { backgroundColor: T.badbg, color: T.bad, padding: 12, borderRadius: 14, overflow: 'hidden' },
  stp: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: T.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surface }, stpT: { fontSize: 24, fontWeight: '700', color: T.text },
  muted: { color: T.muted, fontSize: 14 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line },
  whoAv: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.volt, alignItems: 'center', justifyContent: 'center' }, whoAvT: { color: T.ink, fontWeight: '800', fontSize: 16 },
  tabbar: { position: 'absolute', bottom: 10, left: 10, right: 10, flexDirection: 'row', backgroundColor: T.glass, borderWidth: 1, borderColor: T.glassLine, borderRadius: 999, padding: 5, elevation: 10, shadowColor: '#0C1210', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  tab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 999 }, tabActive: { backgroundColor: T.btn },
  tabT: { color: T.muted, fontWeight: '500', fontSize: 11 }, tabOn: { color: T.btnText, fontWeight: '700' },
  chip: { paddingHorizontal: 16, minHeight: 40, borderRadius: 999, borderWidth: 1, borderColor: T.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surface }, chipOn: { backgroundColor: T.btn, borderColor: T.btn }, chipOnT: { color: T.btnText, fontWeight: '700' },
  num: { width: 32, textAlign: 'center', fontSize: 28, fontWeight: '800', color: T.text },
});
