import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as api from './api';
import { Head, Wait, dm, st, useData } from './Detail';
import { T } from './theme';
import { startAlign, tr } from './i18n';

/** Admin desk screens that were website-only: messages, venues, audit log, reports, rule set, import. */
type Run = (p: Promise<unknown>, after?: () => void) => void;
function useRun() {
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const run: Run = (p, after) => { setErr(''); setMsg(''); p.then(() => { setMsg(tr('נשמר')); after?.(); }).catch((e) => setErr(e.message)); };
  const note = <>{!!msg && <Text style={st.ok}>{msg}</Text>}{!!err && <Text style={st.err}>{err}</Text>}</>;
  return { run, note, setMsg, setErr };
}
const Input = ({ ph, v, set, multiline, mono, secure, lines }: { ph: string; v: string; set: (x: string) => void; multiline?: boolean; mono?: boolean; secure?: boolean; lines?: number }) => (
  <TextInput style={[st.input, startAlign(), multiline && { minHeight: 24 * (lines ?? 5), paddingTop: 12, textAlignVertical: 'top' }, mono && { fontFamily: 'monospace', fontSize: 13, textAlign: 'left' }]}
    placeholder={ph} placeholderTextColor={T.muted} value={v} onChangeText={set} multiline={multiline} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} />
);
const Btn = ({ label, on, primary }: { label: string; on: () => void; primary?: boolean }) => (
  <Pressable style={[st.chip, primary && st.chipOn]} onPress={on}><Text style={primary ? st.chipOnT : st.b}>{label}</Text></Pressable>
);

export function AdminMessages({ onBack }: { onBack: () => void }) {
  const t = useData(() => api.adminMessageTargets(), []);
  const { run, note } = useRun();
  const [aud, setAud] = useState<'ALL' | 'CLUB' | 'TOURNAMENT'>('ALL'); const [id, setId] = useState('');
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [q, setQ] = useState(''); const [sent, setSent] = useState('');
  const list = aud === 'CLUB' ? t.data?.clubs : aud === 'TOURNAMENT' ? t.data?.tournaments : [];
  const shown = (list ?? []).filter((x) => !q.trim() || x.name.includes(q.trim())).slice(0, 12);
  const send = () => { setSent(''); api.adminBroadcast(aud, id, title, body).then((r) => { setSent(tr('ההודעה נשלחה ל-{n} נמענים', { n: r.sent })); setTitle(''); setBody(''); }).catch((e) => run(Promise.reject(e))); };
  return (
    <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
      <Head title={tr('הודעות')} onBack={onBack} />
      <Wait err={t.err} busy={t.busy} />
      {note}{!!sent && <Text style={st.ok}>{sent}</Text>}
      <View style={[st.row, { flexWrap: 'wrap' }]}>
        {([['ALL', 'כל המשתמשים'], ['CLUB', 'שחקני מועדון'], ['TOURNAMENT', 'משתתפי תחרות']] as const).map(([k, l]) => <Btn key={k} label={tr(l)} primary={aud === k} on={() => { setAud(k); setId(''); }} />)}
      </View>
      {aud !== 'ALL' && <>
        <Input ph={tr('חיפוש')} v={q} set={setQ} />
        <View style={[st.row, { flexWrap: 'wrap' }]}>{shown.map((x) => <Btn key={x.id} label={x.name} primary={id === x.id} on={() => setId(x.id)} />)}</View>
      </>}
      <Input ph={tr('כותרת')} v={title} set={setTitle} />
      <Input ph={tr('תוכן')} v={body} set={setBody} multiline lines={5} />
      <Pressable style={st.btn} onPress={send}><Text style={st.btnT}>{tr('שליחה')}</Text></Pressable>
    </ScrollView>
  );
}

