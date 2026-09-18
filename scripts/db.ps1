param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status', 'restart')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$PgHome = if ($env:PG_HOME) { $env:PG_HOME } else { 'C:\Users\cyco\pgsql' }
$PgData = if ($env:PG_DATA) { $env:PG_DATA } else { 'C:\Users\cyco\pgdata' }

$pgCtl = Join-Path $PgHome 'bin\pg_ctl.exe'
$log = Join-Path $PgData 'server.log'

if (-not (Test-Path -LiteralPath $pgCtl)) {
  Write-Error "pg_ctl not found at $pgCtl. Set PG_HOME or install PostgreSQL."
}

function Test-Running {
  $pidFile = Join-Path $PgData 'postmaster.pid'
  if (-not (Test-Path -LiteralPath $pidFile)) { return $false }
  $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue
  return [bool]$conn.TcpTestSucceeded
}

switch ($Action) {
  'start' {
    if (Test-Running) { Write-Output 'Postgres already running on 127.0.0.1:5432.'; break }
    & $pgCtl -D $PgData -l $log start
    Start-Sleep -Seconds 2
    Write-Output "Started. Log: $log"
  }
  'stop' {
    if (-not (Test-Running)) { Write-Output 'Postgres is not running.'; break }
    & $pgCtl -D $PgData stop -m fast
    Write-Output 'Stopped.'
  }
  'restart' {
    & $pgCtl -D $PgData stop -m fast 2>$null
    Start-Sleep -Seconds 1
    & $pgCtl -D $PgData -l $log start
    Write-Output "Restarted. Log: $log"
  }
  'status' {
    if (Test-Running) {
      Write-Output 'Postgres is running on 127.0.0.1:5432.'
    } else {
      Write-Output 'Postgres is NOT running.'
    }
  }
}
