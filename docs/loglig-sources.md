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
| **Competitions as the Loglig app lists them** | `https://loglig.com:8443/api/Union/Competitions{Youth,Adult,Senior,Daily}/38?seasonId=<season>`; seasons from `api/Leauges/AthleticsSeasons/38` | JSON: title and categories (`TeamId` = the category's draw page id) | **Mirrored**: `competitions.mjs` (also competitions ita.co.il does not link), `live-results.mjs` |
| **Registered players per category** | `https://loglig.com:8443/api/NewUnion/GetTeamRoster/<competitionId>/<categoryTeamId>` | JSON: user id, name, photo file | **Mirrored**: `rosters.mjs`, `roster-photos.mjs` |
| Clubs, events, forms, sponsors, federation info | the same public app API (`app-data.mjs`) | JSON | **Mirrored** |
| Regulations and procedures | links on ita.co.il | PDF / Word / Excel | **Linked**: `regulations.mjs` (documents stay on the federation's site) |

## Data rules (what the import corrects)
- **Score orientation.** A draw page prints the score from the side of the player listed second in the row. The import swaps it so
  sets are stored from player a's side; checked against the knockout trees (the recorded winner is always the one who appears in
  the next round).
- **One event, two titles.** ita.co.il and the Loglig app name the same competition differently ("אליפות ארצית קיץ 3 2026 ע"ש
  זייתוני" / "ארצית קיץ 3 2026 ע"ש זייתוני"). The import matches an existing tournament by title containment on overlapping dates and
  keeps its name; `dedupe.mjs` removes older doubles.
- **Categories.** "נערים", "ילדים" are boys and "נערות", "ילדות" girls (not open categories), so their players are not created a second
  time; open categories reuse a known player of either gender. Doubles pairs ("A / B") and "Bye" are not players.
- **Empty dates.** Loglig shows an unset date as 01/01/1753; it is never used as a competition or match date (a match gets its
  competition's start), and players estimated from such a year are re-estimated.
- **Players** are matched by name (and birth year when the ranking has it) to the ranking mirror (`rk:` keys), the rosters (`lu:`)
  and earlier imports (`cp:`); only an unknown name creates a player, with an estimated birth year.

## Notes
- A Loglig **player account** (role "שחקנים") sees only its own record (profile, registrations, documents, achievements). It cannot list other players or competitions; a club-manager or federation account would be needed for that.
- National ID numbers and documents appear only in logged-in pages and are not mirrored. Public tables contain names and birth years (including minors): publish only with the federation's agreement.
- Be gentle: a few requests per minute, nothing that writes. Check Loglig's terms for automated access.

## Running it
See `apps/web/scripts/loglig-sync/README.md`: the scripts, the daily refresh (06:30), the live refresh of competitions that are on
(every 10 minutes) and the full re-import.