export function AdminVenues({ onBack }: { onBack: () => void }) {
  const v = useData(() => api.adminVenues(), []); const { run, note } = useRun();
  const [name, setName] = useState(''); const [city, setCity] = useState(''); const [names, setNames] = useState<Record<string, string>>({});
  const reload = () => api.adminVenues().then(v.set).catch(() => {});
  return (
    <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
      <Head title={tr('מתקנים ומגרשים')} onBack={onBack} />
      <Wait err={v.err} busy={v.busy} />{note}
      <View style={st.card}>
        <Input ph={tr('שם המתקן')} v={name} set={setName} /><Input ph={tr('עיר')} v={city} set={setCity} />
        <Btn primary label={tr('הוספת מתקן')} on={() => run(api.adminVenueOp({ op: 'venue', name, city }), () => { setName(''); setCity(''); reload(); })} />
      </View>
      {(v.data ?? []).map((x) => (
        <View key={x.id} style={st.card}>
          <Text style={st.b}>{x.name}</Text><Text style={st.muted}>{x.city ?? ''}</Text>
          <View style={[st.row, { flexWrap: 'wrap' }]}>{x.courts.map((c) => <View key={c} style={st.chip}><Text style={st.b}>{c}</Text></View>)}</View>
          <Input ph={tr('מגרשים: 1, 2, 3')} v={names[x.id] ?? ''} set={(s) => setNames((n) => ({ ...n, [x.id]: s }))} />
          <View style={st.row}>
            <Btn label={tr('הוספה')} on={() => run(api.adminVenueOp({ op: 'courts', venue: x.id, names: names[x.id] ?? '' }), () => { setNames((n) => ({ ...n, [x.id]: '' })); reload(); })} />
            <Btn label={tr('מחיקת מתקן')} on={() => run(api.adminVenueOp({ op: 'delete', venue: x.id }), reload)} />
          </View>
        </View>
      ))}
      {!v.busy && !(v.data ?? []).length && <Text style={st.muted}>{tr('אין עדיין מתקנים.')}</Text>}
    </ScrollView>
  );
}

export function AdminAudit({ onBack }: { onBack: () => void }) {
  const a = useData(() => api.adminAudit(), []);
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Head title={tr('יומן ביקורת')} onBack={onBack} />
      <Wait err={a.err} busy={a.busy} />
      {(a.data ?? []).map((r) => <View key={r.id} style={st.card}><Text style={st.b}>{r.action}{r.impersonated ? ` · ${tr('התחזות')}` : ''}</Text><Text style={st.muted}>{`${r.entity} · ${new Date(r.at).toLocaleString()}`}</Text></View>)}
    </ScrollView>
  );
}

export function AdminReports({ onBack }: { onBack: () => void }) {
  const { run, note } = useRun(); const [busy, setBusy] = useState('');
  const open = (kind: string) => { setBusy(kind); api.adminReportLink(kind).then((r) => Linking.openURL(api.webUrl(r.url))).catch((e) => run(Promise.reject(e))).finally(() => setBusy('')); };
  return (
    <ScrollView contentContainerStyle={st.pad}>
      <Head title={tr('דוחות')} onBack={onBack} />
      <Text style={st.muted}>{tr('ייצוא לקובץ CSV שנפתח ישירות באקסל.')}</Text>{note}
      {([['players', 'רשימת שחקנים', 'שם, מין, שנת לידה ומועדון לכל שחקן'], ['entries', 'הרשמות לתחרויות', 'כל ההרשמות עם סטטוס ותשלום'], ['results', 'תוצאות משחקים', 'כל המשחקים עם התוצאה והמנצח'], ['points', 'נקודות דירוג', 'היסטוריית חלוקת הנקודות לכל שחקן']] as const).map(([k, l, d]) => (
        <Pressable key={k} style={st.card} onPress={() => open(k)}><Text style={st.b}>{tr(l)}</Text><Text style={st.muted}>{tr(d)}</Text>{busy === k ? <ActivityIndicator color={T.blue} /> : <Text style={st.link}>{tr('הורדת CSV')}</Text>}</Pressable>
      ))}
    </ScrollView>
  );
}

