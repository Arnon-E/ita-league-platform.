# Deploying to Vercel (web + API for web, Android and iOS)

The Next.js app in `apps/web` serves both the website and the `/api/v1` the mobile apps call. Deploy it once and every device uses the same address.

## 1. Database (hosted Postgres)
Easiest: in Vercel, **Storage → Marketplace → Neon** (free tier). It adds `DATABASE_URL` to the project for you.
Any Postgres works (Supabase, Railway, ...): use the **pooled** connection string and add `?sslmode=require`.

Create the tables once, from your PC, against the hosted database:

```bash
cd apps/web
DATABASE_URL="<hosted connection string>" npx drizzle-kit push --force
DATABASE_URL="<hosted connection string>" pnpm db:seed     # optional demo users and data
```

## 2. Private file storage (documents, gallery photos)
Local disk does not persist on Vercel, so use any S3-compatible private bucket (Cloudflare R2, AWS S3, Supabase Storage). Keep the bucket **private**: files are only served through the API. Set `S3_BUCKET`, `S3_ENDPOINT` (R2/Supabase), `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.

## 3. Import the repo
Vercel → **Add New → Project → Import** `ita-league-platform` from GitHub.
- **Root Directory:** `apps/web`
- Enable **Include source files outside of the Root Directory** (the project uses `packages/rules-engine`).
- Framework: Next.js (detected). Build and install commands come from `apps/web/vercel.json`.

## 4. Environment variables
Generate fresh secrets on your PC and paste them in (never commit them):

```bash
node scripts/gen-secrets.mjs
```

| Variable | Value |
|---|---|
| `DATABASE_URL` | pooled Postgres URL (added automatically by the Neon integration) |
| `SESSION_SECRET` | from `gen-secrets` |
| `ID_HASH_SALT` | from `gen-secrets` |
| `CRON_SECRET` | from `gen-secrets` (Vercel Cron sends it as a Bearer token) |
| `PUBLIC_URL` | your site address, e.g. `https://ita-league.vercel.app` |
| `S3_*` | see step 2 |
| `RESEND_API_KEY`, `EMAIL_FROM`, `TWILIO_*`, `STRIPE_*` | optional until you turn on email, SMS and payments (see `docs/go-live.md`) |

## 5. Deploy and check
Deploy, then open the address. `/api/v1/tournaments` should return JSON. Log in with a seeded user, or create an admin.

Notes: the notification scheduler in `vercel.json` runs once a day because the free Vercel Hobby plan only allows daily cron jobs. For near-real-time email/SMS/push, upgrade to Pro and change the schedule to `* * * * *`, or call `POST /api/cron/notifications` with `Authorization: Bearer $CRON_SECRET` every minute from a free external scheduler.

## 6. Mobile apps
1. Set `extra.apiUrl` in `mobile/app.json` to the Vercel address (https).
2. Android: `npx eas build -p android --profile preview` gives an installable APK (free Expo account).
3. iOS: needs an Apple Developer account (about $99/year) for TestFlight / App Store: `npx eas build -p ios`.
4. For quick testing without a build, run `npx expo start` and open it in Expo Go; the app will talk to the Vercel address.
