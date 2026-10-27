param([string]$PostgresBin = '')

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$demoRoot = Join-Path $projectRoot '.demo'
$processFile = Join-Path $demoRoot 'processes.json'

if (Test-Path $processFile) {
    $services = Get-Content $processFile -Raw | ConvertFrom-Json
    foreach ($service in $services.PSObject.Properties) {
        $serviceProcess = Get-Process -Id $service.Value.Id -ErrorAction SilentlyContinue
        if ($serviceProcess -and $serviceProcess.ProcessName -eq 'node' -and $serviceProcess.StartTime.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ') -eq ([datetimeoffset]$service.Value.StartTime).UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ss.ffffffZ')) {
            Stop-Process -Id $serviceProcess.Id
        }
    }
}
if (!$PostgresBin) {
    $pgCommand = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue
    if ($pgCommand) { $PostgresBin = Split-Path -Parent $pgCommand.Source }
}
$databaseRoot = Join-Path $demoRoot 'postgres'
if ($PostgresBin -and (Test-Path (Join-Path $databaseRoot 'postmaster.pid'))) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $databaseRoot -m fast -w stop
    if ($LASTEXITCODE -ne 0) { throw 'Failed to stop the demo database.' }
}
Write-Host 'SCMU demo stopped. Database files are preserved in .demo/postgres.'
