# Removes the development site's two scheduled syncs (see install-dev-sync.ps1). The live site's tasks are not touched.
foreach ($n in 'ITA Dev Loglig Sync', 'ITA Dev Loglig Rosters') {
  if (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $n -Confirm:$false; Write-Host "removed $n" } else { Write-Host "$n was not scheduled" }
}
