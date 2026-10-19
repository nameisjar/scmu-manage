param(
    [string]$PostgresBin = '',
    [int]$DatabasePort = 55432,
    [int]$ApiPort = 5000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$demoRoot = Join-Path $projectRoot '.demo'
$databaseRoot = Join-Path $demoRoot 'postgres'
New-Item -ItemType Directory -Path $demoRoot -Force | Out-Null

if (!$PostgresBin) {
    $pgCommand = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue
    if ($pgCommand) { $PostgresBin = Split-Path -Parent $pgCommand.Source }
}
if (!$PostgresBin -or !(Test-Path (Join-Path $PostgresBin 'initdb.exe'))) {
    throw 'PostgreSQL binaries not found. Supply -PostgresBin with the PostgreSQL bin directory.'
}

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $Program $Arguments" }
}

function Wait-Http {
    param([string]$Url)
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    throw "Service did not become ready: $Url. See logs in $demoRoot."
}

# These variables apply to this process and its children, without replacing any .env files.
$demoEnvironment = @{
    DATABASE_URL = "postgresql://scmu_demo@127.0.0.1:${DatabasePort}/scmu_demo"
    PORT = "$ApiPort"
    FRONTEND_URL = "http://localhost:$FrontendPort"
    VITE_API_URL = "http://localhost:$ApiPort"
    JWT_EXPIRES_IN = '7d'
    NODE_ENV = 'production'
}
$savedEnvironment = @{}
foreach ($key in $demoEnvironment.Keys) {
    $savedEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $demoEnvironment[$key], 'Process')
}
$savedEnvironment['JWT_SECRET'] = [Environment]::GetEnvironmentVariable('JWT_SECRET', 'Process')
$secretFile = Join-Path $demoRoot 'jwt-secret'
if (!(Test-Path $secretFile)) {
    $secretBytes = New-Object byte[] 48
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    $random.GetBytes($secretBytes)
    $random.Dispose()
    [IO.File]::WriteAllText($secretFile, [Convert]::ToBase64String($secretBytes))
}
$env:JWT_SECRET = [IO.File]::ReadAllText($secretFile)

try {
    # Windows locks Prisma's native DLL while the API is running. Stop only
    # processes created by this demo before regenerating the client or rebuilding.
    $processFile = Join-Path $demoRoot 'processes.json'
    if (Test-Path $processFile) {
        $previousServices = Get-Content $processFile -Raw | ConvertFrom-Json
        foreach ($service in $previousServices.PSObject.Properties) {
            $serviceProcess = Get-Process -Id $service.Value.Id -ErrorAction SilentlyContinue
            if ($serviceProcess -and $serviceProcess.ProcessName -eq 'node' -and $serviceProcess.StartTime.ToUniversalTime().ToString('o') -eq $service.Value.StartTime) {
                Stop-Process -Id $serviceProcess.Id
                if (!$serviceProcess.WaitForExit(10000)) { throw "Failed to stop demo service: $($service.Name)" }
            }
        }
    }
    if (!(Test-Path (Join-Path $databaseRoot 'PG_VERSION'))) {
        Invoke-Checked (Join-Path $PostgresBin 'initdb.exe') @('-D', $databaseRoot, '-U', 'scmu_demo', '--auth=trust', '--encoding=UTF8', '--locale=C')
    }
    # This isolated demo cluster accepts local loopback connections only.
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $databaseRoot status 2>$null
    if ($LASTEXITCODE -ne 0) {
        Invoke-Checked (Join-Path $PostgresBin 'pg_ctl.exe') @('-D', $databaseRoot, '-l', (Join-Path $demoRoot 'postgres.log'), '-o', "-h 127.0.0.1 -p $DatabasePort", '-w', 'start')
    }
    $databaseExists = & (Join-Path $PostgresBin 'psql.exe') -h 127.0.0.1 -p $DatabasePort -U scmu_demo -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = 'scmu_demo'"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot connect to the demo PostgreSQL cluster.' }
    if ($databaseExists -ne '1') {
        Invoke-Checked (Join-Path $PostgresBin 'createdb.exe') @('-h', '127.0.0.1', '-p', "$DatabasePort", '-U', 'scmu_demo', 'scmu_demo')
    }

    Push-Location (Join-Path $projectRoot 'backend')
    try {
        if (!(Test-Path 'node_modules/@prisma/client/package.json')) {
            Invoke-Checked 'npm.cmd' @('ci', '--cache', '.npm-cache', '--no-audit', '--no-fund')
        }
        Invoke-Checked 'node' @('node_modules/prisma/build/index.js', 'generate')
        Invoke-Checked 'node' @('node_modules/prisma/build/index.js', 'migrate', 'deploy')
        Invoke-Checked 'node' @('prisma/seed.js')
        New-Item -ItemType Directory -Path 'uploads/pods' -Force | Out-Null
    } finally { Pop-Location }

    Push-Location (Join-Path $projectRoot 'frontend')
    try {
        if (!(Test-Path 'node_modules/vite/package.json')) {
            Invoke-Checked 'npm.cmd' @('ci', '--cache', '.npm-cache', '--no-audit', '--no-fund')
        }
        Invoke-Checked 'npm.cmd' @('run', 'build')
    } finally { Pop-Location }

    $nodePath = (Get-Command node.exe).Source
    $processFile = Join-Path $demoRoot 'processes.json'
    $processInfo = @{}
    if (Test-Path $processFile) {
        $previous = Get-Content $processFile -Raw | ConvertFrom-Json
        foreach ($property in $previous.PSObject.Properties) { $processInfo[$property.Name] = $property.Value }
    }
    foreach ($service in @(
        @{ Name = 'backend'; Port = $ApiPort; Directory = 'backend'; Arguments = @('server.js'); Url = "http://127.0.0.1:$ApiPort/health" },
        @{ Name = 'frontend'; Port = $FrontendPort; Directory = 'frontend'; Arguments = @('node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', "$FrontendPort", '--strictPort'); Url = "http://127.0.0.1:$FrontendPort" }
    )) {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $service.Port -ErrorAction SilentlyContinue
        if ($listener) {
            $owned = $processInfo[$service.Name]
            $existingProcess = if ($owned) { Get-Process -Id $owned.Id -ErrorAction SilentlyContinue }
            if (!$owned -or !$existingProcess -or $listener[0].OwningProcess -ne $owned.Id -or $existingProcess.StartTime.ToUniversalTime().ToString('o') -ne $owned.StartTime) {
                throw "Port $($service.Port) is already used by another process. Choose another demo port or stop that service."
            }
        } else {
            $serviceProcess = Start-Process -FilePath $nodePath -ArgumentList $service.Arguments -WorkingDirectory (Join-Path $projectRoot $service.Directory) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $demoRoot "$($service.Name).out.log") -RedirectStandardError (Join-Path $demoRoot "$($service.Name).err.log")
            $processInfo[$service.Name] = @{ Id = $serviceProcess.Id; StartTime = $serviceProcess.StartTime.ToUniversalTime().ToString('o') }
            $processInfo | ConvertTo-Json | Set-Content $processFile -Encoding UTF8
        }
        Wait-Http $service.Url
    }
    Write-Host "SCMU demo ready: http://localhost:$FrontendPort" -ForegroundColor Green
    Write-Host "API health: http://localhost:$ApiPort/health"
    Write-Host 'Direktur (Super Admin): admin@scmu.local / Admin@1234'
    Write-Host 'Admin operasional: operasional@scmu.local / Ops@1234'
} finally {
    foreach ($key in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($key, $savedEnvironment[$key], 'Process')
    }
}
