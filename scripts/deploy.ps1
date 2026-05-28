# Deploy current local tree to production (reliable: clean dist, no Docker layer reuse, nginx+SW fixes).
# Usage:
#   .\scripts\deploy.ps1
# Optional: set CRM_SSH_PASSWORD in environment instead of editing this file.
#
# Do NOT manually "rollback" by re-tagging an old image as crm-frontend:latest — that undoes deploys.

$ErrorActionPreference = "Stop"

$SERVER = "root@155.212.180.138"
$REMOTE = "/root/CRM"
$PASSWORD = if ($env:CRM_SSH_PASSWORD) { $env:CRM_SSH_PASSWORD } else { "9qYLH2sVdcnV" }
$HOSTKEY = "SHA256:2Z+je6fjDnoIxrO/Noeex1a0OiW5nv8CoW08SF+j+E8"

$PLINK = "C:\Program Files\PuTTY\plink.exe"
$PSCP  = "C:\Program Files\PuTTY\pscp.exe"

function Run-Remote([string]$cmd) {
    & $PLINK -ssh -pw $PASSWORD $SERVER -hostkey $HOSTKEY -batch $cmd
    if ($LASTEXITCODE -ne 0) { throw "Remote command failed: $cmd" }
}

Push-Location "C:\FILES\CRM"
try {
    Write-Host "==> Building frontend..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }

    Write-Host "==> Building backend..." -ForegroundColor Cyan
    Push-Location backend
    npm run build
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Backend build failed" }
    Pop-Location

    Write-Host "==> Creating archive (from repo root)..." -ForegroundColor Cyan
    $archive = "$env:TEMP\crm-deploy.tar.gz"
    if (Test-Path $archive) { Remove-Item $archive -Force }

    $tarArgs = @(
        '--exclude=node_modules', '--exclude=.git', '--exclude=db_backup',
        '--exclude=certbot', '--exclude=.playwright-mcp',
        '-czf', $archive,
        'dist', 'nginx', '.env',
        'backend/dist', 'backend/src', 'backend/package.json', 'backend/package-lock.json',
        'backend/Dockerfile',
        'package.json', 'package-lock.json', 'Dockerfile', 'docker-compose.prod.yml', 'index.html'
    )
    & "C:\Windows\System32\tar.exe" @tarArgs
    if ($LASTEXITCODE -ne 0) { throw "tar failed: missing path or bad exclude" }

    Write-Host "==> Uploading to server..." -ForegroundColor Cyan
    & $PSCP -pw $PASSWORD -hostkey $HOSTKEY -batch $archive "${SERVER}:/tmp/crm-deploy.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "Upload failed" }

    Write-Host "==> Server: stop stack, wipe dist, unpack, rebuild images without cache, recreate..." -ForegroundColor Cyan
    # Order: down (no stale containers), fresh dist from archive, --no-cache (no layer reuse from old tags).
    $remoteCmd = @'
set -e
cd /root/CRM
rm -rf dist
tar -xzf /tmp/crm-deploy.tar.gz
rm -f /tmp/crm-deploy.tar.gz
test -f dist/index.html
docker compose -f docker-compose.prod.yml build --no-cache frontend backend
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker exec crm-frontend-1 nginx -t
echo '--- crm-build-id in running container ---'
docker exec crm-frontend-1 grep crm-build-id /usr/share/nginx/html/index.html || true
docker exec crm-frontend-1 head -12 /usr/share/nginx/html/index.html
echo '--- curl localhost headers ---'
curl -sI http://127.0.0.1/ | head -n 20
'@
    Run-Remote $remoteCmd

    Write-Host "==> Containers:" -ForegroundColor Cyan
    Run-Remote "docker ps --filter name=crm- --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'"

    Write-Host "Deploy completed successfully." -ForegroundColor Green
}
finally {
    Pop-Location
}
