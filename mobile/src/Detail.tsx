import { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as api from './api';
import { MatchCard, courtText, matchWhen } from './MatchCard';
import { T, Icon } from './theme';
import { AdminAudit, AdminImport, AdminMessages, AdminReports, AdminRules, AdminVenues } from './AdminDesk';
import { locale, startAlign, tr } from './i18n';

/** How a screen opens a player, club, match or tournament (with a player in focus); provided by the app shell. */
export type Focus = { id: string; gender: 'MALE' | 'FEMALE'; age: number; name: string };
export type Nav = { reload: () => void; admin: () => void; player: (id: string) => void; club: (id: string) => void; match: (id: string) => void; tournament: (id: string, focus?: Focus) => void };
export const NavCtx = createContext<Nav>({ reload: () => {}, admin: () => {}, player: () => {}, club: () => {}, match: () => {}, tournament: () => {} });
export const useNav = () => useContext(NavCtx);

export function useData<D>(fn: () => Promise<D>, deps: unknown[]) {
  const [data, setData] = useState<D | null>(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(true);
  useEffect(() => { setBusy(true); setErr(''); fn().then(setData).catch((e) => setErr(e.message)).finally(() => setBusy(false)); }, deps);
  return { data, err, busy, set: setData };
}
export const Wait = ({ err, busy }: { err: string; busy: boolean }) => (busy ? <ActivityIndicator color={T.blue} style={{ margin: 16 }} /> : err ? <Text style={st.err}>{err}</Text> : null);
export const Head = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <View style={st.head}><Pressable onPress={onBack} hitSlop={10}><View style={st.backBtn}><Icon name="back" size={20} color={T.text} /></View></Pressable><Text style={st.h1} numberOfLines={2}>{title}</Text></View>
);
export const dm = (iso: string) => new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });

function FollowBtn({ kind, target }: { kind: 'PLAYER' | 'CLUB'; target: string }) {
  const [on, setOn] = useState(false); const [msg, setMsg] = useState('');
  useEffect(() => { if (api.isAuthed()) api.follows().then((f) => setOn(f.some((x) => x.kind === kind && x.target === target))).catch(() => {}); }, [kind, target]);
  const press = () => {
    if (!api.isAuthed()) { setMsg(tr('כדי לעקוב יש להתחבר בלשונית חשבון.')); return; }
    setMsg(''); api.toggleFollow(kind, target).then((r) => setOn(r.following)).catch((e) => setMsg(e.message));
  };
  return <View style={{ gap: 6 }}><Pressable style={[st.chip, on && st.chipOn, { alignSelf: 'flex-start' }]} onPress={press}><Text style={on ? st.chipOnT : st.b}>{on ? tr('✓ עוקב/ת') : tr('+ מעקב')}</Text></Pressable>{!!msg && <Text style={st.muted}>{msg}</Text>}</View>;
}

