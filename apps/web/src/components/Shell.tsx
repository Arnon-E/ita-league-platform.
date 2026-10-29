import Link from 'next/link';
import type { ReactNode } from 'react';
import { getActor } from '@/lib/session';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { stopImpersonationAction } from '@/app/actions3';
import { setLangAction } from '@/app/actions7';
import { getLang, tr } from '@/lib/i18n';
import { NavMenu } from './NavMenu';
import { BallMark } from './Brand';

export async function Shell({ children, nav }: { children: ReactNode; nav?: string }) {
  const t = await tr();
  const lang = await getLang();
  const actor = await getActor();
  const [u] = actor ? await db.select().from(schema.users).where(eq(schema.users.id, actor.id)) : [];
  const l = (href: string, label: string, key: string) => <Link href={href} className={nav === key ? 'on' : ''}>{t(label)}</Link>;
  return (
    <>
      {actor?.impersonatedBy && <form action={stopImpersonationAction} style={{ background: 'var(--lime)', padding: '8px 24px', display: 'flex', gap: 12, alignItems: 'center' }}><strong>מצב התחזות: {u?.name}</strong><button className="btn small">חזרה לחשבון שלי</button></form>}
      <header className="top">
        <Link href="/" className="brand" aria-label={t('איגוד הטניס בישראל')}><BallMark />ITA</Link>
        <NavMenu label={t('תפריט')}>
          <div className="navmain">{l('/', 'תחרויות', 'home')}{l('/live', 'משחקים', 'live')}{l('/rankings', 'דירוג', 'rank')}{l('/players', 'שחקנים', 'players')}{l('/clubs', 'מועדונים', 'clubs')}{l('/leagues', 'ליגות', 'leagues')}{l('/abroad', 'תחרויות חו"ל', 'abroad')}<details className="adm"><summary>{t('עוד')}</summary><div>{l('/regulations', 'תקנונים', 'regs')}{l('/stats', 'סטטיסטיקות', 'stats')}{l('/about', 'אודות', 'about')}</div></details></div>
          <div className="navacct">
            <Link href="/search" className={`srch ${nav === 'search' ? 'on' : ''}`} aria-label={t('חיפוש')}><Ico d="M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4" /><span className="lbl">{t('חיפוש')}</span></Link>
            {actor && ['SUPER_ADMIN', 'FEDERATION_ADMIN'].includes(actor.role) && <details className="adm"><summary>{t('ניהול')}</summary><div>{l('/admin/messages', 'הודעות', 'messages')}{l('/admin/reports', 'דוחות', 'reports')}{l('/admin/documents', 'מסמכים', 'docs')}{l('/admin/import', 'ייבוא', 'import')}{l('/admin/venues', 'מתקנים', 'venues')}{l('/admin/users', 'משתמשים', 'users')}{l('/admin/claims', 'שיוך שחקנים', 'claims')}{l('/admin/rules', 'חוקים', 'rules')}{l('/admin/audit', 'ביקורת', 'audit')}</div></details>}
            {!actor && <><Link href="/login" className="only-m">{t('כניסה')}</Link><Link href="/register" className="only-m reg">{t('הצטרפות')}</Link></>}
          </div>
        </NavMenu>
        {actor && (
          <details className="adm acct bar">
            <summary aria-label={u?.name ?? t('החשבון שלי')}><span className="av" aria-hidden>{(u?.name ?? '?').trim().split(/\s+/).map((w) => w.charAt(0)).slice(0, 2).join('').toUpperCase()}</span><span className="uname">{u?.name}</span></summary>
            <div>
              <div className="whoami"><strong>{u?.name}</strong><span className="muted">{u?.email.endsWith('@kid.ita.invalid') ? u.email.split('@')[0] : u?.email}</span></div>
              {l('/me', 'פרטים אישיים והרשמות', 'me')}{l('/following', 'המעקב שלי', 'following')}
              <form action="/logout" method="post"><button className="out">{t('יציאה')}</button></form>
              <form action="/logout?all=1" method="post"><button className="out soft">{t('התנתקות מכל המכשירים')}</button></form>
            </div>
          </details>
        )}
        {!actor && <span className="row"><Link className="btn small ghost" href="/login">{t('כניסה')}</Link><Link className="btn small" href="/register">{t('הצטרפות')}</Link></span>}
        <form action={setLangAction}><input type="hidden" name="lang" value={lang === 'en' ? 'he' : 'en'} /><button className="btn small ghost" title="Language" style={{ minWidth: 44 }}>{lang === 'en' ? 'עב' : 'EN'}</button></form>
      </header>
      <main>{children}</main>
      <footer className="sitefoot">
        <div>
          <span className="brand"><BallMark size={24} />ITA</span>
          <nav aria-label={t('ניווט תחתון')}>
            <Link href="/">{t('תחרויות')}</Link><Link href="/rankings">{t('דירוג')}</Link><Link href="/clubs">{t('מועדונים')}</Link><Link href="/regulations">{t('תקנונים')}</Link><Link href="/about">{t('אודות')}</Link>
          </nav>
          <span>{t('איגוד הטניס בישראל')}</span>
        </div>
      </footer>
      <nav className="tabbar" aria-label={t('ניווט מהיר')}>
        <Link href="/" className={nav === 'home' ? 'on' : ''}><Ico d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />{t('בית')}</Link>
        <Link href="/live" className={nav === 'live' ? 'on' : ''}><Ico d="M3 5h18v14H3zM12 5v14M3 12h18" />{t('משחקים')}</Link>
        <Link href="/rankings" className={nav === 'rank' ? 'on' : ''}><Ico d="M5 20V10M12 20V4M19 20v-7" />{t('דירוג')}</Link>
        <Link href="/players" className={nav === 'players' ? 'on' : ''}><Ico d="M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c.7-3.5 3.5-5 7-5s6.3 1.5 7 5M17 4.2a3.5 3.5 0 010 6.6M18 15c2 .6 3.4 2.2 4 5" />{t('שחקנים')}</Link>
        <Link href="/search" className={nav === 'search' ? 'on' : ''}><Ico d="M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4" />{t('חיפוש')}</Link>
      </nav>
    </>
  );
}

function Ico({ d }: { d: string }) {
  return <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

export function Flash({ err, ok }: { err?: string; ok?: string }) {
  return <>{err && <div className="err" role="alert">{err}</div>}{ok && <div className="okmsg">{ok}</div>}</>;
}
