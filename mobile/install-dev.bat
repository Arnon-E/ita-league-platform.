@echo off
rem Builds the Android app against the DEVELOPMENT site and installs it on the connected phone (replaces the installed app; the login is kept only if it is the same site, so expect to sign in again).
rem Back to the live site: install-prod.bat. The key is read from %USERPROFILE%\.ita-dev\dev-sync.env (VERCEL_BYPASS), never from the repository.
setlocal
cd /d "%~dp0"
set "ENVFILE=%USERPROFILE%\.ita-dev\dev-sync.env"
if not exist "%ENVFILE%" (echo missing %ENVFILE% & exit /b 1)
for /f "usebackq tokens=1,* delims==" %%A in ("%ENVFILE%") do if "%%A"=="VERCEL_BYPASS" set "ITA_API_BYPASS=%%B"
if "%ITA_API_BYPASS%"=="" (echo VERCEL_BYPASS is not in %ENVFILE% & exit /b 1)
set "ITA_API_URL=https://ita-league-platform-jpgi-git-dev-arnonerez1-4924s-projects.vercel.app"
call "%~dp0build-install.bat"
