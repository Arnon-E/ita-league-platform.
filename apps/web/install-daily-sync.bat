@echo off
rem Registers run-daily-sync.bat to run every day at 06:30. If the PC is asleep or off then, it runs as soon as it is back (and on battery too):
rem a skipped day means competitions published that day reach the site a day late.
rem To remove it later:  Unregister-ScheduledTask -TaskName "ITA Loglig Sync" -Confirm:$false   (PowerShell)
powershell -NoProfile -Command "$a = New-ScheduledTaskAction -Execute '%~dp0run-daily-sync.bat'; $t = New-ScheduledTaskTrigger -Daily -At 6:30am; $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 6); Register-ScheduledTask -TaskName 'ITA Loglig Sync' -Action $a -Trigger $t -Settings $s -Force | Out-Null; Write-Host 'Daily sync scheduled for 06:30.'"
pause
