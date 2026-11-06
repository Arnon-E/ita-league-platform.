import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { Flag } from '@/components/Flag';
import { fmtDate, fmtScore } from '@/components/labels';
import { tr } from '@/lib/i18n';
import { countryInfo } from '@/lib/countries';
import { abroadResultsOfNames, nameKey } from '@/services/abroad-players';

export const dynamic = 'force-dynamic';

const flagUrl = (cc: string) => `https://static.tournamentsoftware.com/content/images/flags/${cc}.svg`;

/** An Israeli player at tournaments abroad, found by the name Tennis Europe writes: for players the site has not linked to a profile (or the federation has not approved yet). */
export default async function AbroadPlayerPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const t = await tr();
  const name = ((await searchParams).n ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const events = name ? await abroadResultsOfNames(db, new Set([nameKey(name)])).catch(() => []) : [];
  const all = events.flatMap((e) => e.matches);
  const wins = all.filter((m) => m.won).length, losses = all.filter((m) => m.played && !m.won).length;
  return (
    <Shell nav="abroad">
      <p style={{ margin: 0 }}><Link href="/abroad" className="muted"><u>{t('חזרה לתחרויות חו"ל')}</u></Link></p>
      <h1 dir="ltr" style={{ marginBottom: 4, textAlign: 'start' }}>{name || '—'}</h1>
      {all.length > 0 && <p className="muted" style={{ margin: 0 }}>{t('ניצחונות')}: <b style={{ color: 'var(--ok)' }}>{wins}</b> · {t('הפסדים')}: <b style={{ color: 'var(--bad)' }}>{losses}</b></p>}
      {events.map(({ event: ev, matches: ms }) => (
        <div key={ev.id} className="card grid" style={{ gap: 8, marginBottom: 10 }}>
          <Link href={`/abroad/${ev.id}`}><strong>{ev.name}</strong></Link>
          <span className="muted"><Flag country={ev.country} /> {[ev.city, t(countryInfo(ev.country).he)].filter(Boolean).join(', ')} · {fmtDate(ev.start)} – {fmtDate(ev.end)}</span>
          {ms.map((m, i) => (
            <div key={i} className="grid" style={{ gap: 0 }}>
              <span dir="ltr" style={{ textAlign: 'start' }}>
                <b style={{ color: m.won ? 'var(--ok)' : m.played ? 'var(--bad)' : undefined }}>{m.won ? 'W' : m.played ? 'L' : '–'}</b>{' '}
                <span style={{ display: 'inline-flex', gap: 3, verticalAlign: 'middle' }}>{m.opponent.cc.map((c, j) => <img key={j} src={flagUrl(c)} width={20} height={15} alt={c} style={{ borderRadius: 2, boxShadow: '0 0 0 1px var(--line)' }} />)}</span>{' '}
                {m.opponent.names.join(' / ') || t('טרם נקבע')} <span className="muted">· {m.draw}{m.stage ? ` · ${m.stage}` : ''}</span>
              </span>
              {m.partner.length > 0 && <span className="muted" dir="ltr" style={{ textAlign: 'start' }}>{t('עם')} {m.partner.join(' / ')}</span>}
              <span className="muted" dir="ltr" style={{ textAlign: 'start' }}>{m.sets.length ? fmtScore(m.sets.map(([a, b]) => ({ a: a ?? 0, b: b ?? 0 }))) : t('טרם שוחק')}</span>
            </div>
          ))}
        </div>
      ))}
      {!events.length && <div className="card muted">{t('לא נמצאו משחקים של השחקן בטורנירים בחו"ל.')}</div>}
      <p className="muted" style={{ marginTop: 18 }}>{t('הנתונים נלקחים מהאתר של Tennis Europe.')}</p>
    </Shell>
  );
}
