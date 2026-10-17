@echo off
rem Registered players and fresh draws / results of the competitions that are still on, from Loglig, so what happens there shows up on the site within minutes.
rem Light (a few dozen requests). Started every 10 minutes by install-rosters-sync.bat; only the last run is kept in .loglig-dump\rosters-sync.log
cd /d "%~dp0"
if not exist .loglig-dump mkdir .loglig-dump
set URL=https://ita-league-platform-jpgi.vercel.app
echo ===== %date% %time% ===== > .loglig-dump\rosters-sync.log
node scripts\loglig-sync\rosters.mjs --push --url %URL% >> .loglig-dump\rosters-sync.log 2>&1
node scripts\loglig-sync\live-results.mjs --push --url %URL% >> .loglig-dump\rosters-sync.log 2>&1
