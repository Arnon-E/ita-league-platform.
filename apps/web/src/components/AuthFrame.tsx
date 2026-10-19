import Link from 'next/link';
import type { ReactNode } from 'react';
import { tr } from '@/lib/i18n';
import { BallMark, Court } from './Brand';
import { Shell } from './Shell';

/** Sign-in pages: the site's top bar, then a court-art brand panel beside the form. The form column is the page's own content. */
export async function AuthFrame({ children }: { children: ReactNode; en?: boolean }) {
  const t = await tr();
  return (
    <Shell nav="auth">
      <div className="auth">
        <aside className="authside">
          <Court />
          <Link href="/" className="brand"><BallMark size={34} />ITA</Link>
          <div>
            <h2>{t('איגוד הטניס בישראל')}</h2>
            <p>{t('תחרויות, לוחות משחקים, תוצאות חיות ודירוג. הכול במקום אחד.')}</p>
          </div>
        </aside>
        <section className="authform">{children}</section>
      </div>
    </Shell>
  );
}
