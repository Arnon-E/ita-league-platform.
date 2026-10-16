import Link from 'next/link';
import type { ReactNode } from 'react';
import { tr } from '@/lib/i18n';
import { BallMark, Court } from './Brand';

/** Sign-in pages: a court-art brand panel beside the form. The form column is the page's own content. */
export async function AuthFrame({ children, en }: { children: ReactNode; en: boolean }) {
  const t = await tr();
  return (
    <main className="auth" dir={en ? 'ltr' : 'rtl'}>
      <aside className="authside">
        <Court />
        <Link href="/" className="brand"><BallMark size={34} />ITA</Link>
        <div>
          <h2>{t('איגוד הטניס בישראל')}</h2>
          <p>{t('תחרויות, לוחות משחקים, תוצאות חיות ודירוג. הכול במקום אחד.')}</p>
        </div>
      </aside>
      <section className="authform">{children}</section>
    </main>
  );
}
