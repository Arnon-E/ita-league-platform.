@echo off
rem One-time full upload of the ITA data to the live site (after the code has been deployed). Double-click to run.
cd /d "%~dp0"
set URL=https://ita-league-platform-jpgi.vercel.app

echo === Removing the test competition ===
node scripts\loglig-sync\remove-tournament.mjs --test-competition --url %URL%
echo.
echo === Rankings ===
node scripts\loglig-sync\rankings.mjs --push --url %URL%
echo.
echo === Competitions: national, regional, seniors - draws, results and upcoming registrations (about 15 minutes) ===
node scripts\loglig-sync\competitions.mjs --list national,regional,seniors --all --push --url %URL%
echo.
echo === Team leagues ===
node scripts\loglig-sync\leagues.mjs --push --url %URL%
echo.
echo Finished. Check %URL%
pause
