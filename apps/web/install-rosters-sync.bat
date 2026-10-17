@echo off
rem Registers run-rosters-sync.bat to run every 10 minutes (only while this PC is on), in a hidden window.
rem It keeps the registered players, draws and results of the competitions that are on close to what Loglig shows.
rem To change the interval, edit the 10 below and run this file again. To remove it (PowerShell):
rem     Unregister-ScheduledTask -TaskName "ITA Loglig Rosters" -Confirm:$false
powershell -NoProfile -Command "$bat = '%~dp0run-rosters-sync.bat'; $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -Command \"& ''' + $bat + '''\"'); $t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650); $s = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 9); Register-ScheduledTask -TaskName 'ITA Loglig Rosters' -Action $a -Trigger $t -Settings $s -Force | Out-Null; Write-Host 'Rosters sync scheduled every 10 minutes.'"
pause
