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
- **אפליקציית אנדרואיד:** `mobile\install-dev.bat` בונה ומתקין על הטלפון המחובר גרסה שמדברת עם אתר הפיתוח (מפתח עקיפת ההגנה נקרא מ-`%USERPROFILE%\.ita-dev\dev-sync.env` ונשלח בכותרת `x-vercel-protection-bypass`; הוא לא נכנס ל-git). `mobile\install-prod.bat` מחזיר לגרסה הרגילה מול האתר החי. ההתקנה מחליפה את האפליקציה הרגילה (אותו שם חבילה), ולכן לא מתקינים גרסת פיתוח על מכשיר עם משתמש אמיתי. אם adb מראה `offline`: `adb reconnect`.

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

## סנכרון `dev` עם `main` (חובה)

שני הענפים חייבים להישאר קרובים, אחרת בדיקות על `dev` לא משקפות את מה שרץ בפרודקשן.
- **אחרי כל merge או push ל-`main`:** למזג את `main` ל-`dev`: `git checkout dev && git merge main && git push origin dev`.
- **אחרי שבדקתם משהו ב-`dev` ואתם מוכנים:** ממזגים ל-`main` (זה מה שעולה לפרודקשן), ואז מסנכרנים בחזרה כנ"ל.
- **לבדוק מדי פעם** שאין פער: `git log --oneline main..dev` ו-`git log --oneline dev..main` צריכים להיות ריקים או קצרים מאוד.
- **שינויי סכמה (עמודות/טבלאות):** נוצרים אוטומטית בבנייה בכל סביבה דרך `scripts/db-init.mjs`, אבל נתונים לא עוברים בין המסדים. מסד הפיתוח נבנה מחדש או מוזרע בנפרד.
- Vercel מדלג על בנייה של commit בלי שינוי בקבצים (מצב CANCELED), כך שמיזוג ריק לא יפרוס מחדש.

## נתוני בדיקה ומדידת עלות דפים (בפיתוח בלבד)

מסד הפיתוח מתחיל ריק, ולכן כדי למדוד משהו צריך נתונים בגודל של האתר החי.
- **הזרעה:** `POST /api/sync/loglig` עם `{ "kind": "dev-seed" }` (ועם `CRON_SECRET` של הפיתוח) יוצר כ-5,600 שחקנים, 186 מועדונים, 300 תחרויות, 43 אלף הרשמות, 21 אלף משחקים ו-19 אלף שורות נקודות, תוך כ-10 שניות. `{ "reset": true }` מוחק את נתוני הבדיקה ויוצר מחדש. הנתונים מסומנים (`DEV …`, `seed:…`) ולא נוגעים בשום דבר אחר.
- **הגנה:** הכלים (`src/services/devtools.ts`) מסרבים לרוץ מחוץ ל-Preview/פיתוח מקומי. בפרודקשן הם זורקים שגיאה.
- **מדידה:** `node scripts/page-cost.mjs --url https://<dev> --bypass <מפתח>` שולח בקשה בודדת (קרה ואז חמה) לכל דף ומדפיס כמה קריאות למסד וכמה שורות הוא החזיר, וכמה זמן ובאיזה גודל. אין בזה עומס, אז זה בטוח למכסת הפיתוח. הוא מסרב לרוץ על האתר החי.
- `/api/sync/loglig` עם `{ "kind": "dev-stats", "action": "snapshot" }` מחזיר את השאילתות הכבדות ביותר (נשען על `pg_stat_statements`).

## נתונים אמיתיים בפיתוח (במקום נתונים סינתטיים)

הסקריפטים של `apps/web/scripts/loglig-sync` קוראים נתונים **ציבוריים** (ללא התחברות) ודוחפים אותם לכל אתר שמעבירים ב-`--url`. כך ממלאים את מסד הפיתוח בנתוני Loglig אמיתיים:
1. **ניקוי:** `POST /api/sync/loglig` עם `{ "kind": "dev-wipe" }` (ועם `CRON_SECRET` של הפיתוח) מרוקן את כל טבלאות הנתונים חוץ מחוקי הדירוג. פעיל רק בפיתוח.
2. **עקיפת ההגנה של Vercel:** ליצור מפתח "Protection Bypass for Automation" זמני, ולהריץ עם `node --import ./scripts/loglig-sync/_bypass.mjs` ועם `VERCEL_BYPASS`.
3. **משתני סביבה:** `CRON_SECRET` של הפיתוח (`apps/web/.env.development.local`) במקום של הפרודקשן (משתני סביבה גוברים על `.env.production.local`).
4. **סדר:** `rankings.mjs` (שחקנים, נקודות), `app-data.mjs` (מועדונים עם סגלים), `competitions.mjs --list all --all --seasons all` (כל התחרויות, כ-4.5 שעות), `rosters.mjs`, `leagues.mjs`, `regulations.mjs`.
5. **פרטיות:** הנתונים כוללים שמות ותאריכי לידה של קטינים. אתר הפיתוח מוגן ב-Vercel ולא נכנס למנועי חיפוש. לא לחשוף את כתובתו ולא להעתיק את המסד.
6. **בסוף:** לבטל את מפתח העקיפה.
המשימות המתוזמנות (06:30 יומי וכל 10 דקות) ממשיכות לדחוף לאתר החי בלבד.

## סנכרון אוטומטי של הפיתוח (מראה של האתר החי)

