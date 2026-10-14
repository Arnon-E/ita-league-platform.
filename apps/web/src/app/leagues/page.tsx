import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { Shell } from '@/components/Shell';
import { tr } from '@/lib/i18n';
import type { LeagueData } from '@/services/loglig-leagues';

export const dynamic = 'force-dynamic';

export default async function Leagues() {
  const t = await tr();
  const all = await db.select().from(schema.externalLeagues).orderBy(desc(schema.externalLeagues.updatedAt));
  const progress = (l: (typeof all)[number]) => {
    const d = l.data as LeagueData;
    const played = d.rounds.reduce((n, r) => n + r.matches.filter((m) => m.done).length, 0);
    const total = d.rounds.reduce((n, r) => n + r.matches.length, 0);
    return { played, total, done: total > 0 && played >= total };
  };
  // leagues still being played come first
  const rows = [...all].sort((a, b) => Number(progress(a).done) - Number(progress(b).done));
  return (
    <Shell nav="leagues">
      <h1>{t('ליגות')}</h1>
      <div className="grid cols">
        {rows.map((l) => {
          const d = l.data as LeagueData;
          const teams = d.groups.reduce((n, g) => n + g.standings.length, 0);
          const { played, total, done } = progress(l);
          return (
            <Link key={l.id} href={`/leagues/${l.id}`} className="card grid" style={{ gap: 6 }}>
              <span><span className={`pill ${done ? '' : 'lime'}`}>{done ? t('הסתיימה') : t('מתנהלת')}</span></span>
              <strong style={{ fontSize: 18 }}>{l.name}</strong>
              <span className="muted">{teams} {t('קבוצות')} · {played}/{total} {t('משחקים שוחקו')}</span>
            </Link>
          );
        })}
        {!rows.length && <div className="card muted">{t('אין עדיין ליגות.')}</div>}
      </div>
    </Shell>
  );
}
