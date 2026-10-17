@echo off
rem Registers the 10-minute sync of registered players, draws and results (see install-rosters-sync.ps1 for the details and how to remove it).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-rosters-sync.ps1"
pause
