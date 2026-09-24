param(
    [string]$CertificateThumbprint = $env:ELO_SIGNING_CERT_SHA1,
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$thumbprint = (([string]$CertificateThumbprint) -replace '\s', '').ToUpperInvariant()
if ($thumbprint -notmatch '^[A-F0-9]{40}$') {
    throw 'Falta um certificado de assinatura de codigo. Configure ELO_SIGNING_CERT_SHA1 com a impressao digital do certificado instalado. Nenhum instalador assinado foi gerado.'
}
$certificates = @(Get-ChildItem Cert:\CurrentUser\My, Cert:\LocalMachine\My -CodeSigningCert | Where-Object { $_.Thumbprint -eq $thumbprint -and $_.HasPrivateKey })
if ($certificates.Count -eq 0) { throw 'Certificado de assinatura com chave privada nao encontrado no Windows. Conecte o token e instale o software do emissor, se necessario.' }
$certificate = $certificates[0]
if ($certificate.NotBefore -gt (Get-Date) -or $certificate.NotAfter -le (Get-Date)) { throw 'Certificado expirado ou ainda nao valido.' }
if ($certificate.Subject -eq $certificate.Issuer) { throw 'Certificado autoassinado nao serve para esta distribuicao.' }
$chain = [Security.Cryptography.X509Certificates.X509Chain]::new()
try {
    $chain.ChainPolicy.RevocationMode = [Security.Cryptography.X509Certificates.X509RevocationMode]::Online
    $chain.ChainPolicy.UrlRetrievalTimeout = [TimeSpan]::FromSeconds(20)
    $chain.ChainPolicy.ApplicationPolicy.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
    if (-not $chain.Build($certificate)) { throw 'O Windows nao validou a cadeia de confianca/revogacao para assinatura de codigo. Confira o certificado e a conexao com o emissor.' }
} finally { $chain.Dispose() }
Write-Output 'Certificado de assinatura disponivel e validado neste Windows.'
if ($CheckOnly) { return }
Push-Location -LiteralPath $projectRoot
try {
    $project = Get-Content -LiteralPath 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
    $config = $project.build
    $config | Add-Member -NotePropertyName forceCodeSigning -NotePropertyValue $true -Force
    $config.win.signAndEditExecutable = $true
    $config.win.signExecutable = $true
    $config.win | Add-Member -NotePropertyName signtoolOptions -NotePropertyValue ([pscustomobject]@{
        certificateSha1 = $thumbprint
        signingHashAlgorithms = @('sha256')
        rfc3161TimeStampServer = 'http://timestamp.digicert.com'
    }) -Force
    $config.directories.output = 'dist/signed'
    New-Item -ItemType Directory -Path '.runtime' -Force | Out-Null
    $configPath = Join-Path $projectRoot '.runtime\signed-build.json'
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
    & node.exe scripts/prepare-desktop.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o aplicativo.' }
    & node.exe node_modules/electron-builder/cli.js --config $configPath --win nsis --x64
    if ($LASTEXITCODE -ne 0) { throw 'Falha no build ou na assinatura. Nao publique os arquivos desta tentativa.' }
    $installer = Join-Path $projectRoot "dist\signed\Elo-Voice-Setup-$($project.version).exe"
    $executable = Join-Path $projectRoot 'dist\signed\win-unpacked\Elo Voice.exe'
    & (Join-Path $PSScriptRoot 'verify-signature.ps1') -FilePath $executable -ExpectedThumbprint $thumbprint
    & (Join-Path $PSScriptRoot 'verify-signature.ps1') -FilePath $installer -ExpectedThumbprint $thumbprint
    Write-Output "Build assinado e verificado: $installer"
    Write-Output 'O build nao publica arquivos automaticamente. A assinatura identifica o fornecedor; nao garante ausencia de avisos do SmartScreen.'
} finally { Pop-Location }
