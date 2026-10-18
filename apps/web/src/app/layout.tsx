import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getLang, tr } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await tr();
  return { title: t('איגוד הטניס — ניהול ליגות'), description: t('רישום, הגרלות, תוצאות ודירוג') };
}

export default async function Root({ children }: { children: ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={lang === 'en' ? 'ltr' : 'rtl'}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&family=Rubik:wght@500;600;700;800&family=Bricolage+Grotesque:opsz,wght@12..96,500..800&display=swap" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#EEF0EA" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#070A09" media="(prefers-color-scheme: dark)" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