export function PlayerScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const nav = useNav();
  const { data: d, err, busy } = useData(() => api.playerProfile(id), [id]);
  const [bad, setBad] = useState(false);
  const focus: Focus | undefined = d ? { id: d.id, gender: d.gender, age: d.age, name: d.name } : undefined;
  const kind = d ? (d.gender === 'FEMALE' ? (d.age < 18 ? 'בת' : 'אישה') : d.age < 18 ? 'בן' : 'גבר') : '';
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Head title={d?.name ?? tr('שחקן')} onBack={onBack} />
      <Wait err={err} busy={busy} />
      {d && <>
        <View style={[st.row, { gap: 14 }]}>
          {d.photo && !bad ? <Image source={{ uri: d.photo }} style={st.avatar} onError={() => setBad(true)} />
            : <View style={[st.avatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: T.volt }]}><Text style={{ color: T.ink, fontWeight: '800', fontSize: 24 }}>{d.name.trim().charAt(0)}</Text></View>}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={st.muted}>{`${tr(kind)} · ${tr('גיל')} ${d.age}`}</Text>
            {d.club && <Pressable onPress={() => nav.club(d.club!.id)}><Text style={st.link}>{d.club.name}</Text></Pressable>}
          </View>
        </View>
        <FollowBtn kind="PLAYER" target={d.id} />
        <View style={st.row}>
          {([[tr('דירוג'), d.rank ? `#${d.rank}` : '—'], [tr('נקודות דירוג'), String(d.points)]] as const).map(([l, v]) => <View key={l} style={[st.card, { flex: 1 }]}><Text style={st.muted}>{l}</Text><Text style={st.big}>{v}</Text></View>)}
        </View>
        <View style={st.row}>
          <View style={[st.card, { flex: 1 }]}><Text style={st.muted}>{tr('ניצחונות / הפסדים')}</Text><Text style={st.big}>{`⁦${d.wins} / ${d.losses}⁩`}</Text></View>
          <View style={[st.card, { flex: 1 }]}><Text style={st.muted}>{tr('תחרויות')}</Text><Text style={st.big}>{d.tournaments.length}</Text></View>
        </View>
        {(d.recent.length > 0 || d.next) && <View style={st.card}>
          {d.recent.length > 0 && <><Text style={st.muted}>{tr('משחקים אחרונים')}</Text><View style={st.row}>{d.recent.map((w, i) => <View key={i} style={[st.form, w ? st.formW : st.formL]}><Text style={[st.formT, { color: w ? T.ok : T.bad }]}>{tr(w ? 'נ' : 'ה')}</Text></View>)}</View></>}
          {d.next && <Pressable onPress={() => nav.tournament(d.next!.id, focus)}><Text style={[st.muted, { marginTop: 6 }]}>{tr('התחרות הבאה')}</Text><Text style={st.link}>{d.next.name}</Text><Text style={st.muted}>{dm(d.next.startDate)}</Text></Pressable>}
        </View>}
        <Text style={st.h2}>{tr('תחרויות')}</Text>
        {d.tournaments.map((t) => <Pressable key={t.id} style={st.card} onPress={() => nav.tournament(t.id, focus)}><Text style={st.b}>{t.name}</Text><Text style={st.muted}>{`${t.cats.join(' · ')} · ${dm(t.startDate)}`}</Text></Pressable>)}
        {!d.tournaments.length && <Text style={st.muted}>{tr('טרם השתתף בתחרויות.')}</Text>}
        <Text style={st.h2}>{tr('משחקים')}</Text>
        {d.matches.map((m) => {
          const mine = m.winner ? (m.won ? m.winner : m.winner === 'a' ? 'b' : 'a') : undefined;
          return <MatchCard key={m.id} a={m.a} b={m.b} sets={m.status === 'SCHEDULED' ? [] : m.sets ?? []} status={m.status} winner={m.winner} mine={mine} caption={`${m.tournament} · ${m.category}`} when={matchWhen(m.start)} onPress={() => nav.match(m.id)} />;
        })}
        {!d.matches.length && <Text style={st.muted}>{tr('אין משחקים.')}</Text>}
        <Text style={st.h2}>{tr('היסטוריית נקודות')}</Text>
        {d.awards.map((a, i) => <View key={i} style={[st.card, st.row, { justifyContent: 'space-between' }]}><Text style={st.b}>{dm(a.date)}</Text><Text style={st.b}>{a.points}</Text></View>)}
        {!d.awards.length && <Text style={st.muted}>{tr('אין נקודות דירוג.')}</Text>}
      </>}
    </ScrollView>
  );
}

