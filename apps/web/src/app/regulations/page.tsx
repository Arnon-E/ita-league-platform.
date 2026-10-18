import { asc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/** Public to everyone: every regulation, procedure and form the federation publishes, grouped by topic. */
export default async function Regulations({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await tr();
  const { q = '' } = await searchParams;
  const all = await db.select().from(schema.regulations).orderBy(asc(schema.regulations.sort), asc(schema.regulations.title));
  const needle = q.trim().toLowerCase();
  const rows = needle ? all.filter((r) => r.title.toLowerCase().includes(needle) || r.category.toLowerCase().includes(needle)) : all;
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  const kind = (u: string) => (/\.pdf(\?|$)/i.test(u) ? 'PDF' : /\.xlsx?(\?|$)/i.test(u) ? 'Excel' : /\.docx?(\?|$)/i.test(u) ? 'Word' : '');
  return (
    <Shell nav="regs">
      <h1>{t('תקנונים ונהלים')}</h1>
      <form className="card row" style={{ margin: '12px 0' }}>
        <input name="q" defaultValue={q} placeholder={t('חיפוש')} style={{ flex: 1, minWidth: 180 }} />
        <button className="btn">{t('חיפוש')}</button>
      </form>
      {[...groups].map(([cat, items]) => (
        <section key={cat}>
          <h2>{t(cat)}</h2>
          <div className="grid cols">
            {items.map((r) => (
              <a key={r.id} className="card grid" style={{ gap: 6 }} href={r.url} target="_blank" rel="noopener noreferrer">
                <strong>{r.title}</strong>
                <span className="muted">{kind(r.url)}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
      {!rows.length && <div className="card muted">{t('אין עדיין מסמכים.')}</div>}
    </Shell>
  );
}
