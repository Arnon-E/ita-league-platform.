import { cookies } from 'next/headers';

export type Lang = 'he' | 'en';
export const LANG_COOKIE = 'ita_lang';

export async function getLang(): Promise<Lang> {
  try { return (await cookies()).get(LANG_COOKIE)?.value === 'en' ? 'en' : 'he'; } catch { return 'he'; }
}

/** Hebrew is the source language; English is looked up by the exact Hebrew string, and falls back to Hebrew. */
const EN: Record<string, string> = {
  // navigation
  'תחרויות': 'Tournaments', 'משחקים': 'Matches', 'דירוג': 'Rankings', 'שחקנים': 'Players', 'מועדונים': 'Clubs', 'סטטיסטיקות': 'Statistics',
  'חיפוש': 'Search', 'האזור שלי': 'My area', 'ניהול': 'Admin', 'הודעות': 'Messages', 'דוחות': 'Reports', 'מסמכים': 'Documents', 'ייבוא': 'Import',
  'מתקנים': 'Venues', 'משתמשים': 'Users', 'חוקים': 'Rules', 'ביקורת': 'Audit', 'כניסה': 'Log in', 'הרשמה': 'Sign up', 'יציאה': 'Log out',
  // home
  'איגוד הטניס בישראל': 'Israel Tennis Association', 'תחרויות, לוחות משחקים, תוצאות חיות ודירוג. הכול במקום אחד.': 'Tournaments, schedules, live scores and rankings. All in one place.',
  'משחקים ותוצאות': 'Matches & results', 'לדירוג': 'Rankings', 'תחרות חדשה': 'New tournament',
  'אין עדיין תחרויות. צרו תחרות חדשה כדי להתחיל.': 'No tournaments yet.',
  // live
  'משחקים חיים': 'Live matches', 'משחקים קרובים': 'Upcoming matches', 'תוצאות אחרונות': 'Latest results', 'שעה': 'Time', 'מגרש': 'Court', 'משחק': 'Match',
  'תחרות': 'Tournament', 'תוצאה': 'Result', 'אין משחקים מתוכננים.': 'No matches scheduled.', 'אין עדיין תוצאות.': 'No results yet.', 'חי': 'Live',
  // rankings
  'בנים/גברים': 'Boys / Men', 'בנות/נשים': 'Girls / Women', 'שחקן': 'Player', 'נקודות': 'Points', 'תוצאות נספרות': 'Counted results',
  '52 שבועות אחרונים · 6 תוצאות יחיד הטובות ביותר': 'Last 52 weeks · best 6 singles results', 'אין עדיין נתוני דירוג.': 'No ranking data yet.',
  // players / clubs / search / stats
  'חיפוש לפי שם': 'Search by name', 'כל המועדונים': 'All clubs', 'מועדון': 'Club', 'מין': 'Gender', 'לא נמצאו שחקנים.': 'No players found.',
  'שחקנים, מועדונים, תחרויות': 'Players, clubs, tournaments', 'כל המועדונים ←': 'All clubs', 'אין מועדונים.': 'No clubs.',
  'מובילים בניצחונות': 'Top winners', 'מועדונים גדולים': 'Largest clubs', 'משחקים שהסתיימו': 'Completed matches', 'ניצחונות': 'Wins', 'אחוז': 'Win %',
  'אין עדיין משחקים שהסתיימו.': 'No completed matches yet.',
  'משחקים חיים עכשיו': 'live matches now', 'טיוטה': 'Draft', 'הרשמה פתוחה': 'Registration open', 'הרשמה סגורה': 'Registration closed', 'הוגרל': 'Drawn',
  'מתנהלת': 'In progress', 'הסתיימה': 'Finished', 'בוטלה': 'Cancelled', 'שחקנים · ': 'Players · ', 'תחרויות · ': 'Tournaments · ',
  'מוצגים 100 הראשונים. צמצמו את החיפוש.': 'Showing the first 100. Narrow your search.', 'לא נמצאו תוצאות עבור': 'No results for',
  'תוצאות': 'Results', 'מועדון: ': 'Club: ', 'ניצחון': 'Win', 'הפסד': 'Loss', 'טרם שוחק': 'Not played', 'הסתיים': 'Completed',
};

export async function tr(): Promise<(he: string) => string> {
  const lang = await getLang();
  return (he) => (lang === 'en' ? EN[he] ?? he : he);
}
