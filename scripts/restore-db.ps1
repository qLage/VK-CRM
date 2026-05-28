# Restore production DB dump into local PostgreSQL (native Windows install)
# Usage: .\scripts\restore-db.ps1
#
# Prerequisites:
#   1. PostgreSQL installed (https://www.postgresql.org/download/windows/)
#   2. pg_restore and psql on PATH (typically C:\Program Files\PostgreSQL\17\bin)
#   3. User and DB created:
#      psql -U postgres -c "CREATE USER crm_user WITH PASSWORD 'crm_dev_password';"
#      psql -U postgres -c "CREATE DATABASE crm OWNER crm_user;"

$ErrorActionPreference = "Stop"

$DUMP     = "C:\FILES\CRM\db_backup\production_dump.bin"
$DB_NAME  = "crm"
$DB_USER  = "crm_user"
$DB_PASS  = "crm_dev_password"
$DB_HOST  = "localhost"
$DB_PORT  = "5432"
$PG_ADMIN = "postgres"  # superuser for drop/create

if (-not (Test-Path $DUMP)) {
    Write-Error "Dump not found: $DUMP"
    exit 1
}

# Check pg_restore is available
$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) {
    # Try common install paths
    $pgBin = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_restore.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if ($pgBin) {
        $env:Path += ";$($pgBin.DirectoryName)"
        Write-Host "Found PostgreSQL at: $($pgBin.DirectoryName)" -ForegroundColor Yellow
    } else {
        Write-Error "pg_restore not found! Add PostgreSQL bin directory to PATH."
        exit 1
    }
}

$env:PGPASSWORD = $DB_PASS

Write-Host "==> Dropping and recreating database '$DB_NAME'..." -ForegroundColor Yellow
$env:PGPASSWORD = $PG_ADMIN  # use postgres superuser password for drop/create
# Try with crm_user first (if it has CREATEDB), fallback instructions below
$env:PGPASSWORD = $DB_PASS
try {
    psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT 1" 2>$null | Out-Null
} catch {}

# Use psql with postgres superuser
Write-Host "  (If prompted for password, enter the 'postgres' superuser password)" -ForegroundColor Gray
$env:PGPASSWORD = ""
psql -h $DB_HOST -p $DB_PORT -U $PG_ADMIN -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
psql -h $DB_HOST -p $DB_PORT -U $PG_ADMIN -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

Write-Host "==> Restoring dump ($([math]::Round((Get-Item $DUMP).Length / 1MB, 1)) MB)..." -ForegroundColor Cyan
$env:PGPASSWORD = $DB_PASS
pg_restore -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME --no-owner --no-acl --clean --if-exists $DUMP 2>&1 | Where-Object { $_ -notmatch "WARNING|warning" } | Out-Host

Write-Host "==> Verifying tables..." -ForegroundColor Cyan
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\dt" | Out-Host

$env:PGPASSWORD = ""
Write-Host "Done! Local DB now contains production data." -ForegroundColor Green
Write-Host "Run start-dev.bat to launch the CRM." -ForegroundColor Yellow