export function ClubScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const nav = useNav();
  const { data: d, err, busy } = useData(() => api.clubProfile(id), [id]);
  const i = d?.info;
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Head title={d?.name ?? tr('מועדון')} onBack={onBack} />
      <Wait err={err} busy={busy} />
      {d && <>
        <Text style={st.muted}>{`${d.city ? `${d.city} · ` : ''}${tr('{n} שחקנים', { n: d.players.length })}`}</Text>
        <FollowBtn kind="CLUB" target={d.id} />
        {i && <View style={st.card}>
          {!!i.address && <Text style={st.b}>📍 {i.address}</Text>}
          {!!i.phone && <Pressable onPress={() => Linking.openURL(`tel:${i.phone}`)}><Text style={st.link}>📞 {i.phone}</Text></Pressable>}
          {!!i.email && <Pressable onPress={() => Linking.openURL(`mailto:${i.email}`)}><Text style={st.link}>✉️ {i.email}</Text></Pressable>}
          {!!i.description && <Text style={st.muted}>{i.description}</Text>}
          {!!i.officials?.length && <Text style={st.muted}>{i.officials.map((o) => `${o.name}${o.job ? ` (${o.job})` : ''}`).join(' · ')}</Text>}
          {!!i.teams?.length && <Text style={st.muted}>{tr('קבוצות')}: {i.teams.join(' · ')}</Text>}
        </View>}
        {!!i?.roster?.length && <><Text style={st.h2}>{`${tr('שחקנים רשומים')} (${i.roster.length})`}</Text>
          <View style={st.card}>{i.roster.map((r, k) => <View key={k} style={[st.row, { justifyContent: 'space-between' }]}><Text style={st.b}>{r.name}</Text><Text style={st.muted}>{r.age ?? ''}</Text></View>)}</View></>}
        <Text style={st.h2}>{tr('שחקנים')}</Text>
        {d.players.map((p) => <Pressable key={p.id} style={st.card} onPress={() => nav.player(p.id)}><Text style={st.b}>{p.name}</Text></Pressable>)}
        {!d.players.length && <Text style={st.muted}>{tr('אין שחקנים במועדון.')}</Text>}
      </>}
    </ScrollView>
  );
}

export function MatchScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const nav = useNav();
  const { data: m, err, busy, set } = useData(() => api.matchInfo(id), [id]);
  // a live match refreshes itself, like the website's match page
  useEffect(() => {
    if (!m?.live || m.status !== 'SCHEDULED') return;
    const h = setInterval(() => api.matchInfo(id).then(set).catch(() => {}), 15000);
    return () => clearInterval(h);
  }, [m?.live, m?.status, id]);
  const ready = !!m?.a && !!m?.b;
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Head title={m ? (ready ? `${m.a} – ${m.b}` : m.category) : tr('משחק')} onBack={onBack} />
      <Wait err={err} busy={busy} />
      {m && <>
        <Pressable onPress={() => nav.tournament(m.tournamentId)}><Text style={st.link}>{m.tournament}</Text></Pressable>
        <Text style={st.muted}>{`${m.category} · ${m.stage === 'GROUP' ? `${tr('בית, מחזור')} ${m.round}` : `${tr('הדחה, סיבוב')} ${m.round}`}`}</Text>
        <Text style={st.muted}>{[m.court ? courtText(m.court) : '', matchWhen(m.start) ?? '', m.setsToWin === 2 ? tr('הטוב מ-3 סטים') : `${m.setsToWin} ${tr('סטים')}`].filter(Boolean).join(' · ')}</Text>
        {ready ? <MatchCard a={m.a!} b={m.b!} sets={m.status === 'SCHEDULED' && !m.live ? [] : m.sets ?? []} status={m.status} winner={m.winner} live={m.live && m.status === 'SCHEDULED'} />
          : <View style={st.card}><Text style={st.muted}>{tr('המשחק עדיין לא מוכן: ממתין לסיום משחקים קודמים.')}</Text></View>}
      </>}
    </ScrollView>
  );
}

const DOCS: Record<string, string> = { ID_PHOTO: 'תמונת ת״ז', PARENT_CONSENT: 'אישור הורים', MEDICAL_CERTIFICATE: 'אישור רפואי', OTHER: 'אחר' };
const ROLES: [string, string][] = [['SUPER_ADMIN', 'מנהל על'], ['FEDERATION_ADMIN', 'מנהל איגוד'], ['TOURNAMENT_MANAGER', 'מנהל טורניר'], ['REFEREE', 'שופט'], ['CLUB_MANAGER', 'מנהל מועדון'], ['PLAYER', 'שחקן/הורה']];

