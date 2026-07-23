param(
  [switch]$Commit,
  [string]$Message = "chore: publish TagForge"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $RepoRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
  throw "This folder is not a Git repository."
}

$Branch = (git branch --show-current).Trim()
if ($Branch -ne "main") {
  throw "Source publishing must run from the main branch. Current branch: $Branch"
}

$Origin = (git remote get-url origin 2>$null)
if (-not $Origin) {
  throw "Missing origin remote. Create the GitHub repository and add origin first."
}

$Dirty = git status --porcelain
if ($Dirty -and -not $Commit) {
  throw "Working tree has changes. Commit them first, or rerun with -Commit."
}

if ($Dirty -and $Commit) {
  git add -A
  git commit -m $Message
}

& (Join-Path $PSScriptRoot "build.ps1")
git push -u origin main

$SystemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$WorktreePath = [IO.Path]::GetFullPath(
  (Join-Path $SystemTemp ("tag-forge-pages-" + [guid]::NewGuid().ToString("N")))
)
if (-not $WorktreePath.StartsWith($SystemTemp, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to create a worktree outside the system temporary directory."
}

try {
  $RemoteBranch = git ls-remote --heads origin gh-pages
  if ($RemoteBranch) {
    git fetch origin gh-pages
    git worktree add -B gh-pages $WorktreePath origin/gh-pages
  } else {
    git worktree add --detach $WorktreePath HEAD
    git -C $WorktreePath switch --orphan gh-pages
  }

  $ResolvedWorktree = [IO.Path]::GetFullPath($WorktreePath)
  if (-not $ResolvedWorktree.StartsWith($SystemTemp, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean an unverified worktree path."
  }

  Get-ChildItem -Force -LiteralPath $ResolvedWorktree |
    Where-Object { $_.Name -ne ".git" } |
    Remove-Item -Recurse -Force

  Copy-Item -Path (Join-Path $RepoRoot "dist\*") -Destination $ResolvedWorktree -Recurse -Force
  Set-Content -LiteralPath (Join-Path $ResolvedWorktree ".nojekyll") -Value "" -NoNewline

  git -C $ResolvedWorktree add -A
  $Pending = git -C $ResolvedWorktree status --porcelain
  if ($Pending) {
    git -C $ResolvedWorktree commit -m ("deploy: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    git -C $ResolvedWorktree push -u origin gh-pages
  } else {
    Write-Host "gh-pages already matches the current build."
  }
} finally {
  if (Test-Path -LiteralPath $WorktreePath) {
    git worktree remove --force $WorktreePath
  }
}

Write-Host "Published source to main and static files to gh-pages."
