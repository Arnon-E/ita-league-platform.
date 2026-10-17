@echo off
rem Registered players of the competitions that are still open, from Loglig, so a registration made there shows up on the site within minutes.
rem Light (about ten requests). Started every 20 minutes by install-rosters-sync.bat; only the last run is kept in .loglig-dump\rosters-sync.log
cd /d "%~dp0"
if not exist .loglig-dump mkdir .loglig-dump
set URL=https://ita-league-platform-jpgi.vercel.app
echo ===== %date% %time% ===== > .loglig-dump\rosters-sync.log
node scripts\loglig-sync\rosters.mjs --push --url %URL% >> .loglig-dump\rosters-sync.log 2>&1
