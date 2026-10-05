import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import { listClubs } from '@/services/public';

export default async function Clubs() {
  const t = await tr();
  const rows = await listClubs(db);
  return (
    <Shell nav="clubs">
      <h1>{t('מועדונים')}</h1>
      <div className="grid cols" style={{ marginTop: 16 }}>
        {rows.map(({ c, n }) => (
          <Link key={c.id} href={`/clubs/${c.id}`} className="card grid" style={{ gap: 4 }}>
            <strong style={{ fontSize: 17 }}>{c.name}</strong><span className="muted">{c.city ?? ''} · {n} {t('שחקנים')}</span>
          </Link>
        ))}
        {!rows.length && <div className="card muted">{t('אין מועדונים.')}</div>}
      </div>
    </Shell>
  );
}
