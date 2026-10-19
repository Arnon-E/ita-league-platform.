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
