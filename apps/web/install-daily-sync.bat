@echo off
rem Registers run-daily-sync.bat to run every day at 06:30 (only while this PC is on and you are logged in).
rem To remove it later:  schtasks /Delete /TN "ITA Loglig Sync" /F
schtasks /Create /SC DAILY /ST 06:30 /TN "ITA Loglig Sync" /TR "\"%~dp0run-daily-sync.bat\"" /F
if errorlevel 1 (echo Failed to create the task. Try running this file as Administrator.) else (echo Daily sync scheduled for 06:30.)
pause
