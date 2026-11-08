# Runs the Backend without Docker on Windows: a portable MySQL 8.4 (no installer, no admin rights),
# the same schema and users as docker-compose, then the pipeline and/or the app.
# Use it when Docker Desktop / WSL cannot be installed. Docker Compose stays the main way.
#
#   1. Download the MySQL 8.4 "ZIP Archive" for Windows from https://dev.mysql.com/downloads/mysql/
#      and unzip it, e.g. to %USERPROFILE%\Tools\mysql-8.4.7-winx64   (or pass -MySqlDir)
#   2. cd Backend; copy .env.example .env; fill in the three MySQL passwords (and GEMINI_API_KEY)
#   3. cd Backend; npm ci            (mysql2 for the app store and the pipeline)
#   4. powershell -ExecutionPolicy Bypass -File scripts\local-mysql.ps1 -Pipeline -App
#
#   -Pipeline     run the pipeline once after MySQL is up (node pipeline/run.js)
#   -App          start the Scam Guardian server on the MySQL store (stays in the foreground)
#   -Stop         stop the local MySQL server
#   -Reset        delete the local database and create it again (all data is lost)
#
# Data lives in Backend\local-mysql (git-ignored). Passwords are read from Backend\.env only.
param([string]$MySqlDir = "$env:USERPROFILE\Tools\mysql-8.4.7-winx64", [switch]$Pipeline, [switch]$App, [switch]$Stop, [switch]$Reset)
$ErrorActionPreference = 'Continue'   # native tools write warnings to stderr; failures are checked with exit codes

$backend = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repo = (Resolve-Path (Join-Path $backend '..')).Path
$data = Join-Path $backend 'local-mysql'   # no leading dot: mysqld on Windows fails to start from a dot-folder
$mysqld = Join-Path $MySqlDir 'bin\mysqld.exe'
$mysql = Join-Path $MySqlDir 'bin\mysql.exe'
$admin = Join-Path $MySqlDir 'bin\mysqladmin.exe'
if (-not (Test-Path $mysqld)) { throw "MySQL not found at $MySqlDir. Unzip the MySQL 8.4 ZIP there or pass -MySqlDir." }

