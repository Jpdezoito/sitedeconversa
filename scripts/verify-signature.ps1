param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string]$ExpectedThumbprint
)
$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $FilePath).Path
$signature = Get-AuthenticodeSignature -LiteralPath $resolved
if ($signature.Status -ne 'Valid') { throw "Assinatura nao validada: $($signature.Status). Este arquivo nao deve ser publicado como assinado." }
if (-not $signature.SignerCertificate) { throw 'Certificado do fornecedor ausente.' }
if ($ExpectedThumbprint) {
    $expected = ($ExpectedThumbprint -replace '\s', '').ToUpperInvariant()
    if ($expected -notmatch '^[A-F0-9]{40}$') { throw 'Impressao digital do certificado invalida.' }
    if ($signature.SignerCertificate.Thumbprint.ToUpperInvariant() -ne $expected) { throw 'O fornecedor do arquivo difere do certificado escolhido.' }
}
if (-not $signature.TimeStamperCertificate) { throw 'A assinatura nao tem carimbo de tempo verificavel.' }
Write-Output "Assinatura e carimbo de tempo verificados: $([IO.Path]::GetFileName($resolved))"
