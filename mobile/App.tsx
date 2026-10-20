import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, ScrollView, I18nManager, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';
import { Platform } from 'react-native';
import * as api from './src/api';
import { More } from './src/More';
import { MyHome } from './src/MyHome';
import { Bracket } from './src/Bracket';
import { MatchCard, matchWhen } from './src/MatchCard';
import { AdminScreen, ClubScreen, MatchScreen, NavCtx, PlayerScreen, useNav, type Focus, type Nav } from './src/Detail';
import { useFonts } from 'expo-font';
import { T, Icon, BallMark, CourtLines, FONTS } from './src/theme';
import { LANGS, isRtl, lang, loadLang, locale, nextLang, setLang, startAlign, tr } from './src/i18n';

async function registerPush() {
  try {
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const t = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await api.registerDevice(t.data, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch { /* push is optional: the in-app inbox still works */ }
}

// the layout direction follows the chosen language (set on the root view below), not the phone's own setting
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);


type Tab = 't' | 'live' | 'rank' | 'players' | 'search' | 'more' | 'me';
/** Opens a tab, one of the sections under "more" (clubs, leagues, ...), or the search with a term. */
type Go = (t: Tab, extra?: string) => void;
// the website's dock; everything else is in the menu (hamburger) and the account behind the avatar, as on the site
const TABS: [Tab, string, 'home' | 'live' | 'rank' | 'players' | 'search'][] = [['t', 'בית', 'home'], ['live', 'משחקים', 'live'], ['rank', 'דירוג', 'rank'], ['players', 'שחקנים', 'players'], ['search', 'חיפוש', 'search']];
// the website's menu, in its order
const MENU: [Tab, string, string?][] = [['t', 'תחרויות'], ['live', 'משחקים'], ['rank', 'דירוג'], ['players', 'שחקנים'], ['more', 'מועדונים', 'clubs'], ['more', 'ליגות', 'leagues'], ['more', 'תקנונים', 'regs'], ['more', 'סטטיסטיקות', 'stats'], ['more', 'אודות', 'about'], ['search', 'חיפוש']];

export default function App() {
  const [ready, setReady] = useState(false);
  const [fontsReady] = useFonts(FONTS);
  const [authed, setAuthed] = useState(false);
  const [lng, setLng] = useState(lang().code);
  useEffect(() => { Promise.all([api.loadToken(), loadLang()]).then(([t, l]) => { setAuthed(!!t); setLng(l.code); setReady(true); }); }, []);
  if (!ready || !fontsReady) return <ActivityIndicator color={T.blue} style={{ flex: 1, backgroundColor: T.bg }} />;
  // Hebrew lays out right to left, English left to right: the whole tree takes the language's direction from here (also in Expo Go,
  // which cannot switch the app's native direction). Changing the language re-renders everything in it (key).
  const onLang = (code: string) => setLang(code).then((l) => setLng(l.code));
  return <SafeAreaView key={lng} style={[s.screen, { direction: isRtl() ? 'rtl' : 'ltr' } as object]}><StatusBar barStyle={T.dark ? 'light-content' : 'dark-content'} backgroundColor={T.bg} /><Home authed={authed} setAuthed={setAuthed} onLang={onLang} /></SafeAreaView>;
}

function Login({ onDone }: { onDone: (signedUp: boolean) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [remember, setRemember] = useState(true); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const fail = (e: Error) => { setBusy(false); setErr(e.message === 'invalid' ? tr('אימייל או סיסמה שגויים') : e.message === 'locked' ? tr('החשבון ננעל זמנית') : e.message); };
  const submit = () => {
    if (!email.trim() || !pw || (mode === 'signup' && !name.trim())) { setErr(tr('יש למלא את כל השדות החובה')); return; }
    setErr(''); setBusy(true);
    (mode === 'login' ? api.login(email.trim(), pw, remember) : api.register(name.trim(), email.trim(), phone.trim(), pw, remember)).then(() => { setBusy(false); onDone(mode === 'signup'); }).catch(fail);
  };
  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>{mode === 'login' ? tr('כניסה') : tr('הרשמה')}</Text>
      {mode === 'signup' && <Text style={s.muted}>{tr('יצירת חשבון אחד לשחקנים, להורים ולאוהדים. בשלב הבא תבחרו מי משחק.')}</Text>}
      {!!err && <Text style={s.err}>{err}</Text>}
      {mode === 'signup' && <TextInput style={[s.input, startAlign()]} placeholder={tr('שם מלא')} placeholderTextColor={T.muted} value={name} onChangeText={setName} />}
      <TextInput style={[s.input, startAlign()]} placeholder={mode === 'login' ? tr('אימייל או שם משתמש') : tr('אימייל')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} keyboardType={mode === 'login' ? 'default' : 'email-address'} value={email} onChangeText={setEmail} />
      {mode === 'signup' && <TextInput style={[s.input, startAlign()]} placeholder={tr('טלפון (לא חובה)')} placeholderTextColor={T.muted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />}
      <TextInput style={[s.input, startAlign()]} placeholder={mode === 'signup' ? tr('סיסמה (10 תווים, אותיות וספרות)') : tr('סיסמה')} placeholderTextColor={T.muted} secureTextEntry value={pw} onChangeText={setPw} />
      <Pressable style={[s.chip, { alignSelf: 'flex-start' }, remember && s.chipOn]} onPress={() => setRemember(!remember)}><Text style={remember ? s.chipOnT : s.b}>{remember ? '✓ ' : ''}{tr('השאר אותי מחובר')}</Text></Pressable>
      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}><Text style={s.btnT}>{mode === 'login' ? tr('כניסה') : tr('יצירת חשבון')}</Text></Pressable>
      {mode === 'login' && <Pressable style={s.link} onPress={() => Linking.openURL(api.webUrl('/forgot'))}><Text style={s.linkT}>{tr('שכחתי סיסמה')}</Text></Pressable>}
      <Pressable style={s.link} onPress={() => { setErr(''); setMode(mode === 'login' ? 'signup' : 'login'); }}><Text style={s.linkT}>{mode === 'login' ? tr('אין חשבון? הרשמה') : tr('כבר רשומים? כניסה')}</Text></Pressable>
    </ScrollView>
  );
}

function Welcome({ onPick, onSkip }: { onPick: (w: 'self' | 'child' | 'follow') => void; onSkip: () => void }) {
  const opts: ['self' | 'child' | 'follow', string, string][] = [
    ['self', tr('אני משחק/ת'), tr('פרופיל שחקן על שמי: דירוג, משחקים והרשמה לתחרויות')],
    ['child', tr('הילד/ה שלי משחק/ת'), tr('פרופיל לילד/ה, אפשר להוסיף כמה שרוצים. אני מנהל/ת את ההרשמות והמסמכים')],
    ['follow', tr('אני רק עוקב/ת'), tr('לעקוב אחרי שחקנים ותחרויות ולקבל התראות, בלי פרופיל')],
  ];
  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <Text style={s.h1}>{tr('ברוכים הבאים')}</Text>
      <Text style={s.muted}>{tr('מי משחק? כך נתאים לכם את מסך הבית.')}</Text>
      {opts.map(([k, t, sub]) => <Pressable key={k} style={({ pressed }) => [s.card, pressed && s.pressed]} onPress={() => onPick(k)}><Text style={s.cardT}>{t}</Text><Text style={s.muted}>{sub}</Text></Pressable>)}
      <Pressable style={s.link} onPress={onSkip}><Text style={s.linkT}>{tr('דילוג, אחליט אחר כך')}</Text></Pressable>
    </ScrollView>
  );
}