# --- settings from Backend\.env (never printed) ---
$envFile = Join-Path $backend '.env'
if (-not (Test-Path $envFile)) { throw 'Backend\.env is missing: copy .env.example to .env and fill in the passwords.' }
$cfg = @{}   # -cmatch, not -match: case-insensitive [A-Z] breaks on the letter I under an az/tr Windows locale
foreach ($line in Get-Content $envFile) { if ($line -cmatch '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim('"').Trim("'") } }
foreach ($k in 'MYSQL_ROOT_PASSWORD', 'MYSQL_APP_USER', 'MYSQL_APP_PASSWORD', 'MYSQL_PIPELINE_USER', 'MYSQL_PIPELINE_PASSWORD') {
  if (-not $cfg[$k]) { throw "Set $k in Backend\.env" }
}
$port = if ($cfg['MYSQL_PORT']) { $cfg['MYSQL_PORT'] } else { '3306' }

# The password goes through MYSQL_PWD (not the command line), and only for the one call.
function Invoke-Admin([string]$pw, [string[]]$cmd) {
  if ($pw) { $env:MYSQL_PWD = $pw } else { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
  try { & $admin --host=127.0.0.1 "--port=$port" --user=root @cmd 2>$null | Out-Null; return $LASTEXITCODE -eq 0 }
  finally { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
}
function Test-Up { return Invoke-Admin $cfg['MYSQL_ROOT_PASSWORD'] @('ping') }
function Test-UpNoPass { return Invoke-Admin '' @('ping') }
function Invoke-Root([string]$sqlFile, [string]$pw) {
  if ($pw) { $env:MYSQL_PWD = $pw } else { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
  try { Get-Content -Raw -Encoding UTF8 $sqlFile | & $mysql --host=127.0.0.1 "--port=$port" --user=root --default-character-set=utf8mb4 }
  finally { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue }
  if ($LASTEXITCODE -ne 0) { throw "MySQL script failed: $sqlFile" }
}

if ($Stop) {
  if (Invoke-Admin $cfg['MYSQL_ROOT_PASSWORD'] @('shutdown')) { Write-Host 'MySQL stopped.' } else { Write-Host 'MySQL was not running.' }
  return
}
if ($Reset) {
  if (Test-Up) { Invoke-Admin $cfg['MYSQL_ROOT_PASSWORD'] @('shutdown') | Out-Null; Start-Sleep 3 }
  if (Test-Path $data) { Remove-Item -Recurse -Force $data }
  Write-Host 'Local database deleted.'
}

$fresh = -not (Test-Path (Join-Path $data 'mysql'))
if ($fresh) {
  Write-Host '== Creating the local database (first run)' -ForegroundColor Cyan
  New-Item -ItemType Directory -Force $data | Out-Null
  & $mysqld --no-defaults --initialize-insecure "--datadir=$data" --default-time-zone=+00:00
  if ($LASTEXITCODE -ne 0) { throw 'mysqld --initialize failed' }
}

if (-not (Test-Up) -and -not ($fresh -and (Test-UpNoPass))) {
  Write-Host "== Starting MySQL on 127.0.0.1:$port" -ForegroundColor Cyan
  Start-Process -FilePath $mysqld -WindowStyle Hidden -ArgumentList @('--no-defaults', "--datadir=$data", "--port=$port", '--bind-address=127.0.0.1',
    '--default-time-zone=+00:00', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_0900_ai_ci', '--mysqlx=OFF')
  for ($i = 0; $i -lt 60; $i++) { if ((Test-Up) -or ($fresh -and (Test-UpNoPass))) { break }; Start-Sleep 1 }
}

if ($fresh) {
  Write-Host '== Schema (db/init/01..05) and users (same grants as 06_users.sh)' -ForegroundColor Cyan
  foreach ($f in Get-ChildItem (Join-Path $backend 'db\init') -Filter '*.sql' | Sort-Object Name) { Invoke-Root $f.FullName $null; Write-Host "   $($f.Name)" }
  $q = { param($s) $s.Replace('\', '\\').Replace("'", "''") }
  $au = & $q $cfg['MYSQL_APP_USER']; $ap = & $q $cfg['MYSQL_APP_PASSWORD']; $pu = & $q $cfg['MYSQL_PIPELINE_USER']; $pp = & $q $cfg['MYSQL_PIPELINE_PASSWORD']; $rp = & $q $cfg['MYSQL_ROOT_PASSWORD']
  $tmp = Join-Path $data 'users.sql.tmp'
  @"
CREATE USER IF NOT EXISTS '$au'@'localhost' IDENTIFIED BY '$ap';
GRANT SELECT, INSERT, UPDATE, DELETE ON app.* TO '$au'@'localhost';
GRANT SELECT ON gold.* TO '$au'@'localhost';
CREATE USER IF NOT EXISTS '$pu'@'localhost' IDENTIFIED BY '$pp';
GRANT SELECT ON app.* TO '$pu'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON bronze.* TO '$pu'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON silver.* TO '$pu'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON gold.*   TO '$pu'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.*    TO '$pu'@'localhost';
ALTER USER 'root'@'localhost' IDENTIFIED BY '$rp';
FLUSH PRIVILEGES;
"@ | Set-Content -Encoding UTF8 $tmp
  try { Invoke-Root $tmp $null } finally { Remove-Item -Force $tmp }
  Write-Host "   users: $($cfg['MYSQL_APP_USER']), $($cfg['MYSQL_PIPELINE_USER'])"
}
if (-not (Test-Up)) { throw 'MySQL did not start. Look at the *.err file in Backend\local-mysql.' }
Write-Host "MySQL is up on 127.0.0.1:$port (data: $data)" -ForegroundColor Green

if (-not (Test-Path (Join-Path $backend 'node_modules\mysql2'))) { throw 'Run "npm ci" in Backend first (installs mysql2).' }

if ($Pipeline) {
  Write-Host '== Pipeline' -ForegroundColor Cyan
  $env:DB_HOST = '127.0.0.1'; $env:DB_PORT = $port; $env:DB_USER = $cfg['MYSQL_PIPELINE_USER']; $env:DB_PASSWORD = $cfg['MYSQL_PIPELINE_PASSWORD']
  $env:INBOX_DIR = Join-Path $backend 'inbox'; $env:PIPELINE_EVERY_MINUTES = '0'
  $env:GOV_SCAM_API_URL = $cfg['GOV_SCAM_API_URL']; $env:GOV_SCAM_API_TOKEN = $cfg['GOV_SCAM_API_TOKEN']
  node (Join-Path $backend 'pipeline\run.js')
  if ($LASTEXITCODE -ne 0) { Write-Host 'Pipeline failed (see above).' -ForegroundColor Red }
}

if ($App) {
  Write-Host '== Scam Guardian on the MySQL store: http://localhost:8787' -ForegroundColor Cyan
  $env:DB_HOST = '127.0.0.1'; $env:DB_PORT = $port; $env:DB_USER = $cfg['MYSQL_APP_USER']; $env:DB_PASSWORD = $cfg['MYSQL_APP_PASSWORD']; $env:DB_NAME = 'app'
  if ($cfg['GEMINI_API_KEY']) { $env:GEMINI_API_KEY = $cfg['GEMINI_API_KEY'] }
  if (-not $env:HOST) { $env:HOST = '0.0.0.0' }
  Set-Location $repo
  node server.js
}
