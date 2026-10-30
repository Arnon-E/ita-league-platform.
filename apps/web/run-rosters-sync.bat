@echo off
rem Registered players and fresh draws / results of the competitions that are still on, from Loglig, so what happens there shows up on the site within minutes.
rem Light (a few dozen requests). Started every 10 minutes by install-rosters-sync.bat; only the last run is kept in .loglig-dump\rosters-sync.log
rem It only does anything between 9:00 and 19:00 (Israel time) and only while a competition is on (scripts\loglig-sync\gate.mjs reads the daily sync's saved
rem list), so the database is left to sleep the rest of the time. If the gate itself breaks, the sync runs as it always did.
cd /d "%~dp0"
if not exist .loglig-dump mkdir .loglig-dump
set URL=https://ita-league-platform-jpgi.vercel.app
echo ===== %date% %time% ===== > .loglig-dump\rosters-sync.log
rem Tennis Europe tournaments abroad, 8:00-22:00 (independent of the gate below): every 10 minutes it looks at the events known to have Israeli players (one small request each,
rem matches are read only when the event's "last changed" moved); about once an hour it looks at every event that is on, to find new ones
node scripts\loglig-sync\abroad.mjs --live --push --url %URL% >> .loglig-dump\rosters-sync.log 2>&1
node scripts\loglig-sync\gate.mjs >> .loglig-dump\rosters-sync.log 2>&1
if errorlevel 10 exit /b 0
node scripts\loglig-sync\rosters.mjs --push --url %URL% >> .loglig-dump\rosters-sync.log 2>&1
node scripts\loglig-sync\live-results.mjs --push --url %URL% >> .loglig-dump\rosters-sync.log 2>&1
rem Masters (tournamentsoftware.com): reads only today's match day, and only about once an hour (it keeps its own stamp)
node scripts\loglig-sync\masters-live.mjs --push --url %URL% >> .loglig-dump\rosters-sync.log 2>&1
