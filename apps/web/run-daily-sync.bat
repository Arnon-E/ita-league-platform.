@echo off
rem Daily refresh of the ITA data on the live site: rankings, competitions (new, upcoming and recently finished), team leagues.
rem Registered with Windows Task Scheduler by install-daily-sync.bat. Output goes to .loglig-dump\daily-sync.log
cd /d "%~dp0"
if not exist .loglig-dump mkdir .loglig-dump
set URL=https://ita-league-platform-jpgi.vercel.app
echo ===== %date% %time% ===== >> .loglig-dump\daily-sync.log
node scripts\loglig-sync\rankings.mjs --push --url %URL% >> .loglig-dump\daily-sync.log 2>&1
node scripts\loglig-sync\competitions.mjs --list national,regional,seniors --all --recent 21 --push --url %URL% >> .loglig-dump\daily-sync.log 2>&1
node scripts\loglig-sync\leagues.mjs --push --url %URL% >> .loglig-dump\daily-sync.log 2>&1
echo done >> .loglig-dump\daily-sync.log
