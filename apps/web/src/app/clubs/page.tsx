import { GetForm } from '@/components/GetForm';
import Link from 'next/link';
import { db } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import { listClubs } from '@/services/public';

/** "שחקן אחד" / "N שחקנים": the counts are small, so the singular matters. */
const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n.toLocaleString('he-IL')} ${many}`);

export default async function Clubs({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await tr();
  const { q = '' } = await searchParams;
  const needle = q.trim().toLowerCase();
  const all = await listClubs(db);
  // Biggest clubs first. Clubs without players, and "A, B" entries (a player listed under two clubs in the source) with one or two players, only show up when searched for.
  const rows = all
    .filter(({ c, n }) => (needle ? c.name.toLowerCase().includes(needle) || (c.city ?? '').toLowerCase().includes(needle) : n > 0 && !(c.name.includes(',') && n <= 2)))
    .sort((a, b) => b.n - a.n || a.c.name.localeCompare(b.c.name, 'he'));
  return (
    <Shell nav="clubs">
      <h1>{t('מועדונים')}</h1>
      <p className="muted">{needle ? `${rows.length} ${t('מועדונים')}` : `${rows.length} ${t('מועדונים עם שחקנים, מהגדול לקטן')}`}</p>
      <GetForm className="row" style={{ margin: '12px 0' }}>
        <input name="q" defaultValue={q} placeholder={t('חיפוש מועדון או עיר')} aria-label={t('חיפוש מועדון או עיר')} style={{ flex: 1, minWidth: 200 }} />
        <button className="btn">{t('חיפוש')}</button>
        {needle && <Link className="btn ghost" href="/clubs">{t('ניקוי')}</Link>}
      </GetForm>
      <div className="grid cols">
        {rows.map(({ c, n }) => {
          const phone = (c.info as { phone?: string } | null)?.phone;
          return (
            <Link key={c.id} href={`/clubs/${c.id}`} className="card grid" style={{ gap: 4 }}>
              <strong style={{ fontSize: 17 }}>{t(c.name)}</strong>
              <span className="muted">{[c.city, n ? count(n, t('שחקן אחד'), t('שחקנים')) : t('אין שחקנים רשומים'), phone].filter(Boolean).join(' · ')}</span>
            </Link>
          );
        })}
        {!rows.length && <div className="card muted">{needle ? t('לא נמצאו מועדונים. נסו שם או עיר אחרים.') : t('אין מועדונים.')}</div>}
      </div>
    </Shell>
  );
}
