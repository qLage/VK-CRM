# Prod diagnostics via SSH — uses CRM_SSH_PASSWORD or parses deploy.ps1 default (same as deploy.ps1).
$ErrorActionPreference = "Stop"
$SERVER = "root@155.212.180.138"
$HOSTKEY = "SHA256:2Z+je6fjDnoIxrO/Noeex1a0OiW5nv8CoW08SF+j+E8"
$PLINK = "C:\Program Files\PuTTY\plink.exe"

$PASSWORD = $env:CRM_SSH_PASSWORD
if (-not $PASSWORD) {
    $deployRaw = Get-Content (Join-Path $PSScriptRoot 'deploy.ps1') -Raw
    $m = [regex]::Match($deployRaw, 'else \{ "([^"]+)" \}')
    if ($m.Success) { $PASSWORD = $m.Groups[1].Value }
}
if (-not $PASSWORD) { throw 'Cannot resolve SSH password (set CRM_SSH_PASSWORD).' }

function Remote([string]$cmd) {
    & $PLINK -ssh -pw $PASSWORD $SERVER -hostkey $HOSTKEY -batch $cmd
}

Remote 'docker ps -a'
Remote 'cd /root/CRM && docker compose -f docker-compose.prod.yml ps -a'
Remote 'docker logs crm-backend-1 --tail 200 2>&1'
Remote 'docker logs crm-frontend-1 --tail 40 2>&1'
