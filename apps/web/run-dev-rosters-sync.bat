@echo off
rem The 10-minute sync of the DEVELOPMENT site (registered players, fresh draws and results), the same as run-rosters-sync.bat does for the live site.
rem Only the last run is kept in %USERPROFILE%\.ita-dev\rosters-sync.log. See run-dev-daily-sync.bat for where the secrets and data live.
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
%RUN% scripts\loglig-sync\rosters.mjs --push --url %URL% >> "%DEVDIR%\rosters-sync.log" 2>&1
%RUN% scripts\loglig-sync\live-results.mjs --push --url %URL% >> "%DEVDIR%\rosters-sync.log" 2>&1
