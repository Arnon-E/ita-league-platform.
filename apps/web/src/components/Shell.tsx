import Link from 'next/link';
import type { ReactNode } from 'react';
import { getActor } from '@/lib/session';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';
import { stopImpersonationAction } from '@/app/actions3';

export async function Shell({ children, nav }: { children: ReactNode; nav?: string }) {
  const actor = await getActor();
  const [u] = actor ? await db.select().from(schema.users).where(eq(schema.users.id, actor.id)) : [];
  const l = (href: string, label: string, key: string) => <Link href={href} className={nav === key ? 'on' : ''}>{label}</Link>;
  return (
    <>
      {actor?.impersonatedBy && <form action={stopImpersonationAction} style={{ background: 'var(--lime)', padding: '8px 24px', display: 'flex', gap: 12, alignItems: 'center' }}><strong>מצב התחזות: {u?.name}</strong><button className="btn small">חזרה לחשבון שלי</button></form>}
      <header className="top">
        <span className="brand">ITA</span>
        <nav>{l('/', 'תחרויות', 'home')}{l('/live', 'משחקים', 'live')}{l('/rankings', 'דירוג', 'rank')}{l('/players', 'שחקנים', 'players')}{l('/clubs', 'מועדונים', 'clubs')}{l('/stats', 'סטטיסטיקות', 'stats')}{actor && l('/me', 'האזור שלי', 'me')}{actor && ['SUPER_ADMIN', 'FEDERATION_ADMIN'].includes(actor.role) && <details className="adm"><summary>ניהול</summary><div>{l('/admin/documents', 'מסמכים', 'docs')}{l('/admin/import', 'ייבוא', 'import')}{l('/admin/venues', 'מתקנים', 'venues')}{l('/admin/users', 'משתמשים', 'users')}{l('/admin/rules', 'חוקים', 'rules')}{l('/admin/audit', 'ביקורת', 'audit')}</div></details>}</nav>
        {actor ? <>
          <span className="uname">{u?.name}</span>
          <form action="/logout" method="post"><button className="btn small ghost">יציאה</button></form>
        </> : <span className="row"><Link className="btn small ghost" href="/login">כניסה</Link><Link className="btn small" href="/register">הרשמה</Link></span>}
      </header>
      <main>{children}</main>
    </>
  );
}

export function Flash({ err, ok }: { err?: string; ok?: string }) {
  return <>{err && <div className="err" role="alert">{err}</div>}{ok && <div className="okmsg">{ok}</div>}</>;
}
