# ita-league-platform

מערכת לאיגוד הטניס בישראל: תחרויות, הגרלות ועצי תחרות, תוצאות חיות, דירוג, שחקנים, מועדונים, ליגות ותקנונים.
אתר Web (גם בטלפון) ואפליקציית Android / iPhone, בעברית ובאנגלית.

האתר החי: https://ita-league-platform-jpgi.vercel.app
הנתונים משוקפים מהמקורות הציבוריים של האיגוד (ita.co.il ו-Loglig) בסנכרון אוטומטי, ראו `docs/loglig-sources.md`.

## מה יש כאן

| נתיב | תוכן |
|---|---|
| `apps/web` | אתר Next.js וה-API (`/api/v1`) שהאפליקציה משתמשת בו. בסיס נתונים Postgres (Drizzle) |
| `apps/web/scripts/loglig-sync` | סקריפטי הסנכרון מ-Loglig ו-ita.co.il (רצים על המחשב, ראו ה-README שם) |
| `mobile` | אפליקציית Expo (React Native) ל-Android ול-iPhone |
| `packages/rules-engine` | מנוע החוקים: הגרלה עם זריעה, בתים, שיבוץ, דירוג, החזרים |
| `docs/` | אפיון, מקורות הנתונים, פריסה, עלייה לאוויר, מערכת העיצוב |
| `design/mockups/` | מסכי ה-mock המקוריים מתחילת הפרויקט (היסטוריים; העיצוב העדכני ב-Figma) |

## מסמכים

| מסמך | תוכן |
|---|---|
| `docs/PRD.md` | מסמך דרישות המוצר (העתק מ-4.10.2026; לא מתעדכן, המצב העדכני כאן) |
| `docs/loglig-sources.md` | מאיפה מגיע כל נתון, כללי הנתונים (כיוון התוצאה, כפילויות), הסנכרון האוטומטי |
| `docs/db-traffic.md` | למה האתר נפל (מכסת Neon), כללי תעבורת מסד הנתונים והסנכרונים |
| `docs/masters-tournamentsoftware.md` | תחרויות מאסטרס: סנכרון מ-tournamentsoftware.com, תופעות בנתונים, מקטעים |
| `docs/dev-environment.md` | סביבת פיתוח נפרדת, סנכרון `dev` עם `main`, בדיקות עומס |
| `docs/design-system.md` | צבעים, פונטים, רווחים ורכיבים; קובץ ה-Figma |
| `docs/i18n.md` | שפות: איך התרגום עובד באתר ובאפליקציה ואיך מוסיפים שפה |
| `docs/vercel-deploy.md` | פריסה ל-Vercel (אתר, API, בסיס נתונים, אחסון) |
| `docs/go-live.md` | מה נשאר כדי לעלות לאוויר מלא (מפתחות, סליקה, התראות) |
| `docs/ita-sources.md`, `docs/ita-verification.md` | תקנוני האיגוד ומה צריך לאמת מולם |
| `docs/test-users.md` | חשבונות בדיקה |
| `mobile/README.md` | האפליקציה: הרצה, מבנה, שפות |

## מה עובד

| תחום | מצב |
|---|---|
| תחרויות: רשימה עם סינון, פרטים, משתתפים, הגרלה, בתים, לוח משחקים, תוצאות | ✅ משוקף מ-Loglig, מתעדכן כל 10 דקות לתחרויות פעילות |
| עץ תחרות (נוקאאוט) עם קווים, תוצאות ומסלול השחקן שלי | ✅ באתר ובאפליקציה |
| דירוג לפי גיל ומין, עמוד שחקן עם היסטוריה, מועדונים, ליגות, תקנונים, סטטיסטיקות | ✅ |
| חשבון: שחקן / הורה לילדים, "הבית שלי", מעקב והתראות, כניסת ילד | ✅ |
| שפות: עברית ואנגלית, כיוון הדף לפי השפה | ✅ באתר ובאפליקציה |
| רישום ותשלום בתוך המערכת (Stripe), מסמכים, החזרים | ✅ בקוד; כרגע ההרשמה לתחרויות היא ב-Loglig, ראו `docs/go-live.md` |
| ניהול: הגרלה, שיבוץ מגרשים, הזנת תוצאות (שופט), נקודות דירוג, ערכת חוקים | ✅ |
| התראות (אימייל, SMS, push) | ✅ בקוד; נדרשים מפתחות ספקים |
| אפליקציית Expo | ✅ נבדקה ב-Expo Go; בנייה לחנויות לפי `docs/vercel-deploy.md` |
| אימות מספרי תקנון האיגוד | ⚠️ דורש אדם: `docs/ita-verification.md` |

## הרצה מקומית (Web)

```bash
pnpm install
createdb ita && createdb ita_test
cd apps/web
cp .env.example .env
DATABASE_URL=postgresql://postgres@localhost:5432/ita npx drizzle-kit push --force
DATABASE_URL=postgresql://postgres@localhost:5432/ita pnpm db:seed   # משתמשי דמו, סיסמה Passw0rd!!
DATABASE_URL=postgresql://postgres@localhost:5432/ita pnpm dev
pnpm test        # בדיקות אינטגרציה מול ita_test (מאפסות אותו)
npx tsc --noEmit # typecheck
```

משתמשי דמו: `super@ita.test`, `fed@ita.test`, `manager@ita.test`, `ref@ita.test`.

## סביבת פיתוח

בדיקות, ניסויים ובדיקות עומס רצים על סביבה נפרדת עם מסד נתונים משלה, לא על הפרודקשן. ההקמה והכללים ב-`docs/dev-environment.md`.

## פריסה

כל push ל-`main` נפרס אוטומטית ל-Vercel. סקריפטי הסנכרון רצים במחשב (Windows Task Scheduler) ושולחים לאתר דרך `/api/sync/loglig` עם `CRON_SECRET`:
סנכרון יומי ב-06:30 (`run-daily-sync.bat`) ורשומים ותוצאות חיות כל 10 דקות (`run-rosters-sync.bat`).
