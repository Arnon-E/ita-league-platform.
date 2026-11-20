@echo off
rem ITF junior events hosted by Israel (world.tennis): draws and results, from the site's junior calendar. Started every hour by install-itf-sync.bat; only the last run is kept in .loglig-dump\itf-sync.log
rem world.tennis sits behind a CAPTCHA. A browser profile that passed it once (solve-itf.bat) is reused in the background; when the site asks again the run leaves
rem .loglig-dump\itf-needs-captcha.txt and ends with code 3: run solve-itf.bat and solve the CAPTCHA in the window that opens.
rem Only 8:00-22:00 (Israel time) and only while an Israeli event is on; a score that did not change is not sent again.
cd /d "%~dp0"
if not exist .loglig-dump mkdir .loglig-dump
set URL=https://ita-league-platform-jpgi.vercel.app
echo ===== %date% %time% ===== > .loglig-dump\itf-sync.log
node scripts\loglig-sync\itf.mjs --live --push --url %URL% >> .loglig-dump\itf-sync.log 2>&1
