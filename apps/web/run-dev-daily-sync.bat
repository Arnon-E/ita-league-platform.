@echo off
rem Daily refresh of the DEVELOPMENT site, the same steps as run-daily-sync.bat does for the live site (docs/dev-environment.md).
rem Secrets (the development CRON_SECRET and the Vercel protection-bypass secret) are read from %USERPROFILE%\.ita-dev\dev-sync.env, never from the repository.
rem The data it reads goes to %USERPROFILE%\.ita-dev\dump (not .loglig-dump), so it never collides with the live site's runs.
cd /d "%~dp0"
set "DEVDIR=%USERPROFILE%\.ita-dev"
set "ENVFILE=%DEVDIR%\dev-sync.env"
if not exist "%ENVFILE%" (echo missing %ENVFILE% & exit /b 1)
if not exist "%DEVDIR%\dump" mkdir "%DEVDIR%\dump"
set "LOGLIG_DUMP_DIR=%DEVDIR%\dump"
set "HERE=%CD:\=/%"
set "URL=https://ita-league-platform-jpgi-git-dev-arnonerez1-4924s-projects.vercel.app"
set "RUN=node --env-file="%ENVFILE%" --import file:///%HERE%/scripts/loglig-sync/_bypass.mjs"
echo ===== %date% %time% ===== >> "%DEVDIR%\daily-sync.log"
%RUN% scripts\loglig-sync\rankings.mjs --push --url %URL% >> "%DEVDIR%\daily-sync.log" 2>&1
%RUN% scripts\loglig-sync\competitions.mjs --list all --all --recent 21 --push --url %URL% >> "%DEVDIR%\daily-sync.log" 2>&1
%RUN% scripts\loglig-sync\dedupe.mjs --url %URL% >> "%DEVDIR%\daily-sync.log" 2>&1
%RUN% scripts\loglig-sync\rosters.mjs --push --url %URL% >> "%DEVDIR%\daily-sync.log" 2>&1
%RUN% scripts\loglig-sync\photos.mjs --push --limit 300 --url %URL% >> "%DEVDIR%\daily-sync.log" 2>&1
%RUN% scripts\loglig-sync\leagues.mjs --push --url %URL% >> "%DEVDIR%\daily-sync.log" 2>&1
%RUN% scripts\loglig-sync\app-data.mjs --push --url %URL% >> "%DEVDIR%\daily-sync.log" 2>&1
%RUN% scripts\loglig-sync\regulations.mjs --push --url %URL% >> "%DEVDIR%\daily-sync.log" 2>&1
%RUN% scripts\loglig-sync\abroad.mjs --days 300 --push --url %URL% >> "%DEVDIR%\daily-sync.log" 2>&1
echo done >> "%DEVDIR%\daily-sync.log"
