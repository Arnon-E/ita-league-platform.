# Where the ITA's data is shown (all public, no login)

Found by reading the ITA site (ita.co.il) and the public Loglig pages it embeds. Season 1755, union 38.

| Data | Where | Format | Status here |
|---|---|---|---|
| **Individual rankings** (all ages, by gender) | `POST https://loglig.com:2053/LeagueRank/TennisUnionRanks` with `unionId=38&seasonId=1755&ageId=&genderId=0|1&isModal=true` | HTML table: rank, name, birth year, club, national, TEU, ITF, total | **Mirrored**: `scripts/loglig-sync/rankings.mjs` + `/api/sync/loglig` |
| Rankings per age group | same, `ageId` 10577-10587 (boys/girls 12/14/16/18, national men/women) | same | derivable from birth year (done in the app) |
| Doubles / mixed rankings | PDFs on ita.co.il (`דירוג זוגות ...`) | PDF | not yet |
| **Competition list + details** | `ita.co.il/תחרויות-נוער-ארציות/` (also אזוריות, בינלאומיות, סבב גילאי 10, סניורים, בוגרים), one WordPress page per competition at `/competitions/<slug>/` | HTML: dates, registration deadline, fee, venues (club, address, phone), age categories, format rules | **Mirrored**: `scripts/loglig-sync/competitions.mjs` (national, regional, seniors; upcoming ones with registration deadline + sign-up link) |
| **Draws, schedule, results per category** | `https://loglig.com:2053/LeagueTable/SchedulesForTennisCompetition/<categoryId>?seasonId=1755` (embedded as iframes in each competition page) | HTML: every match with status, venue, round ("1 - 16" = slot 1 of 16), date/time, "St" (starts at) / "NB" (not before), both players with clubs, score | **Mirrored** (same script) |
| **Adult team league (Winner league)** men id 14352, women id 14355 | `LeagueTable/TennisLeagueDetails?id=<id>&seasonId=1755` (standings) and `LeagueTable/Schedules/<id>?seasonId=1755` (fixtures) | HTML: groups A/B, played/points/W/L/sets/games, cross-table of results | **Mirrored** as a read-only league document: `scripts/loglig-sync/leagues.mjs`, pages `/leagues` |
| Yearly calendar | `ita.co.il/wp-content/uploads/<yyyy>/<mm>/גאנט-מעודכן-<date>.xlsx` | Excel | not yet |
| Registration forms | `loglig.com/Activity/Form/<id>?seasonId=1755` (login/registration happens on Loglig) | form | link out |

## Notes
- A Loglig **player account** (role "שחקנים") sees only its own record (profile, registrations, documents, achievements). It cannot list other players or competitions; a club-manager or federation account would be needed for that.
- National ID numbers and documents appear only in logged-in pages and are not mirrored. Public tables contain names and birth years (including minors): publish only with the federation's agreement.
- Be gentle: a few requests per minute, nothing that writes. Check Loglig's terms for automated access.

## Running it
- One-time full upload: `apps/web/upload-loglig-to-live.bat` (also removes the sample test competition).
- Daily refresh: `apps/web/install-daily-sync.bat` registers `run-daily-sync.bat` in Windows Task Scheduler (06:30; log in `apps/web/.loglig-dump/daily-sync.log`). It skips competitions that ended more than 21 days ago.
