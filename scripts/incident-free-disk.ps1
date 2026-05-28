# Free disk space on prod for Docker builds (Docker prune; then df).
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

$remote = @'
set -e
echo "=== df -h ==="
df -h
echo "=== docker system df ==="
docker system df || true
echo "=== prune builder + unused ==="
docker builder prune -af || true
docker container prune -f || true
docker image prune -af || true
echo "=== after prune ==="
df -h
docker system df || true
'@

$p = Start-Process -FilePath $PLINK -ArgumentList @('-ssh','-pw',$PASSWORD,$SERVER,'-hostkey',$HOSTKEY,'-batch',$remote) -Wait -PassThru -NoNewWindow
exit $p.ExitCode
