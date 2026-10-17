@echo off
rem Registers run-rosters-sync.bat to run every 20 minutes (only while this PC is on), in a hidden window.
rem It keeps the "registered players" of open competitions on the site close to what Loglig shows.
rem To change the interval, edit the 20 below and run this file again. To remove it (PowerShell):
rem     Unregister-ScheduledTask -TaskName "ITA Loglig Rosters" -Confirm:$false
powershell -NoProfile -Command "$bat = '%~dp0run-rosters-sync.bat'; $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -Command \"& ''' + $bat + '''\"'); $t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 20) -RepetitionDuration (New-TimeSpan -Days 3650); $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10); Register-ScheduledTask -TaskName 'ITA Loglig Rosters' -Action $a -Trigger $t -Settings $s -Force | Out-Null; Write-Host 'Rosters sync scheduled every 20 minutes.'"
pause