function Home({ authed, setAuthed, onLang }: { authed: boolean; setAuthed: (v: boolean) => void; onLang: (code: string) => void }) {
  const [tab, setTab] = useState<Tab>('t');
  const [open, setOpen] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | undefined>(undefined); // the player a tournament opens focused on (from a player's page)
  const [subs, setSubs] = useState<{ k: 'player' | 'club' | 'match' | 'admin'; id: string }[]>([]); // player / club / match pages, stacked so Back returns to the previous one
  const [epoch, setEpoch] = useState(0); // bumps when the signed-in identity changes (impersonation), so every screen reloads its data
  const nav: Nav = {
    reload: () => { setSubs([]); setOpen(null); setFocus(undefined); setTab('t'); setEpoch((e) => e + 1); },
    admin: () => setSubs((x) => [...x, { k: 'admin', id: '' }]),
    player: (id) => setSubs((x) => [...x, { k: 'player', id }]), club: (id) => setSubs((x) => [...x, { k: 'club', id }]), match: (id) => setSubs((x) => [...x, { k: 'match', id }]),
    tournament: (id, f) => { setFocus(f); setOpen(id); },
  };
  const sub = subs[subs.length - 1];
  const popSub = () => setSubs((x) => x.slice(0, -1));
  const [who, setWho] = useState<'ask' | 'self' | 'child' | null>(null);
  const [menu, setMenu] = useState(false);
  const [extra, setExtra] = useState<{ v?: string; n: number }>({ n: 0 }); // a "more" section or a search term, applied afresh each time
  const go: Go = (k, v) => { setOpen(null); setFocus(undefined); setSubs([]); setWho(null); setMenu(false); setExtra((x) => ({ v, n: x.n + 1 })); setTab(k); };
  const [, bump] = useState(0);
  // sessions started before the name was stored: fetch it once so the header can show who is signed in
  useEffect(() => { if (authed && !api.currentUserName()) api.me().then((m) => api.rememberUserName(m.name)).then(() => bump((n) => n + 1)).catch(() => {}); }, [authed]);
  useEffect(() => { if (authed) registerPush(); }, [authed]);
  useEffect(() => { api.setAuthLostHandler(() => setAuthed(false)); return () => api.setAuthLostHandler(null); }, [setAuthed]);
  return (
    <NavCtx.Provider value={nav}>
    <View style={{ flex: 1 }} key={epoch}>
      {api.isImpersonating() && <Pressable style={{ backgroundColor: T.warnbg, paddingVertical: 8, paddingHorizontal: 16 }} onPress={() => { api.stopImpersonating(); nav.reload(); }}><Text style={{ color: T.warn, fontWeight: '700', textAlign: 'center' }}>{tr('מתחזה ל-{name}. חזרה למנהל', { name: api.currentUserName() ?? '' })}</Text></Pressable>}
      <View style={s.topbar}>
        <Pressable style={s.brandRow} onPress={() => go('t')} accessibilityLabel="ITA"><BallMark size={30} /><Text style={s.brand}>ITA</Text></Pressable>
        <View style={s.topEnd}>
          {authed && !!api.currentUserName()
            ? <Pressable style={s.topAv} onPress={() => go('me')} accessibilityLabel={tr('פרטים אישיים')}><Text style={s.topAvT}>{api.currentUserName()!.trim().charAt(0).toUpperCase()}</Text></Pressable>
            : <Pressable style={s.topLogin} onPress={() => go('me')}><Text style={s.topLoginT}>{tr('כניסה')}</Text></Pressable>}
          {/* as on the website: shows the language it switches to */}
          <Pressable style={s.langBtn} onPress={() => onLang(nextLang().code)} accessibilityLabel={nextLang().name}><Text style={s.langBtnT}>{nextLang().short}</Text></Pressable>
          <Pressable style={s.burger} onPress={() => setMenu(!menu)} accessibilityLabel={tr('תפריט')} accessibilityState={{ expanded: menu }}><Icon name={menu ? 'close' : 'more'} size={22} color={T.text} /></Pressable>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        {open ? <Tournament id={open} focus={focus} onBack={() => { setOpen(null); setFocus(undefined); }} onGoAccount={() => { setOpen(null); setSubs([]); setTab('me'); }} />
          : sub?.k === 'player' ? <PlayerScreen key={sub.id} id={sub.id} onBack={popSub} />
          : sub?.k === 'admin' ? <AdminScreen onBack={popSub} />
          : sub?.k === 'club' ? <ClubScreen key={sub.id} id={sub.id} onBack={popSub} />
          : sub?.k === 'match' ? <MatchScreen key={sub.id} id={sub.id} onBack={popSub} />
          : tab === 't' ? <TournamentList onOpen={setOpen} authed={authed} onGoAccount={() => setTab('me')} go={go} />
          : tab === 'live' ? <Live />
          : tab === 'rank' ? <Rankings />
          : tab === 'players' ? <Players />
          : tab === 'search' ? <Search key={extra.n} initial={extra.v ?? ''} onOpen={setOpen} />
          : tab === 'more' ? <More key={extra.n} initial={extra.v} />
          : authed ? (who === 'ask' ? <Welcome onPick={(w) => { if (w === 'follow') { setWho(null); setTab('rank'); } else setWho(w); }} onSkip={() => { setWho(null); setTab('t'); }} /> : <MyArea onOpenTournament={(id) => setOpen(id)} preset={who} onLogoutAll={() => { setWho(null); setAuthed(false); }} onLogout={() => api.logout().then(() => { setWho(null); setAuthed(false); })} />) : <Login onDone={(signedUp) => { setAuthed(true); if (signedUp) setWho('ask'); }} />}
      </View>
      {menu && <>
        <Pressable style={s.scrim} onPress={() => setMenu(false)} accessibilityLabel={tr('סגירת התפריט')} />
        <View style={s.menu}>
          {MENU.map(([k, l, v]) => { const on = !open && !sub && tab === k && (k !== 'more' || extra.v === v); return <Pressable key={l} style={({ pressed }) => [s.menuRow, on && s.menuOn, pressed && s.pressed]} onPress={() => go(k, v)}><Text style={[s.menuT, on && s.menuOnT]}>{tr(l)}</Text></Pressable>; })}
          <View style={s.menuSep} />
          <Pressable style={({ pressed }) => [s.menuRow, pressed && s.pressed]} onPress={() => go('me')}><Text style={s.menuT}>{authed ? tr('פרטים אישיים והרשמות') : tr('כניסה / הצטרפות')}</Text></Pressable>
          <View style={s.menuSep} />
          <View style={s.langRow}>{LANGS.map((l) => <Pressable key={l.code} style={[s.chip, l.code === lang().code && s.chipOn]} onPress={() => onLang(l.code)}><Text style={l.code === lang().code ? s.chipOnT : s.b}>{l.name}</Text></Pressable>)}</View>
        </View>
      </>}
      <View style={s.tabbar}>
        {TABS.map(([k, l, ic]) => { const on = tab === k && !open && !sub; return <Pressable key={k} style={[s.tab, on && s.tabActive]} onPress={() => go(k)}><Icon name={ic} size={21} color={on ? T.btnText : T.muted} /><Text style={[s.tabT, on && s.tabOn]}>{tr(l)}</Text></Pressable>; })}
      </View>
    </View>
    </NavCtx.Provider>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(true);
  const load = () => { setBusy(true); setErr(''); fn().then(setData).catch((e) => setErr(e.message)).finally(() => setBusy(false)); };
  useEffect(load, deps);
  return { data, err, busy, reload: () => { api.clearCache(); load(); } };
}

function Status({ err, busy, empty }: { err: string; busy: boolean; empty?: string | false }) {
  if (busy) return <ActivityIndicator color={T.blue} style={{ margin: 16 }} />;
  if (err) return <Text style={s.err}>{err}</Text>;
  return empty ? <Text style={s.muted}>{empty}</Text> : null;
}

const STATUS_HE: Record<string, string> = { DRAFT: 'טיוטה', REGISTRATION_OPEN: 'הרשמה פתוחה', REGISTRATION_CLOSED: 'הרשמה סגורה', DRAWN: 'הוגרלה', IN_PROGRESS: 'מתקיימת', FINISHED: 'הסתיימה', CANCELLED: 'בוטלה' };

/** The registration that closes next, as on the website's home: name, dates, a countdown and the button. Only competitions that can apply to the user. */
function Featured({ data, onOpen }: { data: { id: string; name: string; status: string; level: string; startDate: string; endDate: string; registrationCloses: string | null; relevant?: boolean }[] | null; onOpen: (id: string) => void }) {
  const next = [...(data ?? [])].filter((x) => x.status === 'REGISTRATION_OPEN' && x.relevant !== false).sort((a, b) => +new Date(a.registrationCloses ?? a.startDate) - +new Date(b.registrationCloses ?? b.startDate))[0];
  if (!next) return null;
  const left = Math.max(0, +new Date(next.registrationCloses ?? next.startDate) - Date.now());
  const dm = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  return (
    <View style={s.feat}>
      <View style={s.featHead}><View style={s.featDot} /><Text style={s.featSmall}>{tr('ההרשמה פתוחה')}</Text></View>
      <Text style={s.featT}>{next.name}</Text>
      <Text style={s.featMeta}>{`${dm(next.startDate)} – ${dm(next.endDate)}`}</Text>
      <View style={s.featCount}>
        <View style={s.featBox}><Text style={s.featN}>{Math.floor(left / 86400000)}</Text><Text style={s.featL}>{tr('ימים')}</Text></View>
        <View style={s.featBox}><Text style={s.featN}>{Math.floor((left % 86400000) / 3600000)}</Text><Text style={s.featL}>{tr('שעות')}</Text></View>
      </View>
      <Pressable style={s.featBtn} onPress={() => onOpen(next.id)}><Text style={s.featBtnT}>{tr('להרשמה')}</Text></Pressable>
    </View>
  );
}

/** The website's four quick tiles: open registrations, matches, ranking and clubs. */
function Tiles({ data, go, onOpenStatus }: { data: { status: string; relevant?: boolean }[] | null; go: Go; onOpenStatus: () => void }) {
  const stats = useLoad(api.stats); const feed = useLoad(api.live); const clubs = useLoad(api.clubs);
  const open = (data ?? []).filter((x) => x.status === 'REGISTRATION_OPEN' && x.relevant !== false).length;
  const liveNow = feed.data?.live.length ?? 0;
  const tile = (n: string | number, title: string, sub: string, press: () => void, primary = false) => (
    <Pressable style={({ pressed }) => [s.tile, primary && s.tileOn, pressed && s.pressed]} onPress={press}>
      <Text style={[s.tileN, primary && { color: T.volt }]}>{n}</Text>
      <Text style={[s.tileT, primary && { color: '#fff' }]}>{title}</Text>
      <Text style={[s.muted, primary && { color: '#AEBBB4' }]} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
  return (
    <View style={s.tiles}>
      {tile(open, tr('להירשם לתחרות'), open ? tr('פתוחות עכשיו') : tr('אין הרשמה פתוחה'), onOpenStatus, true)}
      {tile(liveNow, tr('משחקים ותוצאות'), liveNow ? tr('משחקים חיים עכשיו') : tr('לוחות ותוצאות'), () => go('live'))}
      {tile(stats.data?.totals.players.toLocaleString(locale()) ?? '–', tr('דירוג'), tr('שחקנים רשומים'), () => go('rank'))}
      {tile(clubs.data?.length ?? '–', tr('מועדונים'), tr('מועדונים עם שחקנים'), () => go('more', 'clubs'))}
    </View>
  );
}

function TournamentList({ onOpen, authed, onGoAccount, go }: { onOpen: (id: string) => void; authed: boolean; onGoAccount: () => void; go: Go }) {
  const nav = useNav();
  const [hq, setHq] = useState('');
  const { data, err, busy, reload } = useLoad(api.tournaments);
  const [level, setLevel] = useState('');
  const [sec, setSec] = useState('');
  const [season, setSeason] = useState('');
  const [st, setSt] = useState('up');
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const [mineOnly, setMineOnly] = useState(true);
  const isDone = (x: { status: string; endDate: string }) => x.status === 'FINISHED' || x.status === 'CANCELLED' || +new Date(x.endDate) < Date.now();
  // open registration, then running, then upcoming soonest first, then finished latest first
  const rank = (x: { status: string; endDate: string }) => (x.status === 'REGISTRATION_OPEN' ? 0 : x.status === 'IN_PROGRESS' ? 1 : isDone(x) ? 3 : 2);
  const dm = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  const shown = [...(data ?? [])]
    .sort((a, b) => rank(a) - rank(b) || (rank(a) === 3 ? +new Date(b.startDate) - +new Date(a.startDate) : +new Date(a.startDate) - +new Date(b.startDate)))
    .filter((x) => (!mineOnly || !!q.trim() || !!level || !!sec || !!season || x.relevant !== false) && (!season || String(new Date(x.startDate).getFullYear()) === season) && (!q.trim() || x.name.includes(q.trim())) && (!level || x.level === level) && (!sec || x.section === sec)
      && (st === 'all' || (st === 'up' ? !isDone(x) : st === 'open' ? x.status === 'REGISTRATION_OPEN' : st === 'live' ? x.status === 'IN_PROGRESS' : isDone(x))));
  return (
      <FlatList style={s.pad} contentContainerStyle={{ paddingBottom: 100, gap: 10 }} ListHeaderComponent={<View style={{ gap: 10 }}>
      <View style={s.hero}><CourtLines /><Text style={s.heroT}>{tr('איגוד הטניס בישראל')}</Text><Text style={s.heroS}>{tr('תחרויות, לוחות משחקים ותוצאות חיות')}</Text>
        {/* as in the website's hero: one box over players, clubs and competitions */}
        <View style={s.hsearch}>
          <Icon name="search" size={20} color={T.muted} />
          <TextInput style={[s.hsearchIn, startAlign()]} placeholder={tr('חיפוש שחקן, מועדון או תחרות')} placeholderTextColor={T.muted} value={hq} onChangeText={setHq} returnKeyType="search" onSubmitEditing={() => go('search', hq.trim())} />
          <Pressable style={s.hsearchBtn} onPress={() => go('search', hq.trim())}><Text style={s.hsearchBtnT}>{tr('חיפוש')}</Text></Pressable>
        </View>
      </View>
      <Featured data={data} onOpen={onOpen} />
      <Tiles data={data} go={go} onOpenStatus={() => setSt('open')} />
      <MyHome authed={authed} onOpen={onOpen} onGoAccount={onGoAccount} onAdmin={nav.admin} />
      <Text style={s.h2}>{tr('תחרויות')}</Text>
      <TextInput style={[s.input, startAlign()]} placeholder={tr('חיפוש לפי שם תחרות')} placeholderTextColor={T.muted} value={q} onChangeText={setQ} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([['up', tr('קרובות')], ['open', tr('הרשמה פתוחה')], ['live', tr('מתקיימת')], ['done', tr('הסתיימה')], ['all', tr('הכול')]] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, st === k && s.chipOn]} onPress={() => setSt(k)}><Text style={st === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
        {(data ?? []).some((x) => x.relevant === false) && <Pressable style={[s.chip, mineOnly && s.chipOn]} onPress={() => setMineOnly(!mineOnly)}><Text style={mineOnly ? s.chipOnT : s.b}>{mineOnly ? tr('✓ מתאימות לי') : tr('מתאימות לי')}</Text></Pressable>}
        <Pressable style={[s.chip, (more || !!level || !!sec || !!season) && s.chipOn]} onPress={() => setMore(!more)}><Text style={(more || !!level || !!sec || !!season) ? s.chipOnT : s.b}>{level || sec || season ? tr('סינון ·') : tr('סינון')}</Text></Pressable>
      </View>
      {more && <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {([['', tr('כל הסוגים')], ['NATIONAL', tr('ארצית')], ['REGIONAL', tr('אזורית')], ['INTERNATIONAL', tr('בינלאומית')], ['CIRCUIT', tr('סבב')]] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, level === k && s.chipOn]} onPress={() => setLevel(k)}><Text style={level === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {([['', tr('כל הקטגוריות')], ['YOUTH', tr('נוער')], ['ADULTS', tr('בוגרים')], ['MASTERS', tr('מאסטרס')], ['OTHER', tr('אחר')]] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, sec === k && s.chipOn]} onPress={() => setSec(k)}><Text style={sec === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {[['', tr('כל העונות')], ...[...new Set((data ?? []).map((x) => new Date(x.startDate).getFullYear()))].filter((y) => y >= 2000).sort((a, b) => b - a).map((y) => [String(y), String(y)])].map(([k, l]) => <Pressable key={k} style={[s.chip, season === k && s.chipOn]} onPress={() => setSeason(k)}><Text style={season === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
        </View>
      </>}
      <Status err={err} busy={busy} empty={!!data && !shown.length && tr('אין תחרויות לפי הסינון')} />
      </View>} data={shown} keyExtractor={(t) => t.id} onRefresh={reload} refreshing={false} renderItem={({ item }) => (
        <Pressable style={({ pressed }) => [s.card, pressed && s.pressed]} onPress={() => onOpen(item.id)}>
          <View style={[s.chip2, item.status === 'REGISTRATION_OPEN' ? s.chipOk : item.status === 'IN_PROGRESS' ? s.chipLive : null]}><Text style={s.chip2T}>{tr(STATUS_HE[item.status] ?? item.status)}</Text></View>
          <Text style={s.cardT}>{item.name}</Text>
          <Text style={s.muted}>{`${dm(item.startDate)} – ${dm(item.endDate)}`}{item.status === 'REGISTRATION_OPEN' && item.registrationCloses ? ` · ${tr('הרשמה עד {date}', { date: dm(item.registrationCloses) })}` : ''}</Text>
        </Pressable>
      )} />
  );
}

const fmtSets = (sets: { a: number; b: number }[]) => `\u2066${(sets ?? []).map((x) => `${x.a}-${x.b}`).join('  ')}\u2069`;

/** A match in the feed: played and live ones on the shared match card; an upcoming one is a short line (who, court, time). */
function FeedCard({ r }: { r: api.FeedRow }) {
  const nav = useNav();
  const upcoming = r.status === 'SCHEDULED' && !(r.sets ?? []).length;
  if (!upcoming) {
    return <MatchCard a={r.a ?? tr('טרם נקבע')} b={r.b ?? tr('טרם נקבע')} sets={r.sets ?? []} status={r.status} winner={r.winner ?? null}
      live={r.status === 'SCHEDULED'} caption={`${r.tournament} · ${r.category}`} when={matchWhen(r.start)} onPress={() => nav.match(r.id)} />;
  }
  return (
    <Pressable style={({ pressed }) => [s.card, pressed && s.pressed]} onPress={() => nav.match(r.id)}>
      <Text style={s.cardT}>{r.a} – {r.b}</Text>
      <Text>{`${r.court ? `${tr('מגרש {c}', { c: r.court })} · ` : ''}${r.start ? new Date(r.start).toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`}</Text>
      <Text style={s.muted}>{r.tournament} · {r.category}</Text>
    </Pressable>
  );
}

function Live() {
  const [n, setN] = useState({ u: 15, r: 15 });
  const { data, err, busy, reload } = useLoad(() => api.live(n.u, n.r), [n.u, n.r]);
  const rows = [...(data?.live ?? []).map((r) => ['l' + r.id, r] as const), ...(data?.upcoming ?? []).map((r) => ['u' + r.id, r] as const), ...(data?.results ?? []).map((r) => ['r' + r.id, r] as const)];
  return (
    <View style={s.pad}>
      <Text style={s.h1}>{tr('משחקים')}</Text>
      <Status err={err} busy={busy} empty={!!data && !rows.length && tr('אין משחקים להצגה')} />
      <FlatList contentContainerStyle={{ paddingBottom: 100 }} data={rows} keyExtractor={(x) => x[0]} onRefresh={reload} refreshing={false} renderItem={({ item }) => <FeedCard r={item[1]} />}
        ListFooterComponent={data?.moreUpcoming || data?.moreResults ? (
          <View style={{ gap: 8 }}>
            {data.moreUpcoming && <Pressable style={s.chip} onPress={() => setN((x) => ({ ...x, u: x.u + 15 }))}><Text style={s.b}>{tr('עוד משחקים קרובים')}</Text></Pressable>}
            {data.moreResults && <Pressable style={s.chip} onPress={() => setN((x) => ({ ...x, r: x.r + 15 }))}><Text style={s.b}>{tr('עוד תוצאות')}</Text></Pressable>}
          </View>
        ) : null} />
    </View>
  );
}

function Rankings() {
  const nav = useNav();
  const [club, setClub] = useState<{ id: string; name: string } | null>(null);
  const [cq, setCq] = useState(''); const [pick, setPick] = useState(false);
  const clubs = useLoad(api.clubs);
  const [g, setG] = useState<'MALE' | 'FEMALE'>('MALE');
  const [age, setAge] = useState<number | undefined>(undefined);
  const PAGE = 50;
  const [rows, setRows] = useState<Awaited<ReturnType<typeof api.rankings>>>([]);
  const [busy, setBusy] = useState(true); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    setBusy(true); setErr(''); setDone(false); setRows([]);
    api.rankings(g, age, club?.id, 0, PAGE).then((r) => { if (live) { setRows(r); setDone(r.length < PAGE); } }).catch((e) => live && setErr(e.message)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [g, age, club?.id]);
  const more = () => {
    if (busy || done) return;
    setBusy(true);
    api.rankings(g, age, club?.id, rows.length, PAGE).then((r) => { setRows((x) => [...x, ...r]); setDone(r.length < PAGE); }).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  const data = rows;
  return (
    <View style={s.pad}>
      <Text style={s.h1}>{tr('דירוג')}</Text>
      <View style={s.row}>{([['MALE', tr('בנים/גברים')], ['FEMALE', tr('בנות/נשים')]] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, g === k && s.chipOn]} onPress={() => setG(k)}><Text style={g === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([[undefined, tr('כללי')], [12, tr('עד 12')], [14, tr('עד 14')], [16, tr('עד 16')], [18, tr('עד 18')]] as const).map(([a, l]) => <Pressable key={l} style={[s.chip, age === a && s.chipOn]} onPress={() => setAge(a)}><Text style={age === a ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
      </View>
      <Pressable style={[s.chip, (pick || !!club) && s.chipOn, { alignSelf: 'flex-start' }]} onPress={() => { if (club) { setClub(null); setPick(false); } else setPick(!pick); }}><Text style={(pick || !!club) ? s.chipOnT : s.b}>{club ? `✕ ${club.name}` : tr('מועדון')}</Text></Pressable>
      {pick && !club && <View style={{ gap: 8 }}>
        <TextInput style={[s.input, startAlign()]} placeholder={tr('חיפוש מועדון')} placeholderTextColor={T.muted} value={cq} onChangeText={setCq} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(clubs.data ?? []).filter((c) => !cq.trim() || c.name.includes(cq.trim())).slice(0, 15).map((c) => <Pressable key={c.id} style={s.chip} onPress={() => { setClub({ id: c.id, name: c.name }); setPick(false); setCq(''); }}><Text style={s.b}>{c.name}</Text></Pressable>)}
        </View>
      </View>}
      <Status err={err} busy={busy} empty={!!data && !data.length && tr('אין עדיין נתוני דירוג')} />
      <FlatList contentContainerStyle={{ paddingBottom: 100 }} data={data} keyExtractor={(r) => r.playerId} onEndReached={more} onEndReachedThreshold={0.6} initialNumToRender={12} windowSize={7} renderItem={({ item }) => (
        <Pressable style={({ pressed }) => [s.card, s.row, pressed && s.pressed]} onPress={() => nav.player(item.playerId)}><Text style={s.num}>{item.rank}</Text><Text style={[s.b, { flex: 1 }]}>{item.name}</Text><Text style={s.b}>{item.points}</Text></Pressable>
      )} />
    </View>
  );
}

/** A player as the website's search shows them: photo (or initials), boy/girl/man/woman, age and club. */
const PlayerCard = memo(function PlayerCard({ p }: { p: api.PlayerRow }) {
  const nav = useNav();
  const kind = p.gender === 'FEMALE' ? ((p.age ?? 99) < 18 ? 'בת' : 'אישה') : p.gender === 'MALE' ? ((p.age ?? 99) < 18 ? 'בן' : 'גבר') : '';
  const line = [kind && tr(kind), p.age != null ? `${tr('גיל')} ${p.age}` : p.birthYear ? String(p.birthYear) : ''].filter(Boolean).join(' · ');
  return (
    <Pressable style={({ pressed }) => [s.card, s.row, { flexWrap: 'nowrap', gap: 12 }, pressed && s.pressed]} onPress={() => nav.player(p.id)}>
      <Avatar uri={p.photo ?? null} name={p.name} />
      <View style={{ flex: 1 }}>
        <Text style={s.b}>{p.name}</Text>
        {!!line && <Text style={s.muted}>{line}</Text>}
        {!!p.club && <Text style={s.muted}>{p.club}</Text>}
      </View>
      {p.rank != null && <Text style={[s.b, { fontSize: 18 }]}>{`#${p.rank}`}</Text>}
    </Pressable>
  );
});

function Players() {
  const [q, setQ] = useState('');
  const [g, setG] = useState<'MALE' | 'FEMALE' | undefined>(undefined);
  const [age, setAge] = useState<number | undefined>(undefined);
  const [rows, setRows] = useState<api.PlayerRow[]>([]);
  const [busy, setBusy] = useState(true); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  const PAGE = 50;
  useEffect(() => {
    let live = true;
    setBusy(true); setErr(''); setDone(false);
    api.players(q, 0, PAGE, { g, age }).then((r) => { if (live) { setRows(r); setDone(r.length < PAGE); } }).catch((e) => live && setErr(e.message)).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [q, g, age]);
  const more = () => {
    if (busy || done) return;
    setBusy(true);
    api.players(q, rows.length, PAGE, { g, age }).then((r) => { setRows((x) => [...x, ...r]); setDone(r.length < PAGE); }).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  const data = rows;
  return (
    <View style={s.pad}>
      <Text style={s.h1}>{tr('שחקנים')}</Text>
      <TextInput style={[s.input, startAlign()]} placeholder={tr('חיפוש שחקן לפי שם')} placeholderTextColor={T.muted} value={q} onChangeText={setQ} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {([[undefined, tr('בנים ובנות')], ['MALE', tr('בנים/גברים')], ['FEMALE', tr('בנות/נשים')]] as const).map(([k, l]) => <Pressable key={l} style={[s.chip, g === k && s.chipOn]} onPress={() => setG(k)}><Text style={g === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
        {([[undefined, tr('כל הגילאים')], [12, tr('עד 12')], [14, tr('עד 14')], [16, tr('עד 16')], [18, tr('עד 18')]] as const).map(([k, l]) => <Pressable key={l} style={[s.chip, age === k && s.chipOn]} onPress={() => setAge(k)}><Text style={age === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}
      </View>
      <Status err={err} busy={busy} empty={!!data && !data.length && tr('לא נמצאו שחקנים')} />
      <FlatList contentContainerStyle={{ paddingBottom: 100 }} data={data} keyExtractor={(p) => p.id} onEndReached={more} onEndReachedThreshold={0.6} renderItem={({ item }) => <PlayerCard p={item} />} />
    </View>
  );
}

const DAY = 864e5;
/** Ready-made searches for when nothing has been typed yet, as on the website's search page. */
const SHORTCUTS: [string, string, string, (x: api.TournamentRow) => boolean, number][] = [
  ['recent', 'תחרויות בשנה האחרונה', 'מהחדשה לישנה', (x) => +new Date(x.endDate) >= Date.now() - 365 * DAY && +new Date(x.startDate) <= Date.now() + 365 * DAY, -1],
  ['open', 'הרשמה פתוחה וקרובות', 'מה אפשר לעשות עכשיו', (x) => x.status === 'REGISTRATION_OPEN' || (+new Date(x.startDate) >= Date.now() && ['REGISTRATION_CLOSED', 'DRAWN', 'IN_PROGRESS'].includes(x.status)), 1],
  ['masters', 'מאסטרס ובוגרים', 'בשנה האחרונה, בלי קשר לגיל', (x) => ['MASTERS', 'ADULTS'].includes(x.section) && +new Date(x.endDate) >= Date.now() - 365 * DAY, -1],
];

/** One box over players, clubs and competitions (the website's search page). */
function Search({ initial, onOpen }: { initial: string; onOpen: (id: string) => void }) {
  const nav = useNav();
  const [q, setQ] = useState(initial);
  const [show, setShow] = useState('');
  const ts = useLoad(api.tournaments); const cl = useLoad(api.clubs);
  const [mine, setMine] = useState<Set<string>>(new Set());
  useEffect(() => { api.me().then((m) => setMine(new Set(m.entries.map((e) => e.tournament)))).catch(() => {}); }, []);
  const [ps, setPs] = useState<api.PlayerRow[]>([]);
  const term = q.trim();
  useEffect(() => {
    if (!term) { setPs([]); return; }
    let live = true;
    const h = setTimeout(() => api.players(term, 0, 20).then((r) => live && setPs(r)).catch(() => {}), 250);
    return () => { live = false; clearTimeout(h); };
  }, [term]);
  const shortcuts = mine.size ? [...SHORTCUTS, ['mine', 'התחרויות שלי', 'של השחקנים בחשבון', (x: api.TournamentRow) => mine.has(x.name), -1] as (typeof SHORTCUTS)[number]] : SHORTCUTS;
  const sc = shortcuts.find((x) => x[0] === show);
  const tours = term ? (ts.data ?? []).filter((x) => x.name.includes(term)).slice(0, 20)
    : sc ? (ts.data ?? []).filter(sc[3]).sort((a, b) => sc[4] * (+new Date(a.startDate) - +new Date(b.startDate))).slice(0, 60) : [];
  const clubs = term ? (cl.data ?? []).filter((c) => c.name.includes(term)).slice(0, 20) : [];
  const dm = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 110, gap: 10 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>{tr('חיפוש')}</Text>
      <TextInput style={[s.input, startAlign()]} placeholder={tr('שם שחקן, מועדון או תחרות')} placeholderTextColor={T.muted} value={q} onChangeText={setQ} autoFocus={!initial} returnKeyType="search" />
      {!term && <View style={{ gap: 8 }}>
        {shortcuts.map(([k, l, hint]) => <Pressable key={k} style={({ pressed }) => [s.card, show === k && s.cardOn, pressed && s.pressed]} onPress={() => setShow(show === k ? '' : k)}><Text style={s.b}>{tr(l)}</Text><Text style={s.muted}>{tr(hint)}</Text></Pressable>)}
      </View>}
      <Status err={ts.err} busy={ts.busy && (!!term || !!sc)} empty={!!term && !ts.busy && !cl.busy && !tours.length && !clubs.length && !ps.length && tr('לא נמצא דבר')} />
      {!!ps.length && <><Text style={s.h2}>{tr('שחקנים')}</Text>{ps.map((p) => <PlayerCard key={p.id} p={p} />)}</>}
      {!!clubs.length && <><Text style={s.h2}>{tr('מועדונים')}</Text>{clubs.map((c) => <Pressable key={c.id} style={({ pressed }) => [s.card, pressed && s.pressed]} onPress={() => nav.club(c.id)}><Text style={s.b}>{c.name}</Text><Text style={s.muted}>{c.city ? `${c.city} · ` : ''}{tr('{n} שחקנים', { n: c.players })}</Text></Pressable>)}</>}
      {!!tours.length && <><Text style={s.h2}>{term ? tr('תחרויות') : tr(sc?.[1] ?? '')}</Text>{tours.map((x) => <Pressable key={x.id} style={({ pressed }) => [s.card, pressed && s.pressed]} onPress={() => onOpen(x.id)}><Text style={s.b}>{x.name}</Text><Text style={s.muted}>{`${tr(STATUS_HE[x.status] ?? x.status)} · ${dm(x.startDate)}`}</Text></Pressable>)}</>}
    </ScrollView>
  );
}

/** Where my player stands in this competition: category, next match and latest results; the registration details fold away. */
function MyPlayerBlock({ d, me, parts, people, onSwitch, showInfo, onToggleInfo }: { d: NonNullable<Awaited<ReturnType<typeof api.tournament>>>; me: api.HomePerson; parts: api.Participant[]; people: api.HomePerson[]; onSwitch: (id: string) => void; showInfo: boolean; onToggleInfo: () => void }) {
  const catNames = [...new Set(parts.map((x) => d.categories.find((c) => c.id === x.categoryId)?.name).filter(Boolean))].join(' · ');
  const mineMs = d.matches.filter((m) => parts.some((x) => x.categoryId === m.categoryId) && ((m.a.name ?? '').includes(me.name) || (m.b.name ?? '').includes(me.name)));
  const iAmA = (m: api.Match) => (m.a.name ?? '').includes(me.name);
  const live = d.tournament.status !== 'FINISHED' && d.tournament.status !== 'CANCELLED';
  const next = mineMs.filter((m) => live && m.status === 'SCHEDULED' && m.a.id && m.b.id && (!m.start || +new Date(m.start) >= Date.now() - 864e5)).sort((x, y) => +new Date(x.start ?? '9999') - +new Date(y.start ?? '9999'))[0];
  const played = mineMs.filter((m) => m.status !== 'SCHEDULED' && m.status !== 'VOID' && m.winnerEntryId).sort((x, y) => +new Date(y.start ?? 0) - +new Date(x.start ?? 0)).slice(0, 3);
  const showScore = (m: api.Match) => `\u2066${(m.sets ?? []).map((z) => (iAmA(m) ? `${z.a}-${z.b}` : `${z.b}-${z.a}`)).join('  ')}\u2069`;
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar uri={parts[0]?.photo ?? null} name={me.name} />
        <View style={{ flex: 1 }}><Text style={s.cardT}>{me.name}</Text><Text style={s.muted}>{tr('רשום: {cats}', { cats: catNames })}</Text></View>
      </View>
      {people.length > 1 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{people.map((x) => <Pressable key={x.id} style={[s.chip, x.id === me.id && s.chipOn]} onPress={() => onSwitch(x.id)}><Text style={x.id === me.id ? s.chipOnT : s.b}>{x.name.split(' ')[0]}</Text></Pressable>)}</View>}
      {next && <Text style={s.muted}><Text style={s.b}>{tr('המשחק הבא:')} </Text>{`${(iAmA(next) ? next.b.name : next.a.name) ?? tr('יתברר')}${next.start ? ` · ${new Date(next.start).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}${next.court ? ` · ${tr('מגרש {c}', { c: next.court })}` : ''}`}</Text>}
      {played.map((m) => {
        const won = !!m.winnerEntryId && m.winnerEntryId === (iAmA(m) ? m.a.id : m.b.id);
        return <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: won ? T.okbg : T.badbg }}><Text style={{ color: won ? T.ok : T.bad, fontWeight: '700', fontSize: 12.5 }}>{won ? tr('ניצחון') : tr('הפסד')}</Text></View><Text style={[s.b, { flex: 1 }]} numberOfLines={1}>{(iAmA(m) ? m.b.name : m.a.name) ?? ''}</Text><Text style={s.muted}>{showScore(m)}</Text></View>;
      })}
      <Pressable style={s.link} onPress={onToggleInfo}><Text style={s.linkT}>{showInfo ? tr('▲ הסתרת פרטי הרשמה') : tr('▼ פרטי התחרות והרשמה')}</Text></Pressable>
    </View>
  );
}

/** A player's Loglig photo, or their initial when there is none or the file is missing. */
function Avatar({ uri, name }: { uri: string | null; name: string }) {
  const [bad, setBad] = useState(false);
  if (uri && !bad) return <Image source={{ uri }} style={s.avatar} onError={() => setBad(true)} />;
  return <View style={[s.avatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: T.volt }]}><Text style={{ color: T.ink, fontWeight: '800', fontSize: 20 }}>{name.trim().charAt(0)}</Text></View>;
}

const NO_MATCHES: api.Match[] = [];
function Tournament({ id, focus, onBack, onGoAccount }: { id: string; focus?: Focus; onBack: () => void; onGoAccount: () => void }) {
  const nav = useNav();
  const canScore = api.canScore();
  const [d, setD] = useState<Awaited<ReturnType<typeof api.tournament>> | null>(null);
  const [score, setScore] = useState<api.Match | null>(null);
  const load = () => api.tournament(id).then(setD);
  const [photos, setPhotos] = useState<{ id: string; caption: string | null }[]>([]);
  const [following, setFollowing] = useState(false); const [fErr, setFErr] = useState('');
  const [fg, setFg] = useState(''); const [fage, setFage] = useState(''); const [fcat, setFcat] = useState('');
  useEffect(() => { load(); }, [id]);
  // a signed-in player or parent lands on their own category: gender, age group and category are chosen for them (they can change it)
  const [auto, setAuto] = useState(false);
  const [people, setPeople] = useState<api.HomePerson[]>([]); const [meId, setMeId] = useState(''); const [showInfo, setShowInfo] = useState(false);
  const [allParts, setAllParts] = useState(false);
  const [asList, setAsList] = useState(false); // knockout draws show as trees; the list is a tap away
  const [picked, setPicked] = useState(false); // a category chip was tapped (else the category came from the filters or my player)
  // choose gender, age group and category for one of my players: the one they are entered in, else the youngest age group that fits
  const applyFor = (p: api.HomePerson) => {
    if (!d) return;
    setMeId(p.id);
    const ageOf = (n: string) => Number((n.match(/(\d{2})/) ?? [])[1] ?? 0);
    const entered = (d.participants ?? []).find((q) => q.id === p.id);
    const fit = (entered ? d.categories.find((k) => k.id === entered.categoryId) : undefined)
      ?? d.categories.filter((k) => (k.gender === 'OPEN' || k.gender === p.gender) && ageOf(k.name) >= p.age).sort((a, b) => ageOf(a.name) - ageOf(b.name))[0];
    setPicked(false);
    if (!fit || (fit.gender !== 'MALE' && fit.gender !== 'FEMALE')) { setFg(''); setFage(''); setFcat(''); return; }
    setFg(fit.gender); setFage(ageOf(fit.name) ? String(ageOf(fit.name)) : ''); setFcat(fit.id);
  };
  // arriving from a player's page: that player is the focus, whoever is viewing
  useEffect(() => {
    if (!d || !focus || auto) return;
    setAuto(true);
    applyFor({ id: focus.id, gender: focus.gender, age: focus.age } as api.HomePerson);
  }, [d, id]);
  useEffect(() => {
    if (!d || auto || focus || !api.isAuthed()) return;
    setAuto(true);
    api.myHome().then((h) => {
      setPeople(h.people);
      const p = h.people.find((x) => (d.participants ?? []).some((q) => q.id === x.id)) ?? h.people[0];
      if (p) applyFor(p);
    }).catch(() => {});
  }, [d, id]);
  useEffect(() => {
    api.gallery(id).then(setPhotos).catch(() => {});
    if (api.isAuthed()) api.follows().then((f) => setFollowing(f.some((x) => x.kind === 'TOURNAMENT' && x.target === id))).catch(() => {});
  }, [id]);
  const toggle = () => {
    if (!api.isAuthed()) { setFErr(tr('כדי לעקוב אחרי תחרות יש להתחבר בלשונית חשבון.')); return; }
    setFErr(''); api.toggleFollow('TOURNAMENT', id).then((r) => setFollowing(r.following)).catch((e) => setFErr(e.message));
  };
  // Trees to show: a tapped category alone; otherwise the whole age group of the chosen category (or of the gender + age filters),
  // since one event can be split into a group stage, a playoff tree and a qualifying draw.
  const treeCats = (() => {
    if (!d) return [];
    const ageOfC = (n: string) => (n.match(/(\d{2})/) ?? [])[1] ?? '';
    const hasKo = (id: string) => d.matches.some((m) => m.categoryId === id && m.stage === 'KO');
    const shown = d.categories.filter((c) => (!fg || c.gender === fg) && (!fage || ageOfC(c.name) === fage));
    const base = fcat ? d.categories.find((c) => c.id === fcat) : fg && fage ? shown[0] : undefined;
    if (!base) return [];
    if (picked && hasKo(base.id)) return [base];
    const order = (c: api.Cat) => (c.id === base.id ? 0 : /פלייאוף|גמר/.test(c.name) ? 1 : 2);
    return d.categories.filter((c) => c.gender === base.gender && ageOfC(c.name) === ageOfC(base.name) && hasKo(c.id)).sort((a, b) => order(a) - order(b));
  })();
  const treeIds = new Set(treeCats.map((c) => c.id));
  // knockout matches per category, computed once per load, so every tree gets the same array between renders
  const koByCat = useMemo(() => {
    const m = new Map<string, api.Match[]>();
    for (const x of d?.matches ?? []) if (x.stage === 'KO') { const l = m.get(x.categoryId); if (l) l.push(x); else m.set(x.categoryId, [x]); }
    return m;
  }, [d]);
  const onScoreTap = useCallback((m: api.Match) => { if (m.a.id && m.b.id) setScore(m); }, []);
  const [moreTrees, setMoreTrees] = useState(false);
  const treeKey = treeCats.map((c) => c.id).join(',');
  const listData = useMemo(() => (d?.matches ?? []).filter((m) => {
    // the trees already show these categories' knockout matches: the list keeps the group stages
    if (!asList && m.stage === 'KO' && treeIds.has(m.categoryId)) return false;
    if (fcat) return m.categoryId === fcat;
    if (!fg && !fage) return true;
    const c = d?.categories.find((x) => x.id === m.categoryId);
    return !!c && (!fg || c.gender === fg) && (!fage || ((c.name.match(/(\d{2})/) ?? [])[1] ?? '') === fage);
  }), [d, asList, treeKey, fcat, fg, fage]);
  if (score) return <Score m={score} onDone={() => { setScore(null); load(); }} />;
  return (
      <FlatList style={s.pad} contentContainerStyle={{ paddingBottom: 100, gap: 10 }} ListHeaderComponent={<View style={{ gap: 10 }}>
      <Pressable onPress={onBack}><Text style={s.b}>{tr('→ חזרה')}</Text></Pressable>
      <Text style={s.h1}>{d?.tournament.name}</Text>
      <Pressable style={[s.chip, following && s.chipOn, { alignSelf: 'flex-start' }]} onPress={toggle}><Text style={following ? s.chipOnT : s.b}>{following ? tr('★ במעקב') : tr('☆ מעקב')}</Text></Pressable>
      {!!fErr && <Text style={s.err}>{fErr}</Text>}
      {photos.length > 0 && (
        <FlatList horizontal data={photos} keyExtractor={(p) => p.id} style={{ flexGrow: 0, flexShrink: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}
          renderItem={({ item }) => <View><Image source={{ uri: api.photoUrl(item.id) }} style={s.photo} />{!!item.caption && <Text style={s.muted}>{item.caption}</Text>}</View>} />
      )}
      {(() => {
        const me = people.find((x) => x.id === meId);
        const myParts = me ? (d?.participants ?? []).filter((x) => x.id === me.id) : [];
        if (!d || !me || !myParts.length) return null;
        return <MyPlayerBlock d={d} me={me} parts={myParts} people={people} onSwitch={(pid) => { const q = people.find((x) => x.id === pid); if (q) applyFor(q); }} showInfo={showInfo} onToggleInfo={() => setShowInfo(!showInfo)} />;
      })()}
      {d && d.tournament.status === 'REGISTRATION_OPEN' && (!people.find((x) => x.id === meId) || !(d.participants ?? []).some((x) => x.id === meId) || showInfo) && (d.tournament.registerUrl
        ? <View style={s.card}>
            <Text style={s.cardT}>{tr('הרשמה לתחרות')}</Text>
            <Text style={s.muted}>{tr('ההרשמה מתבצעת באתר Loglig ונפתחת בדפדפן.')}{d.tournament.registrationCloses ? ` ${tr('נסגרת ב-{date}.', { date: new Date(d.tournament.registrationCloses).toLocaleDateString(locale()) })}` : ''}</Text>
            <Pressable style={s.btn} onPress={() => Linking.openURL(d.tournament.registerUrl!)}><Text style={s.btnT}>{tr('להרשמה')}</Text></Pressable>
          </View>
        : <RegisterBox tournamentName={d.tournament.name} categories={d.categories} onGoAccount={onGoAccount} />)}
      {d && !d.matches.length && !(d.participants ?? []).some((x) => x.id === meId) && <Text style={s.muted}>{tr('לוח המשחקים והתוצאות יופיעו כאן אחרי ההגרלה.')}</Text>}
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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {chip(!fg, tr('בנים ובנות'), () => { setFg(''); setFcat(''); setPicked(false); }, 'g0')}
              {chip(fg === 'MALE', tr('בנים'), () => { setFg('MALE'); setFcat(''); setPicked(false); }, 'g1')}
              {chip(fg === 'FEMALE', tr('בנות'), () => { setFg('FEMALE'); setFcat(''); setPicked(false); }, 'g2')}
              {chip(!fage, tr('כל הגילאים'), () => { setFage(''); setFcat(''); setPicked(false); }, 'a0')}
              {ages.map((a) => chip(fage === a, tr('גיל {n}', { n: a }), () => { setFage(a); setFcat(''); setPicked(false); }, 'a' + a))}
            </View>
            <ScrollView style={{ maxHeight: 176 }} nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {chip(!fcat, tr('כל הקטגוריות'), () => { setFcat(''); setPicked(false); }, 'c0')}
              {shownCats.map((c) => chip(fcat === c.id, c.name, () => { setFcat(c.id); setPicked(true); }, c.id))}
            </ScrollView>
          </View>
        );
      })()}
      {(() => {
        const cats = d?.categories ?? [];
        const ageOf = (n: string) => (n.match(/(\d{2})/) ?? [])[1] ?? '';
        const shown = (d?.participants ?? []).filter((x) => {
          if (fcat) return x.categoryId === fcat;
          const c = cats.find((k) => k.id === x.categoryId);
          return !!c && (!fg || c.gender === fg) && (!fage || ageOf(c.name) === fage);
        });
        if (!shown.length) return null;
        return (
          <View style={{ gap: 8 }}>
            <Text style={s.h2}>{tr('משתתפים ({n})', { n: shown.length })}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(allParts ? shown : shown.slice(0, 18)).map((x) => (
                <Pressable key={x.categoryId + x.id} onPress={() => nav.player(x.id)} style={{ width: '30%', alignItems: 'center', gap: 4 }}>
                  <Avatar uri={x.photo} name={x.name} />
                  <Text style={[s.b, { fontSize: 13, textAlign: 'center' }]} numberOfLines={2}>{x.name}</Text>
                  {!fcat && cats.length > 1 && <Text style={[s.muted, { fontSize: 11 }]} numberOfLines={1}>{cats.find((k) => k.id === x.categoryId)?.name}</Text>}
                </Pressable>
              ))}
            </View>
            {shown.length > 18 && <Pressable style={[s.chip, { alignSelf: 'flex-start' }]} onPress={() => setAllParts(!allParts)}><Text style={s.b}>{allParts ? tr('הצג פחות') : tr('הצג את כל המשתתפים ({n})', { n: shown.length })}</Text></Pressable>}
          </View>
        );
      })()}
      {(() => {
        if (!treeCats.length) return null;
        const me = people.find((x) => x.id === meId)?.name ?? focus?.name;
        return (
          <View style={{ gap: 10 }}>
            <View style={s.row}>
              <Pressable style={[s.chip, !asList && s.chipOn]} onPress={() => setAsList(false)}><Text style={!asList ? s.chipOnT : s.b}>{tr('עץ התחרות')}</Text></Pressable>
              <Pressable style={[s.chip, asList && s.chipOn]} onPress={() => setAsList(true)}><Text style={asList ? s.chipOnT : s.b}>{tr('רשימת משחקים')}</Text></Pressable>
            </View>
            {!asList && (moreTrees ? treeCats : treeCats.slice(0, 1)).map((c) => (
              <View key={c.id} style={{ gap: 6 }}>
                {treeCats.length > 1 && <Text style={s.b}>{c.name}</Text>}
                <Bracket matches={koByCat.get(c.id) ?? NO_MATCHES} me={me} onPress={canScore ? onScoreTap : undefined} />
              </View>
            ))}
            {!asList && treeCats.length > 1 && <Pressable style={[s.chip, { alignSelf: 'flex-start' }]} onPress={() => setMoreTrees(!moreTrees)}><Text style={s.b}>{moreTrees ? tr('הצג פחות') : tr('עוד עצים ({n})', { n: treeCats.length - 1 })}</Text></Pressable>}
          </View>
        );
      })()}
      </View>}
        data={listData}
        keyExtractor={(m) => m.id} initialNumToRender={12}
        renderItem={({ item: m }) => {
          const done = m.status !== 'SCHEDULED' && m.status !== 'VOID';
          const win = m.winnerEntryId ? (m.winnerEntryId === m.a.id ? 'a' : m.winnerEntryId === m.b.id ? 'b' : null) : null;
          const cat = d?.categories.find((x) => x.id === m.categoryId)?.name;
          const meName = people.find((x) => x.id === meId)?.name ?? focus?.name;
          const mineSide = meName ? (m.a.name === meName ? 'a' : m.b.name === meName ? 'b' : undefined) : undefined;
          const where = m.status === 'SCHEDULED' ? (m.court ? tr('מגרש {c}', { c: m.court }) : tr('טרם שובץ')) : '';
          return (
            <MatchCard a={m.a.name ?? tr('טרם נקבע')} b={m.b.name ?? tr('טרם נקבע')} sets={done ? m.sets ?? [] : []} status={m.status} winner={win}
              caption={[fcat ? '' : cat, where].filter(Boolean).join(' · ') || undefined} when={matchWhen(m.start)} mine={mineSide}
              onPress={m.a.id && m.b.id && api.canScore() ? () => setScore(m) : undefined} />
          );
        }} />
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
        <Text style={s.cardT}>{tr('הרשמה לתחרות')}</Text>
        <Text style={s.muted}>{tr('כדי להירשם יש להתחבר או ליצור חשבון, ולהוסיף שחקן.')}</Text>
        <Pressable style={s.btn} onPress={onGoAccount}><Text style={s.btnT}>{tr('כניסה / הרשמה')}</Text></Pressable>
      </View>
    );
  }
  if (!me) return err ? <Text style={s.err}>{err}</Text> : <ActivityIndicator color={T.blue} style={{ margin: 8 }} />;
  if (!me.players.length) {
    return (
      <View style={s.card}>
        <Text style={s.cardT}>{tr('הרשמה לתחרות')}</Text>
        <Text style={s.muted}>{tr('אין עדיין שחקן בחשבון. הוסיפו שחקן (או ילד/ה) כדי להירשם.')}</Text>
        <Pressable style={s.btn} onPress={onGoAccount}><Text style={s.btnT}>{tr('הוספת שחקן')}</Text></Pressable>
      </View>
    );
  }
  const entered = (cat: string, player: string) => me.entries.some((e) => e.tournament === tournamentName && e.category === cat && e.player === player);
  const register = (cat: api.Cat, p: MePlayer) => {
    setErr(''); setMsg('');
    if (me?.isChild) { api.suggestEntry(cat.id).then(() => setMsg(tr('ההצעה להירשם ל{cat} נשלחה להורה', { cat: cat.name }))).catch((e) => setErr(e.message)); return; }
    api.enter(cat.id, p.id).then(() => { setMsg(tr('{name} נרשם/ה ל{cat}', { name: p.name, cat: cat.name })); load(); }).catch((e) => setErr(e.message));
  };
  return (
    <View style={s.card}>
      <Text style={s.cardT}>{tr('הרשמה לתחרות')}</Text>
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
                <Text style={s.b}>{done ? `✓ ${tr('רשום/ה: {cat}', { cat: c.name })}` : ok ? `${tr(me.isChild ? 'הצעה להורה' : 'הרשמה')}: ${c.name}` : `${c.name} (${why(c, p)})`}</Text>
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
    try { await api.uploadDocument(playerId, type, { uri: a.uri, name: a.fileName ?? 'doc.jpg', mime: a.mimeType ?? 'image/jpeg' }); setMsg(tr('המסמך הועלה וממתין לאישור')); load(); } catch (e) { setErr((e as Error).message); }
  };
  const child = !!d?.isChild;
  const register = (cat: string, pid: string) => (child ? api.suggestEntry(cat).then(() => setMsg(tr('ההצעה נשלחה להורה'))) : api.enter(cat, pid).then(() => { setMsg(tr('נרשמתם לקטגוריה')); load(); })).catch((e) => setErr(e.message));
  const pay = (entryId: string) => api.checkout(entryId).then((r) => Linking.openURL(r.url)).catch((e) => setErr(e.message));
  return (
    <ScrollView ref={scrollRef} contentContainerStyle={s.scroll}>
      <View style={s.row}><Text style={s.h1}>{tr('האזור שלי')}</Text><Pressable onPress={onLogout}><Text style={s.b}>{tr('יציאה')}</Text></Pressable></View>
      {!!err && <Text style={s.err}>{err}</Text>}{!!msg && <Text style={s.ok}>{msg}</Text>}
      {api.canScore() && <View style={s.card}><Text style={s.cardT}>{tr('הזנת תוצאות')}</Text><Text style={s.muted}>{tr('היכנסו ללשונית תחרויות, בחרו תחרות ולחצו על משחק כדי להזין תוצאה או לעדכן תוצאה חיה.')}</Text></View>}
      {!child && <AddPlayer preset={preset} onAdded={(m) => { setMsg(m); load(); }} onError={setErr} />}
      {child && <Text style={s.muted}>{tr('זה חשבון צפייה. אפשר לראות תחרויות, דירוגים ותוצאות, ולהציע להורה להירשם.')}</Text>}
      {d?.players.map((p) => (
        <View key={p.id} style={s.card}>
          <Text style={s.b}>{p.name}</Text>
          <Text>{p.documents.ok ? tr('כל המסמכים תקינים') : tr('חסר: {list}', { list: p.documents.missing.map((m) => tr(DOCS.find((x) => x[0] === m)?.[1] ?? m)).join(', ') })}</Text>
          {!child && DOCS.map(([k, l]) => <Pressable key={k} style={s.link} onPress={() => upload(p.id, k)}><Text style={s.linkT}>{tr('העלאת {doc}', { doc: tr(l) })}</Text></Pressable>)}
          {!child && <EditProfile player={p} onDone={(m) => { setMsg(m); load(); }} onError={setErr} />}
          {!child && !p.own && <ChildLogin player={p} onDone={(m) => { setMsg(m); load(); }} onError={setErr} />}
          {open.filter((o) => fits(o, p)).map((o) => <Pressable key={o.categoryId} style={s.link} onPress={() => register(o.categoryId, p.id)}><Text style={s.linkT}>{child ? tr('הצעה להורה') : tr('הרשמה')}: {o.tournament} · {o.category}</Text></Pressable>)}
          {open.length > 0 && open.filter((o) => fits(o, p)).length === 0 && <Text style={s.muted}>{tr('אין כרגע תחרות פתוחה שמתאימה לשחקן הזה.')} {open.map((o) => `${o.tournament} · ${o.category} (${why(o, p)})`).join('; ')}</Text>}
        </View>
      ))}
      <Following onOpenTournament={onOpenTournament} />
      <Text style={s.h2}>{tr('ההרשמות שלי')}</Text>
      {!!d && !d.entries.some((e) => e.status !== 'WITHDRAWN' && e.status !== 'REJECTED') && <Text style={s.muted}>{tr('אין הרשמות פעילות.')}</Text>}
      {d?.entries.filter((e) => e.status !== 'WITHDRAWN' && e.status !== 'REJECTED').map((e) => (
        <View key={e.id} style={s.card}><Text style={s.b}>{e.tournament} · {e.category}</Text><Text>{tr(ENTRY_HE[e.status] ?? e.status)} · {tr(PAY_HE[e.payment] ?? e.payment)}</Text>
          {e.payment === 'UNPAID' && !child && <Pressable style={s.link} onPress={() => pay(e.id)}><Text style={s.linkT}>{tr('לתשלום')}</Text></Pressable>}
          {!child && e.status !== 'WITHDRAWN' && e.status !== 'REJECTED' && e.payment === 'UNPAID' && <Pressable style={s.link} onPress={() => Alert.alert(tr('ביטול הרשמה'), tr('לבטל את ההרשמה של {player} ל{tournament} ({category})?', { player: e.player, tournament: e.tournament, category: e.category }), [{ text: tr('לא'), style: 'cancel' }, { text: tr('ביטול הרשמה'), style: 'destructive', onPress: () => api.cancelEntry(e.id).then(() => { setMsg(tr('ההרשמה בוטלה')); load(); }).catch((x) => setErr(x.message)) }])}><Text style={[s.linkT, { color: T.bad }]}>{tr('ביטול הרשמה')}</Text></Pressable>}</View>
      ))}
      {!!d && d.entries.some((e) => e.status === 'WITHDRAWN' || e.status === 'REJECTED') && <Text style={s.muted}>{tr('הרשמות שבוטלו: {n}', { n: d.entries.filter((e) => e.status === 'WITHDRAWN' || e.status === 'REJECTED').length })}</Text>}
      <Text style={s.h2}>{tr('התראות')}</Text>
      {!!d && !d.notifications.length && <Text style={s.muted}>{tr('אין התראות חדשות.')}</Text>}
      {d?.notifications.map((n) => <View key={n.id} style={s.card}><Text style={s.b}>{n.title}</Text><Text>{n.body}</Text></View>)}
      <Pressable style={[s.btn, s.btnGhost, { marginTop: 16 }]} onPress={() => Alert.alert(tr('התנתקות מכל המכשירים'), tr('החשבון ינותק בכל הטלפונים והדפדפנים, כולל זה. להמשיך?'), [{ text: tr('ביטול'), style: 'cancel' }, { text: tr('התנתקות'), style: 'destructive', onPress: () => api.logoutAll().then(onLogoutAll).catch((e) => setErr(e.message)) }])}><Text style={[s.btnT, { color: T.text }]}>{tr('התנתקות מכל המכשירים')}</Text></Pressable>
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
      <Text style={s.h2}>{tr('המעקב שלי')}</Text>
      {o.players.map((p) => (
        <View key={p.id} style={s.card}>
          <Text style={s.cardT}>{p.name}</Text>
          <Text style={s.muted}>{p.rank ? tr('דירוג #{rank} · {points} נקודות', { rank: p.rank, points: p.points }) : tr('ללא דירוג')}{p.club ? ` · ${p.club}` : ''}</Text>
          {p.next && <Text style={s.b}>{tr('הבא: {vs}', { vs: p.next.vs })}<Text style={s.muted}>{` · ${p.next.competition}`}</Text></Text>}
          {p.recent.length > 0 && <Text style={s.muted}>{p.recent.slice(0, 3).map((r) => `${tr(r.won ? 'ניצחון' : 'הפסד')} ${r.score}`).join(' · ')}</Text>}
        </View>
      ))}
      {o.tournaments.map((x) => <Pressable key={x.id} style={s.card} onPress={() => onOpenTournament(x.id)}><Text style={s.cardT}>{x.name}</Text><Text style={s.muted}>{new Date(x.startDate).toLocaleDateString(locale())} – {new Date(x.endDate).toLocaleDateString(locale())}</Text></Pressable>)}
      {o.clubs.map((c) => <View key={c.id} style={s.card}><Text style={s.cardT}>{c.name}</Text></View>)}
    </View>
  );
}

/** Fix a profile's details, or remove it from the account. Mirrors the server rules (history is kept, an empty profile is deleted). */
function EditProfile({ player, onDone, onError }: { player: { id: string; first: string; last: string; birth: string; gender: 'MALE' | 'FEMALE'; synced: boolean; name: string }; onDone: (msg: string) => void; onError: (e: string) => void }) {
  const [openForm, setOpenForm] = useState(false);
  const [first, setFirst] = useState(player.first); const [last, setLast] = useState(player.last); const [birth, setBirth] = useState(player.birth);
  const [gender, setGender] = useState(player.gender);
  if (!openForm) return <Pressable style={s.link} onPress={() => setOpenForm(true)}><Text style={s.linkT}>{tr('עריכת פרטים או מחיקה')}</Text></Pressable>;
  const save = () => { onError(''); api.updatePlayer(player.id, { first: first.trim(), last: last.trim(), birth: birth.trim(), gender }).then(() => { setOpenForm(false); onDone(tr('הפרטים עודכנו')); }).catch((e) => onError(e.message)); };
  const remove = () => Alert.alert(tr('מחיקת פרופיל'), tr('להסיר את {name} מהחשבון? פרופיל בלי הרשמות ותוצאות נמחק לגמרי. אם יש היסטוריה, הוא מוסר מהחשבון ונשאר ברשומות האיגוד.', { name: player.name }), [
    { text: tr('ביטול'), style: 'cancel' },
    { text: tr('מחיקה'), style: 'destructive', onPress: () => api.removePlayer(player.id).then((r) => { setOpenForm(false); onDone(r.deleted ? tr('הפרופיל נמחק') : tr('הפרופיל הוסר מהחשבון')); }).catch((e) => onError(e.message)) },
  ]);
  return (
    <View style={{ gap: 8 }}>
      {player.synced ? <Text style={s.muted}>{tr('הפרופיל מסונכרן ממערכת האיגוד, לשינוי פרטים יש לפנות לאיגוד.')}</Text> : <>
        <TextInput style={[s.input, startAlign()]} placeholder={tr('שם פרטי')} placeholderTextColor={T.muted} value={first} onChangeText={setFirst} />
        <TextInput style={[s.input, startAlign()]} placeholder={tr('שם משפחה')} placeholderTextColor={T.muted} value={last} onChangeText={setLast} />
        <TextInput style={[s.input, startAlign()]} placeholder={tr('תאריך לידה (YYYY-MM-DD)')} placeholderTextColor={T.muted} keyboardType="numbers-and-punctuation" value={birth} onChangeText={setBirth} />
      <View style={s.row}>{([['MALE', tr('בן / גבר')], ['FEMALE', tr('בת / אישה')]] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, gender === k && s.chipOn]} onPress={() => setGender(k)}><Text style={gender === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}</View>
        <Pressable style={s.btn} onPress={save}><Text style={s.btnT}>{tr('שמירה')}</Text></Pressable>
      </>}
      <Pressable style={[s.btn, s.btnGhost]} onPress={remove}><Text style={[s.btnT, { color: T.bad }]}>{tr('מחיקת פרופיל')}</Text></Pressable>
      <Pressable style={s.link} onPress={() => setOpenForm(false)}><Text style={s.linkT}>{tr('סגירה')}</Text></Pressable>
    </View>
  );
}

/** A parent creates (or resets) a child's login: a user name and a password, no email. */
function ChildLogin({ player, onDone, onError }: { player: { id: string; childLogin: string | null }; onDone: (msg: string) => void; onError: (e: string) => void }) {
  const [openForm, setOpenForm] = useState(false);
  const [u, setU] = useState(player.childLogin ?? ''); const [pw, setPw] = useState('');
  if (!openForm) return <Pressable style={s.link} onPress={() => setOpenForm(true)}><Text style={s.linkT}>{player.childLogin ? tr('כניסה לילד/ה: {login} · עדכון סיסמה', { login: player.childLogin }) : tr('יצירת כניסה לילד/ה')}</Text></Pressable>;
  const save = () => {
    onError('');
    api.setChildLogin(player.id, u.trim(), pw).then((r) => { setOpenForm(false); setPw(''); onDone(tr('הכניסה של הילד/ה מוכנה. שם משתמש: {user}', { user: r.username })); }).catch((e) => onError(e.message));
  };
  return (
    <View style={{ gap: 8 }}>
      <TextInput style={[s.input, startAlign()]} placeholder={tr('שם משתמש (אנגלית)')} placeholderTextColor={T.muted} autoCapitalize="none" autoCorrect={false} value={u} onChangeText={setU} />
      <TextInput style={[s.input, startAlign()]} placeholder={tr('סיסמה (10 תווים, אותיות וספרות)')} placeholderTextColor={T.muted} secureTextEntry value={pw} onChangeText={setPw} />
      <View style={s.row}><Pressable style={[s.btn, { flex: 1 }]} onPress={save}><Text style={s.btnT}>{tr('שמירה')}</Text></Pressable><Pressable style={s.chip} onPress={() => setOpenForm(false)}><Text style={s.b}>{tr('ביטול')}</Text></Pressable></View>
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
  o.gender !== 'OPEN' && o.gender !== p.gender ? (o.gender === 'MALE' ? tr('לבנים/גברים בלבד') : tr('לבנות/נשים בלבד'))
    : o.minBirthYear && p.birthYear < o.minBirthYear ? tr('שנת לידה {y} ואילך', { y: o.minBirthYear }) : tr('שנת לידה עד {y}', { y: o.maxBirthYear });

function AddPlayer({ onAdded, onError, preset }: { onAdded: (msg: string) => void; onError: (e: string) => void; preset?: 'self' | 'child' | null }) {
  const [openForm, setOpenForm] = useState(!!preset);
  const [first, setFirst] = useState(''); const [last, setLast] = useState(''); const [birth, setBirth] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE'); const [child, setChild] = useState(preset === 'child'); const [nid, setNid] = useState('');
  if (!openForm) return <Pressable style={s.btn} onPress={() => setOpenForm(true)}><Text style={s.btnT}>{tr('+ הוספת שחקן')}</Text></Pressable>;
  const save = () => {
    onError('');
    api.addPlayer({ first: first.trim(), last: last.trim(), birth: birth.trim(), gender, forChild: child, ...(nid.trim() ? { nationalId: nid.trim() } : {}) })
      .then((r) => { setOpenForm(false); setFirst(''); setLast(''); setBirth(''); setNid(''); onAdded(r.pending ? tr('נמצא שחקן קיים שאי אפשר לחבר אוטומטית. הבקשה נשלחה לאישור האיגוד') : r.linkedExisting ? tr('נמצא שחקן קיים באיגוד, והוא חובר לחשבון שלך עם הדירוג וההיסטוריה') : tr('הפרופיל נוצר')); }).catch((e) => onError(e.message));
  };
  return (
    <View style={s.card}>
      <Text style={s.cardT}>{tr('הוספת שחקן')}</Text>
      <TextInput style={[s.input, startAlign()]} placeholder={tr('שם פרטי')} placeholderTextColor={T.muted} value={first} onChangeText={setFirst} />
      <TextInput style={[s.input, startAlign()]} placeholder={tr('שם משפחה')} placeholderTextColor={T.muted} value={last} onChangeText={setLast} />
      <TextInput style={[s.input, startAlign()]} placeholder={tr('תאריך לידה (YYYY-MM-DD)')} placeholderTextColor={T.muted} keyboardType="numbers-and-punctuation" value={birth} onChangeText={setBirth} />
      <TextInput style={[s.input, startAlign()]} placeholder={tr('ת״ז (אופציונלי, נשמר מוצפן. מזרז שיוך שחקן קיים)')} placeholderTextColor={T.muted} keyboardType="number-pad" value={nid} onChangeText={setNid} />
      <View style={s.row}>{([['MALE', tr('בן / גבר')], ['FEMALE', tr('בת / אישה')]] as const).map(([k, l]) => <Pressable key={k} style={[s.chip, gender === k && s.chipOn]} onPress={() => setGender(k)}><Text style={gender === k ? s.chipOnT : s.b}>{l}</Text></Pressable>)}</View>
      <Pressable style={[s.chip, child && s.chipOn, { alignSelf: 'flex-start' }]} onPress={() => setChild(!child)}><Text style={child ? s.chipOnT : s.b}>{child ? '✓ ' : ''}{tr('זה ילד/ה שלי (הורה נרשם עבור ילד)')}</Text></Pressable>
      <View style={s.row}><Pressable style={[s.btn, { flex: 1 }]} onPress={save}><Text style={s.btnT}>{tr('שמירה')}</Text></Pressable><Pressable style={[s.chip, { minHeight: 54 }]} onPress={() => setOpenForm(false)}><Text style={s.b}>{tr('ביטול')}</Text></Pressable></View>
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
      <Pressable onPress={onDone}><Text style={s.b}>{tr('ביטול ←')}</Text></Pressable>
      <Text style={s.h1}>{tr('הזנת תוצאה')}</Text>
      {!!err && <Text style={s.err}>{err}</Text>}
      {g.map((set, i) => (
        <View key={i} style={s.card}>
          <Text>{i === 2 ? tr('סופר-טייברייק') : tr('סט {n}', { n: i + 1 })}</Text>
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
      <Pressable style={s.btn} onPress={save}><Text style={s.btnT}>{tr('שמירה')}</Text></Pressable>
      <Pressable style={[s.btn, s.btnGhost]} onPress={() => api.sendLive(m.id, g.map(([a, b], i) => ({ a: a as number, b: b as number, ...(i === 2 ? { superTb: true } : {}) })).filter((x) => x.a || x.b)).then(onDone).catch((e) => setErr(e.message))}><Text style={[s.btnT, { color: T.text }]}>{tr('עדכון תוצאה חיה · המשחק נמשך')}</Text></Pressable>
      <Text style={s.b}>{tr('ווק-אובר: מי לא הגיע')}</Text>
      {([m.a, m.b] as const).map((p, k) => p.id && (
        <View key={k} style={s.card}>
          <Text style={s.b}>{p.name}</Text>
          {([['NO_NOTICE', tr('לא הגיע, ללא הודעה')], ['NOTICE', tr('הודיע מראש')], ['NOTICE_MEDICAL', tr('הודיע + אישור רפואי')]] as const).map(([reason, label]) => (
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
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 12, marginTop: 6, marginBottom: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: T.surface, borderWidth: 1, borderColor: T.glassLine },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, brand: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: T.text },
  langBtn: { minWidth: 44, height: 40, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: T.line2, alignItems: 'center', justifyContent: 'center' }, langBtnT: { color: T.text, fontWeight: '700', fontSize: 15 },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingVertical: 6 },
  topEnd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  burger: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.bg, borderWidth: 1, borderColor: T.line, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(12,18,16,0.35)' },
  menu: { position: 'absolute', top: 64, left: 12, right: 12, backgroundColor: T.surface, borderRadius: 24, borderWidth: 1, borderColor: T.line, paddingVertical: 8, elevation: 12, shadowColor: '#0C1210', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  menuRow: { paddingVertical: 13, paddingHorizontal: 20, marginHorizontal: 6, borderRadius: 14 }, menuOn: { backgroundColor: T.volt },
  menuT: { fontSize: 17, fontWeight: '600', color: T.text }, menuOnT: { color: T.ink, fontWeight: '800' },
  menuSep: { height: 1, backgroundColor: T.line, marginVertical: 6, marginHorizontal: 20 },
  hsearch: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.surface, borderRadius: 999, paddingStart: 16, paddingEnd: 5, marginTop: 12, minHeight: 52 },
  hsearchIn: { flex: 1, color: T.text, fontSize: 16, textAlign: 'right', paddingVertical: 8 },
  hsearchBtn: { backgroundColor: T.volt, borderRadius: 999, paddingHorizontal: 18, height: 42, alignItems: 'center', justifyContent: 'center' }, hsearchBtnT: { color: T.ink, fontWeight: '800' },
  cardOn: { borderColor: T.ink, borderWidth: 2 },
  topAv: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.volt, alignItems: 'center', justifyContent: 'center' }, topAvT: { color: T.ink, fontWeight: '800', fontSize: 17 },
  topLogin: { paddingHorizontal: 18, height: 40, borderRadius: 20, backgroundColor: T.btn, alignItems: 'center', justifyContent: 'center' }, topLoginT: { color: T.btnText, fontWeight: '700' },
  feat: { backgroundColor: T.volt, borderRadius: 28, padding: 22, gap: 8 }, featHead: { flexDirection: 'row', alignItems: 'center', gap: 8 }, featDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.ink },
  featSmall: { color: T.ink, fontWeight: '700', fontSize: 13 }, featT: { color: T.ink, fontSize: 28, fontWeight: '800', letterSpacing: -0.8, lineHeight: 32 }, featMeta: { color: '#3A4A12', fontSize: 15 },
  featCount: { flexDirection: 'row', gap: 10, marginVertical: 4 }, featBox: { flex: 1, backgroundColor: T.ink, borderRadius: 20, paddingVertical: 12, alignItems: 'center' },
  featN: { color: T.volt, fontSize: 32, fontWeight: '800' }, featL: { color: '#fff', fontSize: 13 },
  featBtn: { backgroundColor: T.ink, borderRadius: 999, minHeight: 50, alignItems: 'center', justifyContent: 'center' }, featBtnT: { color: T.volt, fontWeight: '800', fontSize: 16 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, minHeight: 112, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 22, padding: 16, justifyContent: 'flex-end', gap: 2 },
  tileOn: { backgroundColor: T.ink, borderColor: T.ink }, tileN: { fontSize: 34, fontWeight: '800', letterSpacing: -1, color: T.text }, tileT: { fontSize: 16, fontWeight: '700', color: T.text },
  hero: { backgroundColor: T.ink, borderRadius: 28, padding: 24, gap: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginBottom: 4 },
  heroBrand: { color: '#fff', fontWeight: '800', fontSize: 20, letterSpacing: -0.4 },
  heroT: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -1.2, lineHeight: 36, marginTop: 8 }, heroS: { color: '#AEBBB4', fontSize: 15, lineHeight: 22 },
  cardT: { fontSize: 18, fontWeight: '700', color: T.text, letterSpacing: -0.2 }, pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  chip2: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: T.surface2, borderWidth: 1, borderColor: T.line }, chip2T: { fontSize: 12.5, fontWeight: '600', color: T.text },
  chipOk: { backgroundColor: T.okbg, borderColor: 'transparent' }, chipLive: { backgroundColor: T.volt, borderColor: 'transparent' },
  photo: { width: 220, height: 150, borderRadius: 20, backgroundColor: T.line },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: T.line, borderWidth: 2, borderColor: T.volt },
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
