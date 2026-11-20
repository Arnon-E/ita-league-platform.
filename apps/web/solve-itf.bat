@echo off
rem Opens a window on world.tennis so that you can solve its CAPTCHA once; the hourly ITF sync (run-itf-sync.bat) then reuses what the window earned (profile in %USERPROFILE%\.ita-itf).
rem Leave the window open: it closes by itself when the page has loaded.
cd /d "%~dp0"
node scripts\loglig-sync\itf.mjs --solve
pause
