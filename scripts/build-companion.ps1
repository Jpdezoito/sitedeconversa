$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Copy-Item -LiteralPath (Join-Path $projectRoot 'lib\lol-client.js') -Destination (Join-Path $projectRoot 'companion\lol-client.mjs') -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'lib\lol-roster.mjs') -Destination (Join-Path $projectRoot 'companion\lol-roster.mjs') -Force
Compress-Archive -Path (Join-Path $projectRoot 'companion\*') -DestinationPath (Join-Path $projectRoot 'public\elo-conector.zip') -Force
Write-Output 'Conector atualizado em public/elo-conector.zip'
