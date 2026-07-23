$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules"))) {
  Write-Host "Installing dependencies..."
  pnpm install
}

pnpm check
Write-Host "Build complete: $RepoRoot\dist"

