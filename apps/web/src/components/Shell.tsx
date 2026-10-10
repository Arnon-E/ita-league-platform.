import Link from 'next/link';
import type { ReactNode } from 'react';
import { getActor } from '@/lib/session';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { stopImpersonationAction } from '@/app/actions3';
import { setLangAction } from '@/app/actions7';
import { getLang, tr } from '@/lib/i18n';

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
        <span className="brand">ITA</span>
        <nav>{l('/', 'תחרויות', 'home')}{l('/live', 'משחקים', 'live')}{l('/leagues', 'ליגות', 'leagues')}{l('/rankings', 'דירוג', 'rank')}{l('/players', 'שחקנים', 'players')}{l('/clubs', 'מועדונים', 'clubs')}{l('/stats', 'סטטיסטיקות', 'stats')}{l('/search', 'חיפוש', 'search')}{actor && l('/me', 'האזור שלי', 'me')}{actor && ['SUPER_ADMIN', 'FEDERATION_ADMIN'].includes(actor.role) && <details className="adm"><summary>{t('ניהול')}</summary><div>{l('/admin/messages', 'הודעות', 'messages')}{l('/admin/reports', 'דוחות', 'reports')}{l('/admin/documents', 'מסמכים', 'docs')}{l('/admin/import', 'ייבוא', 'import')}{l('/admin/venues', 'מתקנים', 'venues')}{l('/admin/users', 'משתמשים', 'users')}{l('/admin/rules', 'חוקים', 'rules')}{l('/admin/audit', 'ביקורת', 'audit')}</div></details>}</nav>
        {actor ? <>
          <span className="uname">{u?.name}</span>
          <form action="/logout" method="post"><button className="btn small ghost">{t('יציאה')}</button></form>
        </> : <span className="row"><Link className="btn small ghost" href="/login">{t('כניסה')}</Link><Link className="btn small" href="/register">{t('הרשמה')}</Link></span>}
        <form action={setLangAction}><input type="hidden" name="lang" value={lang === 'en' ? 'he' : 'en'} /><button className="btn small ghost" title="Language" style={{ minWidth: 44 }}>{lang === 'en' ? 'עב' : 'EN'}</button></form>
      </header>
      <main>{children}</main>
    </>
  );
}

export function Flash({ err, ok }: { err?: string; ok?: string }) {
  return <>{err && <div className="err" role="alert">{err}</div>}{ok && <div className="okmsg">{ok}</div>}</>;
}
