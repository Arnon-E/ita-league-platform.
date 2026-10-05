import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireActor } from '@/lib/session';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';

export async function Shell({ children, nav }: { children: ReactNode; nav?: string }) {
  const actor = await requireActor();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, actor.id));
  const l = (href: string, label: string, key: string) => <Link href={href} className={nav === key ? 'on' : ''}>{label}</Link>;
  return (
    <>
      <header className="top">
        <span className="brand">ITA</span>
        <nav>{l('/', 'תחרויות', 'home')}{l('/rankings', 'דירוג', 'rank')}{l('/me', 'האזור שלי', 'me')}{['SUPER_ADMIN', 'FEDERATION_ADMIN'].includes(actor.role) && <>{l('/admin/documents', 'מסמכים', 'docs')}{l('/admin/import', 'ייבוא', 'import')}</>}</nav>
        <span className="muted" style={{ color: '#C9D6E8' }}>{u?.name}</span>
        <form action="/logout" method="post"><button className="btn small ghost">יציאה</button></form>
      </header>
      <main>{children}</main>
    </>
  );
}

export function Flash({ err, ok }: { err?: string; ok?: string }) {
  return <>{err && <div className="err" role="alert">{err}</div>}{ok && <div className="okmsg">{ok}</div>}</>;
}
