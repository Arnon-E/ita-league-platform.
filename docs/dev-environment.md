# סביבת פיתוח

**למה:** האתר החי רץ על מסד נתונים אחד ב-Neon (תוכנית חינמית: 5GB העברת נתונים ו-100 שעות חישוב בחודש). בדיקות עומס שרצו מול הפרודקשן גמרו את המכסה והפילו את האתר.
הכלל: **שום בדיקה, ניסוי או בדיקת עומס לא רצים על הפרודקשן.** לכל זה יש סביבה נפרדת עם מסד נתונים משלה.

| | ענף ב-git | מסד נתונים | כתובת |
|---|---|---|---|
| **פרודקשן** | `main` | `ita-league-db` (Neon) | `ita-league-platform-jpgi.vercel.app` |
| **פיתוח** (Vercel Preview) | `dev` | `ita-league-dev-db` (Neon, חינמי, נפרד) | כתובת ה-Preview של הענף `dev` |
| **מקומי** | כל ענף | Postgres מקומי (`ita`, `ita_test`) | `localhost:3000` |

בכל אתר שאינו פרודקשן מופיעה תווית כתומה "סביבת פיתוח" בפינה, והוא לא נכנס למנועי חיפוש.

## הקמה חד-פעמית (בלוחות של Vercel ו-Neon)

1. **מסד נתונים נפרד.** ב-Vercel ← הפרויקט `ita-league-platform-jpgi` ← **Storage** ← Create ← Neon (Free), בשם `ita-league-dev-db`.
   בחלון החיבור סמנו את הסביבות **Preview ו-Development בלבד**, בלי Production, ובשדה **Custom Prefix** הקלידו `DEV`, כדי שהמשתנים ייקראו `DEV_DATABASE_URL` ועוד.
2. **(לא חובה, הקוד כבר מגן)** Preview משתמש בקוד **רק** במשתנה `DEV_DATABASE_URL` ולעולם לא ב-`DATABASE_URL`, גם אם הוא מוגדר ל-Preview. אפשר בכל זאת לנתק את מסד הפרודקשן מ-Preview. ב-**Settings ← Environment Variables** לכל המשתנים של `ita-league-db` (`DATABASE_URL` וחבריו) לבחור סביבת **Production בלבד**.
   בדיקה: משתנה `DATABASE_URL` צריך להופיע פעמיים, פעם לפרודקשן ופעם ל-Preview, עם כתובות שונות.
3. **ענף `dev`:** `git checkout -b dev && git push -u origin dev`. Vercel בונה Preview לענף; הבנייה (`scripts/db-init.mjs`) יוצרת את כל הטבלאות במסד הריק.
   מנהל ראשון: להגדיר `ADMIN_EMAIL` ו-`ADMIN_PASSWORD` ב-Environment Variables לסביבת **Preview בלבד**.
4. **Deployment Protection נשאר דלוק** ל-Preview: רק מי שמחובר ל-Vercel (או עם מפתח) נכנס. לבדיקות אוטומטיות: **Settings ← Deployment Protection ← Protection Bypass for Automation**, ומעבירים את המפתח ב-`--bypass`.
5. **נתוני בדיקה:** `DATABASE_URL=<כתובת מסד הפיתוח> pnpm db:seed` (משתמשי דמו), ואם צריך נתוני Loglig: סקריפטי הסנכרון עם `--url <כתובת ה-Preview>` ועם `CRON_SECRET` של סביבת Preview.

## עבודה יומיומית

- עובדים על `dev`, בודקים ב-Preview, וממזגים ל-`main` רק מה שנבדק. כל push ל-`main` עולה לפרודקשן.
- סקריפטי העזר (`apps/web/scripts/test-user.mjs`, `merge-clubs.mjs`, `loglig-sync/*`) פונים כברירת מחדל לכתובת מ-`.env.production.local`. לסביבת פיתוח מעבירים תמיד `--url <כתובת הפיתוח>`.
- **בדיקת עומס** רק על פיתוח:
  `node scripts/loadtest.mjs --url https://<dev> --bypass <מפתח> --steps 10,50,100`
  הסקריפט מסרב לרוץ על הפרודקשן אלא אם מעבירים `--allow-production` במפורש.
- **אפליקציית אנדרואיד לפיתוח:** `$env:ITA_API_URL = "https://<dev>"` ואז בנייה רגילה (`gradlew :app:assembleRelease`). ההתקנה מחליפה את האפליקציה הרגילה במכשיר (אותו שם חבילה), ולכן לא מתקינים אותה על מכשיר עם משתמש אמיתי. לבנייה לפרודקשן לא מגדירים את המשתנה.

## מעקב ומכסות

- ב-Neon להגדיר התראה לפני שמכסת העברת הנתונים נגמרת, לא אחרי.
- המכסה היא **לפרויקט**: ענף (branch) של Neon לא נותן מכסה נוספת. מסד פיתוח נפרד הוא פרויקט נפרד.
- סיבות הצריכה העיקריות: עמודים שלא נשמרים ב-cache ושאילתות רחבות. עיינו ב-`src/lib/memo.ts` ובשירותים שמשתמשים בו לפני שמוסיפים עמוד שפונה למסד בכל כניסה.

## אומת בפועל
- מסד הפיתוח `ita-league-dev-db` מחובר לפרויקט לסביבות Preview ו-Development בלבד, עם הקידומת `DEV`. המשתנים: `DEV_DATABASE_URL`, `DEV_DATABASE_URL_UNPOOLED` ועוד.
- ה-Preview (`src/db/index.ts`, `scripts/db-init.mjs`) קורא רק אותם, ולעולם לא את `DATABASE_URL` של הפרודקשן.

## משתנים נפרדים ל-Preview
ל-Preview יש `SESSION_SECRET`, `CRON_SECRET`, `ID_HASH_SALT` ו-`PUBLIC_URL` משלו (לא של הפרודקשן), `STORAGE_DIR=/tmp/ita-storage` לקבצים זמניים, ואין `RESEND_API_KEY` (לא נשלחים מיילים אמיתיים) ואין `BLOB_STORE_ID` (לא נוגעים באחסון של הפרודקשן).
העתק מקומי של `CRON_SECRET` ו-`PUBLIC_URL` של הפיתוח: `apps/web/.env.development.local` (לא עולה ל-git).

(נבדק: אחרי מחיקת הפרויקט הכפול נבנה רק `ita-league-platform-jpgi`.)
