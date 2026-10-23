# Registers the DEVELOPMENT site's syncs in Windows Task Scheduler, mirroring the live site's two tasks (only while this PC is on):
#   "ITA Dev Loglig Sync"    daily at 06:45  -> run-dev-daily-sync.bat   (the live one runs at 06:30)
#   "ITA Dev Loglig Rosters" every 10 minutes (started 5 minutes after now, so it does not overlap the live one) -> run-dev-rosters-sync.bat
# Needs %USERPROFILE%\.ita-dev\dev-sync.env with CRON_SECRET (the development one) and VERCEL_BYPASS (a Vercel "Protection Bypass for Automation" secret).
# To remove both:  powershell -File uninstall-dev-sync.ps1
$env_file = Join-Path $env:USERPROFILE '.ita-dev\dev-sync.env'
if (-not (Test-Path $env_file)) { Write-Host "Missing $env_file (see docs/dev-environment.md)"; exit 1 }
$daily = Join-Path $PSScriptRoot 'run-dev-daily-sync.bat'
$rosters = Join-Path $PSScriptRoot 'run-dev-rosters-sync.bat'
$a1 = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$daily`""
$t1 = New-ScheduledTaskTrigger -Daily -At 6:45am
Register-ScheduledTask -TaskName 'ITA Dev Loglig Sync' -Action $a1 -Trigger $t1 -Force | Out-Null
$minutes = 10
$a2 = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -Command "& ''' + $rosters + '''"')
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes $minutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$s2 = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes ($minutes - 1))
Register-ScheduledTask -TaskName 'ITA Dev Loglig Rosters' -Action $a2 -Trigger $t2 -Settings $s2 -Force | Out-Null
Write-Host 'Development syncs scheduled: daily 06:45 and every 10 minutes.'