אותן שתי משימות מתוזמנות שרצות לאתר החי, רק מול אתר הפיתוח (`apps/web`):
- `run-dev-daily-sync.bat`: יומי ב-06:45, אותם שלבים כמו `run-daily-sync.bat` (דירוג, תחרויות אחרונות, הסרת כפילויות, רשומים, תמונות, ליגות, נתוני אפליקציה, תקנונים).
- `run-dev-rosters-sync.bat`: כל 10 דקות, אותו דבר כמו `run-rosters-sync.bat` (רשומים, הגרלות ותוצאות חיות).
- **התקנה:** `powershell -File install-dev-sync.ps1` (משימות "ITA Dev Loglig Sync" ו-"ITA Dev Loglig Rosters"). **הסרה:** `uninstall-dev-sync.ps1`. אינם נוגעים במשימות של האתר החי.
- **סודות:** הקובץ `%USERPROFILE%\.ita-dev\dev-sync.env` (מחוץ לריפו) עם `CRON_SECRET` של הפיתוח ו-`VERCEL_BYPASS`. הנתונים שנקראים נשמרים ב-`%USERPROFILE%\.ita-dev\dump` ולא ב-`.loglig-dump`, כדי לא להתנגש בריצות של האתר החי.
- **מה שלא נשכפל:** ה-cron של Vercel (מיילים יומיים, ורענון הדירוג ב-03:10) לא רץ על Preview. הדירוג מתרענן בכל ייבוא דירוג ובמעצמו כשהוא ישן מיממה.
- **זהירות:** מפתח העקיפה מאפשר גישה לאתר הפיתוח, שמכיל נתונים אמיתיים. אם מבטלים אותו, הסנכרון של הפיתוח מפסיק עד שמייצרים אחר.

## מתי סנכרון ה-10 דקות באמת רץ (גם באתר החי)

`run-rosters-sync.bat` ו-`run-dev-rosters-sync.bat` קוראים קודם ל-`scripts/loglig-sync/gate.mjs`: הסנכרון רץ רק **בין 9:00 ל-19:00 (שעון ישראל) וכשיש תחרות פעילה** (מיום לפני תחילתה ועד יום סיומה), לפי רשימת התחרויות שהסנכרון היומי שמר (`competitions.json`), בלי לפנות לרשת או למסד. מחוץ לזה המסד נשאר לישון. אם הרשימה חסרה או ישנה מ-3 ימים, הסנכרון רץ כרגיל. המשימה המתוזמנת עדיין מופעלת כל 10 דקות, אבל נגמרת מיד.
בנוסף, ייבוא תחרות (`importCompetition`) קורא עכשיו רק את השחקנים ששמם מופיע בתחרות, ולא את כל טבלת השחקנים (נמדד: 3,715 שורות בהרצה ← כמה עשרות).

## מיזוג ממתין: `dev` לפני `main` (אוקטובר 2026)

ב-`dev` (עד `d81ed2e`) נמצאים שינויים שעדיין **לא** ב-`main` (פרודקשן): לוח התחרויות השנתי של האיגוד (הגאנט) כתחרויות "מתוכננות" (`calendar.mjs`, `gantt.mjs`), טורנירי Tennis Europe בישראל עם רשימות הקבלה (`te.mjs`), עמוד **תחרויות חו"ל** (`abroad.mjs`, הטבלה `abroad_events`, ה-API `/api/v1/public/abroad` ומסך באפליקציה) ותיקון להתאמת שמות בסנכרון הרשומים (`rosters.mjs`).

**למה לא מיזגנו:** ב-2026-10-29 הפרודקשן החזיר 500 ו-"exceeded the quota" (מכסת Neon החינמית). כשהמסד לא נגיש, `scripts/db-init.mjs` מדלג על בדיקות הסכימה וממשיך לבנות, וכאן זה מסוכן: הקוד החדש צריך את `ALTER TYPE tournament_status ADD VALUE 'PLANNED'`, את העמודה `tournaments.acceptance` ואת הטבלה `abroad_events`. אם הוא יעלה לפני שהן קיימות, כל שאילתת תחרויות תיכשל כשהמסד יחזור, עד לבנייה הבאה שבה `db-init` רץ כראוי.

**מתי למזג:** רק אחרי שהפרודקשן עונה 200 (`curl -s -o /dev/null -w "%{http_code}" https://ita-league-platform-jpgi.vercel.app/api/v1/public/regulations`), כלומר אחרי שהמכסה התאפסה או שהתוכנית שודרגה.

**מה עושים אז:**
1. `git checkout main && git merge dev && git push origin main`, ולחכות שהבנייה בפרודקשן תסתיים (בלוג הבנייה צריך להופיע `[db-init]` בלי "skipping schema checks").
2. להריץ מול הפרודקשן (מ-`apps/web`, `CRON_SECRET` מ-`.env.production.local`, ב-PowerShell כדי להגיע ל-tournamentsoftware): `calendar.mjs --push`, `te.mjs --push`, `abroad.mjs --days 300 --push`, `rosters.mjs --push`.
3. `git checkout dev && git merge main && git push origin dev`, ולוודא ש-`git log main..dev` ו-`dev..main` ריקים.
4. בשני קבצי הסנכרון היומי (`run-daily-sync.bat` ו-`run-dev-daily-sync.bat`) כבר נוסף `abroad.mjs`; `competitions.mjs --list all` כבר מריץ את הגאנט ו-Tennis Europe בישראל.

**ITF לנוער לא נכלל:** האתר שלהם חוסם בקשות אוטומטיות (הגנת בוטים), ולכן הוחלט (2026-10-30) לוותר עליו ולהסתפק ב-Tennis Europe. טורנירי ITF לנוער בישראל מופיעים כ"מתוכננים" מהגאנט. אם ITF יאפשר גישה מסודרת, אפשר לחזור לזה (ב-git: `itf.mjs` בקומיט `5ae64d0`). אין לעקוף את החסימה ואין להסוות את הבקשות.