function AdminUsers({ onBack }: { onBack: () => void }) {
  const nav = useNav();
  const u = useData(() => api.adminUsers(), []);
  const [q, setQ] = useState(''); const [open, setOpen] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const run = (p: Promise<unknown>) => { setErr(''); setMsg(''); p.then(() => { setMsg(tr('נשמר')); return api.adminUsers().then(u.set); }).catch((e) => setErr(e.message)); };
  const rows = (u.data ?? []).filter((x) => !q.trim() || `${x.name} ${x.email}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  return (
    <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
      <Head title={tr('משתמשים והרשאות')} onBack={onBack} />
      <TextInput style={[st.input, startAlign()]} placeholder={tr('חיפוש לפי שם או אימייל')} placeholderTextColor={T.muted} value={q} onChangeText={setQ} autoCapitalize="none" />
      {!!msg && <Text style={st.ok}>{msg}</Text>}{!!err && <Text style={st.err}>{err}</Text>}
      <Wait err={u.err} busy={u.busy} />
      {rows.map((x) => (
        <View key={x.id} style={st.card}>
          <Pressable onPress={() => setOpen(open === x.id ? '' : x.id)}>
            <Text style={st.b}>{x.name}{x.active ? '' : ` · ${tr('מושבת')}`}</Text><Text style={st.muted}>{x.email} · {tr(ROLES.find((r) => r[0] === x.role)?.[1] ?? x.role)}</Text>
          </Pressable>
          {open === x.id && <View style={{ gap: 8, marginTop: 6 }}>
            <View style={[st.row, { flexWrap: 'wrap' }]}>{ROLES.map(([k, l]) => <Pressable key={k} style={[st.chip, x.role === k && st.chipOn]} onPress={() => x.role !== k && run(api.adminSetRole(x.id, k))}><Text style={x.role === k ? st.chipOnT : st.b}>{tr(l)}</Text></Pressable>)}</View>
            <View style={st.row}>
              <Pressable style={st.chip} onPress={() => run(api.adminSetActive(x.id, !x.active))}><Text style={st.b}>{x.active ? tr('השבתה') : tr('הפעלה')}</Text></Pressable>
              {api.currentRole() === 'SUPER_ADMIN' && !api.isImpersonating() && x.active && <Pressable style={st.chip} onPress={() => api.impersonate(x.id).then(() => nav.reload()).catch((e) => setErr(e.message))}><Text style={st.b}>{tr('התחזות')}</Text></Pressable>}
            </View>
          </View>}
        </View>
      ))}
    </ScrollView>
  );
}

function AdminLinks({ onBack }: { onBack: () => void }) {
  const [q, setQ] = useState(''); const [rows, setRows] = useState<api.AdminLinkRow[]>([]); const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const find = (term: string) => { if (term.trim().length < 2) { setRows([]); return; } setBusy(true); api.adminFindPlayers(term.trim()).then(setRows).catch((e) => setErr(e.message)).finally(() => setBusy(false)); };
  useEffect(() => { const h = setTimeout(() => find(q), 300); return () => clearTimeout(h); }, [q]);
  const run = (p: Promise<unknown>) => { setErr(''); setMsg(''); p.then(() => { setMsg(tr('נשמר')); find(q); }).catch((e) => setErr(e.message)); };
  return (
    <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
      <Head title={tr('שיוך ידני')} onBack={onBack} />
      <TextInput style={[st.input, startAlign()]} placeholder={tr('שם פרטי או משפחה')} placeholderTextColor={T.muted} value={q} onChangeText={setQ} />
      {!!msg && <Text style={st.ok}>{msg}</Text>}{!!err && <Text style={st.err}>{err}</Text>}
      {busy && <ActivityIndicator color={T.blue} />}
      {rows.map((p) => (
        <View key={p.id} style={st.card}>
          <Text style={st.b}>{p.name}</Text><Text style={st.muted}>{dm(p.birth)}</Text>
          {p.account && <View style={st.row}><Text style={[st.muted, { flex: 1 }]}>{p.account.email}</Text><Pressable style={st.chip} onPress={() => run(api.adminUnlink(p.id))}><Text style={st.b}>{tr('ביטול שיוך')}</Text></Pressable></View>}
          {p.guardians.map((g) => <View key={g.userId} style={st.row}><Text style={[st.muted, { flex: 1 }]}>{tr('הורה')}: {g.email}</Text><Pressable style={st.chip} onPress={() => run(api.adminUnlink(p.id, g.userId))}><Text style={st.b}>{tr('ביטול שיוך')}</Text></Pressable></View>)}
          <TextInput style={[st.input, startAlign()]} placeholder={tr('אימייל המשתמש')} placeholderTextColor={T.muted} value={email[p.id] ?? ''} onChangeText={(v) => setEmail((x) => ({ ...x, [p.id]: v }))} autoCapitalize="none" keyboardType="email-address" />
          <View style={st.row}>
            <Pressable style={[st.chip, st.chipOn, { flex: 1 }]} onPress={() => run(api.adminLink(p.id, email[p.id] ?? '', 'self'))}><Text style={st.chipOnT}>{tr('השחקן עצמו')}</Text></Pressable>
            <Pressable style={[st.chip, { flex: 1 }]} onPress={() => run(api.adminLink(p.id, email[p.id] ?? '', 'guardian'))}><Text style={st.b}>{tr('הורה/אפוטרופוס')}</Text></Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** Admin work queue: review documents and link-requests in the app; the desk screens (users, reports, ...) open on the website. */
export function AdminScreen({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState<'' | 'users' | 'links' | 'messages' | 'venues' | 'audit' | 'reports' | 'rules' | 'import'>('');
  const docs = useData(() => api.adminDocuments(), []); const claims = useData(() => api.adminClaims(), []);
  const [note, setNote] = useState<Record<string, string>>({}); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const run = (p: Promise<unknown>, reload: () => void) => { setErr(''); setMsg(''); p.then(() => { setMsg(tr('נשמר')); reload(); }).catch((e) => setErr(e.message)); };
  const reloadDocs = () => api.adminDocuments().then(docs.set).catch(() => {}); const reloadClaims = () => api.adminClaims().then(claims.set).catch(() => {});
  const noteBox = (id: string) => <TextInput style={[st.input, startAlign()]} placeholder={tr('הערה (חובה בדחייה)')} placeholderTextColor={T.muted} value={note[id] ?? ''} onChangeText={(v) => setNote((x) => ({ ...x, [id]: v }))} />;
  if (page === 'users') return <AdminUsers onBack={() => setPage('')} />;
  if (page === 'links') return <AdminLinks onBack={() => setPage('')} />;
  const back = () => setPage('');
  if (page === 'messages') return <AdminMessages onBack={back} />;
  if (page === 'venues') return <AdminVenues onBack={back} />;
  if (page === 'audit') return <AdminAudit onBack={back} />;
  if (page === 'reports') return <AdminReports onBack={back} />;
  if (page === 'rules') return <AdminRules onBack={back} />;
  if (page === 'import') return <AdminImport onBack={back} />;
  return (
    <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
      <Head title={tr('ניהול')} onBack={onBack} />
      <View style={st.row}>
        <Pressable style={[st.card, { flex: 1 }]} onPress={() => setPage('users')}><Text style={st.b}>{tr('משתמשים והרשאות')} ›</Text></Pressable>
        <Pressable style={[st.card, { flex: 1 }]} onPress={() => setPage('links')}><Text style={st.b}>{tr('שיוך ידני')} ›</Text></Pressable>
      </View>
      {!!msg && <Text style={st.ok}>{msg}</Text>}
      {!!err && <Text style={st.err}>{err}</Text>}
      <Text style={st.h2}>{tr('אישור מסמכים')}</Text>
      <Wait err={docs.err} busy={docs.busy} />
      {(docs.data ?? []).map((d) => (
        <View key={d.id} style={st.card}>
          <Text style={st.b}>{d.player}</Text><Text style={st.muted}>{tr(DOCS[d.type] ?? d.type)} · {dm(d.createdAt)}</Text>
          <Pressable onPress={() => Linking.openURL(api.webUrl(d.url))}><Text style={st.link}>{tr('צפייה')}</Text></Pressable>
          {noteBox(d.id)}
          <View style={st.row}>
            <Pressable style={[st.chip, st.chipOn, { flex: 1 }]} onPress={() => run(api.adminReviewDocument(d.id, 'APPROVED', note[d.id]), reloadDocs)}><Text style={st.chipOnT}>{tr('אישור')}</Text></Pressable>
            <Pressable style={[st.chip, { flex: 1 }]} onPress={() => run(api.adminReviewDocument(d.id, 'REJECTED', note[d.id]), reloadDocs)}><Text style={st.b}>{tr('דחייה')}</Text></Pressable>
          </View>
        </View>
      ))}
      {!docs.busy && !docs.err && !(docs.data ?? []).length && <Text style={st.muted}>{tr('אין מסמכים ממתינים.')}</Text>}
      <Text style={st.h2}>{tr('בקשות שיוך')}</Text>
      <Wait err={claims.err} busy={claims.busy} />
      {(claims.data ?? []).map((c) => (
        <View key={c.id} style={st.card}>
          <Text style={st.b}>{c.user}</Text><Text style={st.muted}>{c.email}</Text>
          <Text style={st.muted}>{`${tr('מבקש/ת לשייך:')} ${c.first} ${c.last} · ${dm(c.birth)}${c.forChild ? ` · ${tr('ילד/ה')}` : ''}`}</Text>
          {!!c.reason && <Text style={st.muted}>{tr('הערה')}: {c.reason}</Text>}
          {c.candidate ? <Text style={st.b}>{`${tr('שחקן מועמד:')} ${c.candidate.name} · ${dm(c.candidate.birth)}${c.candidate.linked ? ` · ${tr('כבר משויך לחשבון')}` : ''}`}</Text>
            : <Text style={st.muted}>{tr('לא נמצא שחקן מתאים אוטומטית. אפשר לשייך ידנית.')}</Text>}
          {noteBox(c.id)}
          <View style={st.row}>
            {c.candidate && <Pressable style={[st.chip, st.chipOn, { flex: 1 }]} onPress={() => run(api.adminResolveClaim(c.id, 'APPROVED', note[c.id]), reloadClaims)}><Text style={st.chipOnT}>{tr('אישור ושיוך')}</Text></Pressable>}
            <Pressable style={[st.chip, { flex: 1 }]} onPress={() => run(api.adminResolveClaim(c.id, 'REJECTED', note[c.id]), reloadClaims)}><Text style={st.b}>{tr('דחייה')}</Text></Pressable>
          </View>
        </View>
      ))}
      {!claims.busy && !claims.err && !(claims.data ?? []).length && <Text style={st.muted}>{tr('אין בקשות ממתינות.')}</Text>}
      <Text style={st.h2}>{tr('עוד')}</Text>
      {([['messages', 'הודעות'], ['venues', 'מגרשים'], ['reports', 'דוחות'], ['rules', 'כללי דירוג'], ['import', 'ייבוא'], ['audit', 'יומן פעולות']] as const).map(([k, l]) => <Pressable key={k} style={st.card} onPress={() => setPage(k)}><Text style={st.b}>{tr(l)} ›</Text></Pressable>)}
    </ScrollView>
  );
}

export const st = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: 999, backgroundColor: T.btn, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  btnT: { color: T.btnText, fontSize: 16, fontWeight: '700' },
  input: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line2, borderRadius: 14, paddingHorizontal: 16, minHeight: 48, fontSize: 16, color: T.text },
  ok: { backgroundColor: T.okbg, color: T.ok, padding: 12, borderRadius: 14, overflow: 'hidden' },
  pad: { padding: 16, gap: 10, paddingBottom: 110 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: T.line2, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 28, fontWeight: '800', color: T.text, flexShrink: 1, paddingEnd: 4 },
  h2: { fontSize: 22, fontWeight: '700', color: T.text, letterSpacing: -0.4, marginTop: 8, marginBottom: 2 },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.line, borderRadius: 22, padding: 18, gap: 4 },
  b: { fontSize: 16, fontWeight: '700', color: T.text },
  big: { fontSize: 26, fontWeight: '800', color: T.text },
  muted: { color: T.muted, fontSize: 14 },
  link: { color: T.blue, fontSize: 16, fontWeight: '600', textDecorationLine: 'underline' },
  err: { backgroundColor: T.badbg, color: T.bad, padding: 12, borderRadius: 14, overflow: 'hidden', margin: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: T.line2, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: T.btn, borderColor: T.btn }, chipOnT: { color: T.btnText, fontWeight: '700' },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: T.line, borderWidth: 2, borderColor: T.volt },
  form: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, formW: { backgroundColor: T.okbg }, formL: { backgroundColor: T.badbg }, formT: { fontWeight: '800' },
});
