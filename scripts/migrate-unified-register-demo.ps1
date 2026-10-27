param([string]$PostgresBin='C:\Program Files\PostgreSQL\14\bin')
$ErrorActionPreference='Stop'
$scmuRoot=Split-Path -Parent $PSScriptRoot
$scmuStamp=Get-Date -Format 'yyyyMMddHHmmss'
$scmuCopy="scmu_register_check_$scmuStamp"
if($scmuCopy -notmatch '^scmu_register_check_\d+$'){throw 'Invalid isolated migration database name'}
$scmuBackupRoot=Join-Path $scmuRoot '.demo/backups'
New-Item -ItemType Directory -Path $scmuBackupRoot -Force | Out-Null
$scmuDump=Join-Path $scmuBackupRoot "unified-register-$scmuStamp.dump"
$scmuSnapshot=Join-Path $scmuBackupRoot "unified-register-copy-$scmuStamp.json"
$scmuLiveSnapshot=Join-Path $scmuBackupRoot "unified-register-live-$scmuStamp.json"
function Invoke-Checked([string]$Program,[string[]]$Arguments){& $Program @Arguments;if($LASTEXITCODE -ne 0){throw "Command failed: $Program"}}
Push-Location $scmuRoot
$scmuSavedDb=$env:DATABASE_URL
$scmuSavedCleanup=$env:SCMU_ALLOWED_CLEANUP
try{
 # This workflow never targets production and never runs a seed or database reset.
 $env:DATABASE_URL='postgresql://scmu_demo@127.0.0.1:55432/scmu_demo'
 $env:SCMU_ALLOWED_CLEANUP='register-customer-fields'
 Invoke-Checked (Join-Path $PostgresBin 'pg_dump.exe') @('-h','127.0.0.1','-p','55432','-U','scmu_demo','-d','scmu_demo','-Fc','-f',$scmuDump)
 & (Join-Path $PostgresBin 'pg_restore.exe') --list $scmuDump | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Backup verification failed'}
 Invoke-Checked (Join-Path $PostgresBin 'createdb.exe') @('-h','127.0.0.1','-p','55432','-U','scmu_demo',$scmuCopy)
 try{
  Invoke-Checked (Join-Path $PostgresBin 'pg_restore.exe') @('-h','127.0.0.1','-p','55432','-U','scmu_demo','--no-owner','--exit-on-error','-d',$scmuCopy,$scmuDump)
  $env:DATABASE_URL="postgresql://scmu_demo@127.0.0.1:55432/$scmuCopy"
  Invoke-Checked 'node' @('scripts/register-data-snapshot.cjs','write',$scmuSnapshot)
  Invoke-Checked 'node' @('backend/node_modules/prisma/build/index.js','migrate','deploy','--schema','backend/prisma/schema.prisma')
  Invoke-Checked 'node' @('scripts/register-data-snapshot.cjs','verify',$scmuSnapshot)
 }finally{
  # Only the uniquely named copy created by this invocation is removed.
  Invoke-Checked (Join-Path $PostgresBin 'dropdb.exe') @('-h','127.0.0.1','-p','55432','-U','scmu_demo',$scmuCopy)
 }
 $env:DATABASE_URL='postgresql://scmu_demo@127.0.0.1:55432/scmu_demo'
 Invoke-Checked 'node' @('scripts/register-data-snapshot.cjs','write',$scmuLiveSnapshot)
 Invoke-Checked 'node' @('backend/node_modules/prisma/build/index.js','migrate','deploy','--schema','backend/prisma/schema.prisma')
 Invoke-Checked 'node' @('scripts/register-data-snapshot.cjs','verify',$scmuLiveSnapshot)
 Write-Output "Migration verified on restored copy and demo. Backup: $scmuDump"
}finally{$env:DATABASE_URL=$scmuSavedDb;$env:SCMU_ALLOWED_CLEANUP=$scmuSavedCleanup;Pop-Location}
