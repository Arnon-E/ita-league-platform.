# Loglig / ita.co.il sync

Scripts that mirror the federation's public data into the site. They run on a PC (no login, plain GETs, a few requests a second at
most) and send what they read to the site's `/api/sync/loglig` with `Authorization: Bearer <CRON_SECRET>` (from
`apps/web/.env.production.local`). Run them from `apps/web`. Without `--push` a script is a dry run that only saves JSON into
`apps/web/.loglig-dump/` (git-ignored: it holds personal data, including minors, so keep it on the PC).

Where each piece of data comes from, and the rules the import follows: `docs/loglig-sources.md`.

## Scheduled runs (Windows Task Scheduler)

| Task | Installed by | When | What runs | Log |
|---|---|---|---|---|
| Daily refresh | `install-daily-sync.bat` | 06:30 | `run-daily-sync.bat`: rankings, competitions (new, upcoming and the last 21 days), dedupe, rosters, photos, leagues, app data, regulations | `.loglig-dump/daily-sync.log` |
| Live | `install-rosters-sync.bat` (`.ps1`) | every 10 minutes | `run-rosters-sync.bat`: registered players and live draws / results of the competitions that are on | `.loglig-dump/rosters-sync.log` (last run only) |

## Scripts

| Script | What it does |
|---|---|
| `rankings.mjs` | Public ranking tables (both genders, exact birth dates) |
| `competitions.mjs` | Competitions from every ita.co.il listing plus the Loglig app's lists: details, categories, draws, schedule, results. `--list all --all` for everything, `--recent N` to skip ones that ended more than N days ago, `--seasons all` for every past season |
| `calendar.mjs` | The federation's yearly Gantt (an .xlsx linked from its "לוח תחרויות" pages) as planned competitions: name, dates, section and level only (Tennis Europe, ITF, leagues, qualifiers and finals not yet published). Dates come from where each text box sits over the day grid (`gantt.mjs`). Runs at the end of `competitions.mjs --list all`; real competitions replace the planned ones (status `PLANNED`, label "מתוכננת"). `--file x.xlsx` for a local copy |
| `live-results.mjs` | Fresh draws and results for the competitions that are not finished (results only: fee, venue and links stay) |
| `rosters.mjs` | Who is registered in each category of the competitions that have not finished |
| `dedupe.mjs` | Repairs: a competition stored twice under the two sites' titles (keeps the copy refreshed last), import-created players left without history, birth years from Loglig's empty 1753 date. Safe to run any time |
| `photos.mjs`, `roster-photos.mjs` | Player photos and Loglig user ids, in small batches |
| `leagues.mjs` | Every team league: standings, fixtures, individual matches of each tie |
| `app-data.mjs` | Federation info, events, forms, sponsors, age groups, clubs with contacts and rosters |
| `regulations.mjs` | Links to every regulation / procedure / form document on ita.co.il |
| `remove-tournament.mjs` | Removes a tournament by exact name (refuses when it has payments) |
| `cleanup-pairs.mjs` | Removes doubles pairs ("A / B") stored as players by old imports |
| `import-local.ts` | Imports the saved dump straight into a local database (`DATABASE_URL`), no web server |
| `explore.mjs` | The original logged-in explorer (Edge, read-only) used to study Loglig's pages; not needed for the sync |
| `parse.mjs`, `leagues-parse.mjs` | Pure parsing helpers, unit tested in `apps/web/test` |

## Full re-import

After a change to how competitions are imported, re-read every season and then run the repair step (about 4.5 hours; it reads
everything first and uploads at the end):

```bash
node scripts/loglig-sync/competitions.mjs --list all --all --seasons all --push --url https://ita-league-platform-jpgi.vercel.app
node scripts/loglig-sync/dedupe.mjs --url https://ita-league-platform-jpgi.vercel.app
```

`upload-loglig-to-live.bat` does the one-time first upload of everything (rankings, competitions, leagues, app data, regulations).

## Notes
- Read-only against ita.co.il and loglig.com. Check Loglig's terms for automated access, and keep the federation informed.
- Imports are idempotent: a re-run refreshes what is there and never duplicates it.