export function AdminRules({ onBack }: { onBack: () => void }) {
  const r = useData(() => api.adminRules(), []); const { run, note } = useRun();
  const [json, setJson] = useState(''); const [name, setName] = useState('');
  useEffect(() => { if (r.data) { setJson(r.data.json); setName(r.data.name); } }, [r.data]);
  return (
    <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
      <Head title={tr('ערכת חוקים')} onBack={onBack} />
      <Wait err={r.err} busy={r.busy} />{note}
      {r.data && <>
        <Text style={st.muted}>{`${tr('גרסה')} ${r.data.version} · ${r.data.verified ? tr('אומתה מול התקנון') : tr('לא אומתה מול התקנון')}`}</Text>
        <Input ph={tr('שם הגרסה')} v={name} set={setName} />
        <Input ph="JSON" v={json} set={setJson} multiline mono lines={14} />
        <Pressable style={st.btn} onPress={() => run(api.adminPublishRules(name, json), () => api.adminRules().then(r.set).catch(() => {}))}><Text style={st.btnT}>{tr('פרסום גרסה חדשה')}</Text></Pressable>
      </>}
    </ScrollView>
  );
}

type Brief = { created: number; updated: number; errors: number; firstErrors: string[] } | null;
export function AdminImport({ onBack }: { onBack: () => void }) {
  const { note, run } = useRun();
  const [kind, setKind] = useState<'players' | 'points' | 'db'>('players'); const [csv, setCsv] = useState(''); const [dry, setDry] = useState(true);
  const [url, setUrl] = useState(''); const [ps, setPs] = useState(''); const [pt, setPt] = useState(''); const [out, setOut] = useState('');
  const fmt = (n: string, x: Brief) => (x ? `${n}: ${tr('נוצרו')} ${x.created}, ${tr('עודכנו')} ${x.updated}, ${tr('שגיאות')} ${x.errors}${x.firstErrors.map((e) => `\n · ${e}`).join('')}` : '');
  const go = () => {
    setOut('');
    api.adminImport(kind === 'db' ? { kind, url, playersSql: ps, pointsSql: pt, dry } : { kind, csv, dry })
      .then((r) => setOut(`${r.dry ? `${tr('בדיקה בלבד (ללא שמירה)')}\n` : ''}${[fmt(tr('שחקנים'), r.players ?? (kind === 'players' ? r.result ?? null : null)), fmt(tr('היסטוריית נקודות'), r.points ?? (kind === 'points' ? r.result ?? null : null))].filter(Boolean).join('\n')}`))
      .catch((e) => run(Promise.reject(e)));
  };
  return (
    <ScrollView contentContainerStyle={st.pad} keyboardShouldPersistTaps="handled">
      <Head title={tr('ייבוא מלוגליג')} onBack={onBack} />
      {note}{!!out && <Text style={st.ok}>{out}</Text>}
      <View style={[st.row, { flexWrap: 'wrap' }]}>{([['players', 'שחקנים'], ['points', 'היסטוריית נקודות'], ['db', 'ייבוא ישיר ממסד הנתונים של לוגליג']] as const).map(([k, l]) => <Btn key={k} label={tr(l)} primary={kind === k} on={() => setKind(k)} />)}</View>
      {kind !== 'db' ? <Input ph={tr('הדבקת CSV')} v={csv} set={setCsv} multiline mono lines={8} /> : <>
        <Input ph="mysql://readonly:***@host:3306/loglig" v={url} set={setUrl} mono secure />
        <Input ph={tr('שאילתת שחקנים')} v={ps} set={setPs} multiline mono lines={4} />
        <Input ph={tr('שאילתת נקודות (אחרי השחקנים)')} v={pt} set={setPt} multiline mono lines={4} />
      </>}
      <Btn label={`${dry ? '✓ ' : ''}${tr('בדיקה בלבד (ללא שמירה)')}`} primary={dry} on={() => setDry(!dry)} />
      <Pressable style={st.btn} onPress={go}><Text style={st.btnT}>{tr('הרצה')}</Text></Pressable>
    </ScrollView>
  );
}
