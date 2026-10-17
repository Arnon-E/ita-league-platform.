import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { requireActor } from '@/lib/session';
import { tr } from '@/lib/i18n';

/** First step after signing up: who plays? The answer decides whether the next form creates the person's own profile or a child's. */
export default async function Welcome() {
  await requireActor();
  const t = await tr();
  const opts = [
    { href: '/me?who=self#add-player', title: 'אני משחק/ת', sub: 'פרופיל שחקן על שמי: דירוג, משחקים והרשמה לתחרויות' },
    { href: '/me?who=child#add-player', title: 'הילד/ה שלי משחק/ת', sub: 'פרופיל לילד/ה, אפשר להוסיף כמה שרוצים. אני מנהל/ת את ההרשמות והמסמכים' },
    { href: '/rankings', title: 'אני רק עוקב/ת', sub: 'לעקוב אחרי שחקנים ותחרויות ולקבל התראות, בלי פרופיל' },
  ];
  return (
    <Shell nav="me">
      <h1>{t('ברוכים הבאים')}</h1>
      <p className="muted">{t('מי משחק? כך נתאים לכם את מסך הבית.')}</p>
      <div className="grid cols" style={{ marginTop: 14 }}>
        {opts.map((o) => (
          <Link key={o.href} href={o.href} className="card" style={{ display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 20 }}>{t(o.title)}</strong>
            <span className="muted">{t(o.sub)}</span>
          </Link>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 16 }}><Link href="/"><u>{t('דילוג, אחליט אחר כך')}</u></Link></p>
    </Shell>
  );
}
