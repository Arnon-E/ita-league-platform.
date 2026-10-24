@echo off
rem Builds the Android app against the LIVE site and installs it on the connected phone (this is the normal build; run it to go back from install-dev.bat).
setlocal
cd /d "%~dp0"
set "ITA_API_URL="
set "ITA_API_BYPASS="
call "%~dp0build-install.bat"
