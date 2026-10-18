# רשימת הפעלה: מה נשאר כדי לעלות לאוויר

הקוד מוכן. הפריטים כאן דורשים גישה, מפתחות או מכשיר פיזי, ולא ניתן לסגור אותם מתוך הסביבה שבה נבנתה המערכת. כל פריט כולל בדיקת קבלה.

| # | פריט | פעולה | בדיקת קבלה |
|---|---|---|---|
| 1 | אימות התקנון | לעבור על `docs/ita-verification.md` מול המסמכים; לתקן ב-`/admin/rules`; לסמן `verified: true` | באנר האזהרה נעלם בתחרות חדשה |
| 2 | אימייל / SMS / push | להגדיר `RESEND_API_KEY`, `EMAIL_FROM`, `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`, `CRON_SECRET`; מתזמן שקורא ל-`POST /api/cron/notifications` (Bearer) כל דקה | רישום שחקן ← אימייל מגיע; push מגיע לטלפון עם Expo |
| 3 | סליקה | Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (webhook ל-`/api/webhooks/stripe`), `PUBLIC_URL`. ספק ישראלי: מתאם ב-`src/lib/` עם `createCheckoutSession`, `refundPaymentIntent`, `verify...Signature` | תשלום בכרטיס בדיקה מסמן "שולם"; החזר מקוון עובד |
| 4 | ייבוא ישיר מלוגליג | חיבור קריאה בלבד ל-DB (או עותק) ושתי שאילתות מיפוי ב-`/admin/import`; להריץ קודם "בדיקה בלבד" | דוח ללא שגיאות; הרצה שנייה מעדכנת ולא משכפלת |
| 5 | אפליקציה בחנויות | האפליקציה כבר מחוברת לאתר החי ונבדקה ב-Expo Go. נשאר: `npx eas build -p android` (APK / Play) ו-`npx eas build -p ios` (חשבון Apple Developer) | ההתקנה מהחנות נכנסת, מציגה תחרויות ועץ תחרות ומחליפה שפה |
| 7 | סנכרון שלא תלוי במחשב אחד | היום הסנכרון מ-Loglig רץ ב-Task Scheduler במחשב אחד (יומי 06:30 + כל 10 דקות); כשהמחשב כבוי האתר לא מתעדכן. להעביר לשרת קטן או ל-cron בענן עם אותם סקריפטים (`apps/web/scripts/loglig-sync/README.md`) | תוצאה חדשה ב-Loglig מופיעה באתר תוך 10 דקות גם כשהמחשב כבוי |
| 6 | מחיקת חשבונות בדיקה | `cd apps/web` ואז `node scripts/test-user.mjs delete` (פירוט ב-`docs/test-users.md`) | אין משתמשים עם `@ita-test.invalid` |

משתני חובה לכל סביבה: `DATABASE_URL`, `SESSION_SECRET` (32+ בתים אקראיים), `ID_HASH_SALT`, `STORAGE_DIR` (או מתאם S3 בייצור).

## Run everything with Docker
`docker compose up --build`, then push the schema once: `docker compose exec web npx drizzle-kit push --force` (set real secrets in `docker-compose.yml` first).
