# Refresh production DB dump from server
# Usage: .\scripts\dump-prod.ps1

$ErrorActionPreference = "Stop"

$SERVER   = "root@155.212.180.138"
$PASSWORD = "MLey9aXuvT4x"
$HOSTKEY  = "SHA256:2Z+je6fjDnoIxrO/Noeex1a0OiW5nv8CoW08SF+j+E8"
$LOCAL    = "C:\FILES\CRM\db_backup\production_dump.bin"

$PLINK = "C:\Program Files\PuTTY\plink.exe"
$PSCP  = "C:\Program Files\PuTTY\pscp.exe"

Write-Host "==> Running pg_dump on server..." -ForegroundColor Cyan
$cmd = "docker run --rm -v /tmp:/out -e PGPASSWORD='utDNaf1Q7otD' postgres:17-alpine pg_dump -h master.a1f25183-fc98-4945-a662-49f557419024.c.dbaas.selcloud.ru -U admin_crm -d crm --no-owner --no-acl -Fc -f /out/dump.bin"
& $PLINK -ssh -pw $PASSWORD $SERVER -hostkey $HOSTKEY -batch $cmd
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

Write-Host "==> Downloading dump..." -ForegroundColor Cyan
& $PSCP -pw $PASSWORD -hostkey $HOSTKEY -batch "${SERVER}:/tmp/dump.bin" $LOCAL
if ($LASTEXITCODE -ne 0) { throw "Download failed" }

Write-Host "==> Cleaning remote..." -ForegroundColor Cyan
& $PLINK -ssh -pw $PASSWORD $SERVER -hostkey $HOSTKEY -batch "rm /tmp/dump.bin"

$size = (Get-Item $LOCAL).Length / 1MB
Write-Host ("Dump saved: {0} ({1:N2} MB)" -f $LOCAL, $size) -ForegroundColor Green
Write-Host "Now run: .\scripts\restore-db.ps1" -ForegroundColor Yellow
