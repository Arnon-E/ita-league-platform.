import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getLang, tr } from '@/lib/i18n';
import { InstallHint } from '@/components/InstallHint';

export const dynamic = 'force-dynamic';
/** Anything that is not the live site (a Vercel preview, or `next dev` on a laptop): labelled on screen and kept out of search engines. */
const isDevEnv = process.env.VERCEL_ENV ? process.env.VERCEL_ENV !== 'production' : process.env.NODE_ENV === 'development';

export async function generateMetadata(): Promise<Metadata> {
  const t = await tr();
  return { title: t('איגוד הטניס — ניהול ליגות'), description: t('רישום, הגרלות, תוצאות ודירוג'), ...(isDevEnv ? { robots: { index: false, follow: false } } : {}) };
}

export default async function Root({ children }: { children: ReactNode }) {
  const lang = await getLang();
  const t = await tr();
  return (
    <html lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&family=Rubik:wght@500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,500..800&display=swap" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#EEF0EA" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#070A09" media="(prefers-color-scheme: dark)" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="ITA" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body>{isDevEnv && <div className="envbadge" role="note">{t('סביבת פיתוח')}</div>}{children}<InstallHint l={{ title: t('התקנה על מסך הבית'), step: t('לחצו על {share} בתחתית Safari ובחרו ״הוספה למסך הבית״'), close: t('סגירה') }} /></body>
    </html>
  );
}
