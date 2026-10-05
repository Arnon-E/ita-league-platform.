# רשימת הפעלה: מה נשאר כדי לעלות לאוויר

הקוד מוכן. חמשת הפריטים כאן דורשים גישה, מפתחות או מכשיר פיזי, ולא ניתן לסגור אותם מתוך הסביבה שבה נבנתה המערכת. כל פריט כולל בדיקת קבלה.

| # | פריט | פעולה | בדיקת קבלה |
|---|---|---|---|
| 1 | אימות התקנון | לעבור על `docs/ita-verification.md` מול המסמכים; לתקן ב-`/admin/rules`; לסמן `verified: true` | באנר האזהרה נעלם בתחרות חדשה |
| 2 | אימייל / SMS / push | להגדיר `RESEND_API_KEY`, `EMAIL_FROM`, `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`, `CRON_SECRET`; מתזמן שקורא ל-`POST /api/cron/notifications` (Bearer) כל דקה | רישום שחקן ← אימייל מגיע; push מגיע לטלפון עם Expo |
| 3 | סליקה | Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (webhook ל-`/api/webhooks/stripe`), `PUBLIC_URL`. ספק ישראלי: מתאם ב-`src/lib/` עם `createCheckoutSession`, `refundPaymentIntent`, `verify...Signature` | תשלום בכרטיס בדיקה מסמן "שולם"; החזר מקוון עובד |
| 4 | ייבוא ישיר מלוגליג | חיבור קריאה בלבד ל-DB (או עותק) ושתי שאילתות מיפוי ב-`/admin/import`; להריץ קודם "בדיקה בלבד" | דוח ללא שגיאות; הרצה שנייה מעדכנת ולא משכפלת |
| 5 | Expo על מכשיר | `cd mobile`, עדכון `extra.apiUrl` ב-`app.json`, `npx expo start`, פתיחה ב-Expo Go / TestFlight | כניסה, הזנת תוצאה, העלאת מסמך והרשמה עובדים בטלפון |

משתני חובה לכל סביבה: `DATABASE_URL`, `SESSION_SECRET` (32+ בתים אקראיים), `ID_HASH_SALT`, `STORAGE_DIR` (או מתאם S3 בייצור).
