import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'איגוד הטניס — ניהול ליגות', description: 'רישום, הגרלות, תוצאות ודירוג' };

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0B2545" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}
