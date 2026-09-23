param([ValidateSet('Start', 'Stop', 'Status', 'Restart')][string]$Action = 'Status')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$stateFile = Join-Path $runtimeDir 'online.json'
$linkFile = Join-Path $projectRoot 'LINK-DO-SITE.txt'
$tunnelExe = Join-Path $projectRoot '.tools\cloudflared.exe'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

function Get-OwnedProcess($entry) {
    if (-not $entry) { return $null }
    $process = Get-Process -Id $entry.Id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks.ToString() -eq $entry.Started) { return $process }
    return $null
}
function Process-Entry($process) {
    return @{ Id = $process.Id; Started = $process.StartTime.ToUniversalTime().Ticks.ToString() }
}
function Stop-OwnedProcess($entry) {
    $process = Get-OwnedProcess $entry
    if ($process) { $process | Stop-Process -Force }
}
function Save-State($value) {
    $value | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
}
function Clear-Link {
    if (Test-Path -LiteralPath $linkFile) { Remove-Item -LiteralPath $linkFile }
}

$lock = $null
try {
    try { $lock = [System.IO.File]::Open((Join-Path $runtimeDir 'control.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'Outro comando esta ligando/desligando o site. Aguarde e tente novamente.' }
    $state = $null
    if (Test-Path -LiteralPath $stateFile) { $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json }
    if ($Action -eq 'Stop') {
        Stop-OwnedProcess $state.Tunnel
        Stop-OwnedProcess $state.Server
        Save-State @{ Status = 'offline' }
        Clear-Link
        Write-Output 'Site desligado. As salas foram encerradas e o link anterior nao funciona mais.'
        exit 0
    }
    $running = (Get-OwnedProcess $state.Server) -and (Get-OwnedProcess $state.Tunnel)
    if ($Action -eq 'Restart' -and (Get-OwnedProcess $state.Tunnel)) {
        Stop-OwnedProcess $state.Server
        $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
        $newServer = Start-Process -FilePath $nodeExe -ArgumentList @('--env-file-if-exists=.env', 'scripts/online-server.js') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'server.out.log') -RedirectStandardError (Join-Path $runtimeDir 'server.err.log')
        $state.Server = Process-Entry $newServer
        Save-State $state
        $healthy = $false
        for ($i = 0; $i -lt 15; $i++) {
            try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3100/health' -TimeoutSec 2; if ($health.ok) { $healthy = $true; break } } catch {}
            Start-Sleep -Milliseconds 400
        }
        if (-not $healthy) { throw 'Servidor nao reiniciou. Consulte .runtime/server.err.log.' }
        Write-Output "Servidor atualizado. Mesmo link: $($state.Url)"
        exit 0
    }
    if ($running) {
        Write-Output "Servidor e tunel ligados. Link: $($state.Url)"
        Write-Output 'Para desligar, abra DESLIGAR-SITE.cmd.'
        exit 0
    }
    if ($Action -eq 'Status') {
        Write-Output 'O site esta desligado ou a conexao foi interrompida. Abra LIGAR-SITE.cmd.'
        exit 0
    }
    Stop-OwnedProcess $state.Tunnel
    Stop-OwnedProcess $state.Server
    Clear-Link
    if (-not (Test-Path -LiteralPath $tunnelExe)) { throw 'Cloudflared ausente. Veja a instalacao no GUIA-HOSPEDAR-NO-PC.md.' }
    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    if (Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue) { throw 'A porta 3100 esta ocupada. Nenhum processo existente foi encerrado.' }
    $state = @{ Status = 'starting'; Server = $null; Tunnel = $null; Url = $null }
    Save-State $state
    try {
        Write-Output 'Ligando o servidor de voz...'
        $nodeArgs = @('--env-file-if-exists=.env', 'scripts/online-server.js')
        $serverProcess = Start-Process -FilePath $nodeExe -ArgumentList $nodeArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'server.out.log') -RedirectStandardError (Join-Path $runtimeDir 'server.err.log')
        $state.Server = Process-Entry $serverProcess
        Save-State $state
        $healthy = $false
        for ($i = 0; $i -lt 15; $i++) {
            try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3100/health' -TimeoutSec 2; if ($health.ok) { $healthy = $true; break } } catch {}
            Start-Sleep -Milliseconds 400
        }
        if (-not $healthy) { throw 'O servidor nao iniciou. Consulte .runtime/server.err.log.' }
        Write-Output 'Criando link HTTPS gratuito. Aguarde...'
        $tunnelArgs = @('tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:3100')
        $tunnelProcess = Start-Process -FilePath $tunnelExe -ArgumentList $tunnelArgs -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'tunnel.out.log') -RedirectStandardError (Join-Path $runtimeDir 'tunnel.err.log')
        $state.Tunnel = Process-Entry $tunnelProcess
        Save-State $state
        $publicUrl = $null
        for ($i = 0; $i -lt 90; $i++) {
            if (-not (Get-OwnedProcess $state.Tunnel)) { throw 'O tunel parou. Consulte .runtime/tunnel.err.log.' }
            $log = Get-Content -LiteralPath (Join-Path $runtimeDir 'tunnel.err.log') -Raw -ErrorAction SilentlyContinue
            if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $publicUrl = $Matches[0]; break }
            Start-Sleep -Milliseconds 500
        }
        if (-not $publicUrl) { throw 'Nao foi possivel obter o link. Confira a internet e .runtime/tunnel.err.log.' }
        $state.Url = $publicUrl
        $state.Status = 'running'
        Save-State $state
        @("LINK PUBLICO DO ELO", $publicUrl, '', 'Aguarde alguns segundos para o link responder.', 'O PC precisa continuar ligado, conectado e sem suspender.', 'O link muda ao desligar e ligar novamente.', 'Para encerrar: DESLIGAR-SITE.cmd') | Set-Content -LiteralPath $linkFile -Encoding UTF8
        Write-Output "Link gerado: $publicUrl"
        Write-Output 'Copie o link de LINK-DO-SITE.txt e envie aos seus amigos.'
        Write-Output 'Pode fechar esta janela. Os processos continuam em segundo plano.'
        Write-Output 'PC ligado, conectado e sem suspender. Para parar: DESLIGAR-SITE.cmd.'
    } catch {
        Stop-OwnedProcess $state.Tunnel
        Stop-OwnedProcess $state.Server
        Save-State @{ Status = 'offline' }
        Clear-Link
        throw
    }
} finally { if ($lock) { $lock.Dispose() } }
