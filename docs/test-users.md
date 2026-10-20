# Test users

Test accounts exist so the logged-in flows (registration, personal area, following, admin) can be exercised on the live site.
They are easy to recognise and must be removed before the site goes live to real users.

## How to tell a test account

- Email ends with `@ita-test.invalid` (a reserved domain that can never receive mail).
- Name is `[TEST] משתמש בדיקה`.

| Email | Role |
|---|---|
| `qa-test-player@ita-test.invalid` | PLAYER |
| `qa-test-admin@ita-test.invalid` | FEDERATION_ADMIN |

## Create

From `apps/web`:

```powershell
node scripts/test-user.mjs create          # player
node scripts/test-user.mjs create --admin  # federation admin
```

The password is generated on the server and printed once in your terminal. It is not stored anywhere else.

## Remove

```powershell
node scripts/test-user.mjs delete
```

Deletes every `@ita-test.invalid` account and what it owns (player profiles, entries, follows, notifications). Safe to run repeatedly.

## Rules

- Do not use real personal data in a test account.
- Delete the accounts before go-live (see `go-live.md`) and whenever a test round is finished.
- Record here when a test account is created or removed:

| Date | Action | By |
|---|---|---|
| 2026-10-14 | נוצר `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) | Arnon |
| 2026-10-15 | נוצר `qa-test-player@ita-test.invalid` (PLAYER), לבדיקת כרטיס "מחכה לך"; למחוק בסיום הבדיקה | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) לבדיקת מסך הניהול באפליקציה, ונמחק מיד בסיום (נמחקו גם חשבונות בדיקה קודמים); נוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER) | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) לבדיקת מסכי הניהול באפליקציה במכשיר (אישור/דחיית מסמך, תפקיד, שיוך, מתקן); נמחקו כל חשבונות הבדיקה בסיום, ונוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER) | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר שוב `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) לבדיקת אישור/דחיית בקשות שיוך ומסכי השולחן באפליקציה; נמחקו כל חשבונות הבדיקה בסיום, ונוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER) | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר `qa-test-superadmin@ita-test.invalid` (SUPER_ADMIN) באישור מפורש, לבדיקת ההתחזות באפליקציה במכשיר; נמחקו כל חשבונות הבדיקה מיד בסיום, נוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER), והיכולת ליצור חשבון בדיקה בתפקיד מנהל על הוסרה מהקוד | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) לבדיקת הורדת CSV וייבוא בבדיקה בלבד באפליקציה במכשיר; נמחקו כל חשבונות הבדיקה בסיום, ונוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER) | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) ומועדון בדיקה `ZZ TEST CLUB` עם שחקן [TEST] אחד המקושר לחשבון הבדיקה, באישור מפורש, לבדיקת שליחת הודעה מהאפליקציה במכשיר (נמען יחיד, חשבון בדיקה); הכול נמחק בסיום (כולל המועדון), נוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER) | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) באישור מפורש לפרסום גרסת כללים (גרסה 2, זהה לגרסה 1) מהאפליקציה במכשיר; נמחקו כל חשבונות הבדיקה בסיום, ונוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER) | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) לקריאת `/admin/config` (כן/לא למשתני Resend ו-Twilio, בלי ערכים); נמחקו כל חשבונות הבדיקה בסיום, ונוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER) | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) לבדיקת הגדרות Resend (`/admin/config`) ושליחת מייל בדיקה אחד לכתובת הבעלים; נמחקו כל חשבונות הבדיקה בסיום, ונוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER) | Arnon (הורץ על ידי Claude) |
| 2026-10-20 | נוצר `qa-test-admin@ita-test.invalid` (FEDERATION_ADMIN) לשליחת מייל בדיקה אחד דרך Resend (`EMAIL_FROM` = onboarding@resend.dev) לכתובת הבעלים; נמחקו כל חשבונות הבדיקה בסיום, ונוצר מחדש `qa-test-player@ita-test.invalid` (PLAYER) | Arnon (הורץ על ידי Claude) |
