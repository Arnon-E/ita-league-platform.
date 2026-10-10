@echo off
rem Registers run-daily-sync.bat to run every day at 06:30 (only while this PC is on).
rem To remove it later:  Unregister-ScheduledTask -TaskName "ITA Loglig Sync" -Confirm:$false   (PowerShell)
powershell -NoProfile -Command "$a = New-ScheduledTaskAction -Execute '%~dp0run-daily-sync.bat'; $t = New-ScheduledTaskTrigger -Daily -At 6:30am; Register-ScheduledTask -TaskName 'ITA Loglig Sync' -Action $a -Trigger $t -Force | Out-Null; Write-Host 'Daily sync scheduled for 06:30.'"
pause
