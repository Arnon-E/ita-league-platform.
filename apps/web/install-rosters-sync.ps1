# Registers run-rosters-sync.bat to run every 10 minutes (only while this PC is on), in a hidden window.
# It keeps the registered players, draws and results of the competitions that are on close to what Loglig shows.
# To change the interval, edit $minutes below and run install-rosters-sync.bat again.
# To remove it:  Unregister-ScheduledTask -TaskName "ITA Loglig Rosters" -Confirm:$false
$minutes = 10
$bat = Join-Path $PSScriptRoot 'run-rosters-sync.bat'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -Command "& ''' + $bat + '''"')
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $minutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes ($minutes - 1))
Register-ScheduledTask -TaskName 'ITA Loglig Rosters' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Rosters and results sync scheduled every $minutes minutes."
