# Registers run-itf-sync.bat to run every hour (only while this PC is on), in a hidden window.
# It keeps the draws and results of the ITF junior events held in Israel close to what world.tennis shows.
# To remove it:  Unregister-ScheduledTask -TaskName "ITA ITF Juniors" -Confirm:$false
$bat = Join-Path $PSScriptRoot 'run-itf-sync.bat'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -Command "& ''' + $bat + '''"')
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20)
Register-ScheduledTask -TaskName 'ITA ITF Juniors' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host 'ITF juniors sync scheduled every hour.'
