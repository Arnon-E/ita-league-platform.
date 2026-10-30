@echo off
rem The 10-minute sync of the DEVELOPMENT site (registered players, fresh draws and results), the same as run-rosters-sync.bat does for the live site.
rem Only the last run is kept in %USERPROFILE%\.ita-dev\rosters-sync.log. See run-dev-daily-sync.bat for where the secrets and data live.
rem Like the live one, it only does anything between 9:00 and 19:00 (Israel time) and only while a competition is on (gate.mjs reads the daily sync's saved list).
cd /d "%~dp0"
set "DEVDIR=%USERPROFILE%\.ita-dev"
set "ENVFILE=%DEVDIR%\dev-sync.env"
if not exist "%ENVFILE%" (echo missing %ENVFILE% & exit /b 1)
if not exist "%DEVDIR%\dump" mkdir "%DEVDIR%\dump"
set "LOGLIG_DUMP_DIR=%DEVDIR%\dump"
set "HERE=%CD:\=/%"
set "URL=https://ita-league-platform-jpgi-git-dev-arnonerez1-4924s-projects.vercel.app"
set "RUN=node --env-file="%ENVFILE%" --import file:///%HERE%/scripts/loglig-sync/_bypass.mjs"
echo ===== %date% %time% ===== > "%DEVDIR%\rosters-sync.log"
rem Tennis Europe tournaments abroad, 8:00-22:00 (independent of the gate below): every 10 minutes it looks at the events known to have Israeli players (one small request each,
rem matches are read only when the event's "last changed" moved); about once an hour it looks at every event that is on, to find new ones
%RUN% scripts\loglig-sync\abroad.mjs --live --push --url %URL% >> "%DEVDIR%\rosters-sync.log" 2>&1
node scripts\loglig-sync\gate.mjs >> "%DEVDIR%\rosters-sync.log" 2>&1
if errorlevel 10 exit /b 0
%RUN% scripts\loglig-sync\rosters.mjs --push --url %URL% >> "%DEVDIR%\rosters-sync.log" 2>&1
%RUN% scripts\loglig-sync\live-results.mjs --push --url %URL% >> "%DEVDIR%\rosters-sync.log" 2>&1
rem Masters (tournamentsoftware.com): reads only today's match day, and only about once an hour (it keeps its own stamp)
%RUN% scripts\loglig-sync\masters-live.mjs --push --url %URL% >> "%DEVDIR%\rosters-sync.log" 2>&1
