@echo off
rem Registers the hourly ITF juniors sync (see install-itf-sync.ps1 for the details and how to remove it). Run solve-itf.bat first.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-itf-sync.ps1"
pause
