param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$hugoYamlPath = Join-Path $Root "hugo.yaml"
$dataDir = Join-Path $Root "data"
$metaPath = Join-Path $dataDir "content-source.yaml"

function Get-YamlQuotedString([string]$Value) {
  if ($null -eq $Value) {
    return '""'
  }
  $escaped = $Value -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", "" -replace "`n", '\n'
  return """$escaped"""
}

function Read-ContentRepoConfig([string]$Path) {
  $content = Get-Content -LiteralPath $Path -Raw
  $config = @{
    owner = "NAMUORI00"
    name = "yskim-blog-private"
    ref = "main"
    paths = @("content", "static/images")
  }

  if ($content -notmatch "(?ms)^\s+contentRepo:\s*\r?\n(.*?)(?=^\s+\w+:)") {
    return $config
  }

  $block = $Matches[1]
  if ($block -match "(?m)^\s+owner:\s*(\S+)\s*$") { $config.owner = $Matches[1] }
  if ($block -match "(?m)^\s+name:\s*(\S+)\s*$") { $config.name = $Matches[1] }
  if ($block -match "(?m)^\s+ref:\s*(\S+)\s*$") { $config.ref = $Matches[1] }

  $paths = New-Object System.Collections.Generic.List[string]
  $inPaths = $false
  foreach ($line in ($block -split "`r?`n")) {
    if ($line -match "^\s+paths:\s*$") {
      $inPaths = $true
      continue
    }
    if ($inPaths) {
      if ($line -match "^\s+-\s+(.+)\s*$") {
        $paths.Add($Matches[1].Trim()) | Out-Null
        continue
      }
      if ($line -match "^\s+\w+:") {
        $inPaths = $false
      }
    }
  }
  if ($paths.Count -gt 0) {
    $config.paths = $paths.ToArray()
  }

  return $config
}

function Get-GithubToken {
  if ($env:CONTENT_REPO_TOKEN) {
    return $env:CONTENT_REPO_TOKEN
  }
  if ($env:GITHUB_TOKEN) {
    return $env:GITHUB_TOKEN
  }
  try {
    $ghToken = gh auth token 2>$null
    if ($ghToken) {
      return $ghToken.Trim()
    }
  } catch {
  }
  return $null
}

function Write-ContentSourceMeta([hashtable]$Meta) {
  if (-not (Test-Path -LiteralPath $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
  }

  $yaml = @(
    "repo: $(Get-YamlQuotedString $Meta.repo)"
    "ref: $(Get-YamlQuotedString $Meta.ref)"
    "sha: $(Get-YamlQuotedString $Meta.sha)"
    "fetched_at: $(Get-YamlQuotedString $Meta.fetched_at)"
    "paths:"
  )
  foreach ($path in $Meta.paths) {
    $yaml += "  - $(Get-YamlQuotedString $path)"
  }

  [System.IO.File]::WriteAllText($metaPath, ($yaml -join "`n"), [System.Text.UTF8Encoding]::new($false))
}

function Copy-RepoPath([string]$SourceRoot, [string]$RelativePath, [string]$DestinationRoot) {
  $source = Join-Path $SourceRoot $RelativePath
  if (-not (Test-Path -LiteralPath $source)) {
    return
  }

  $destination = Join-Path $DestinationRoot $RelativePath
  $destinationParent = Split-Path -Parent $destination
  if ($destinationParent -and -not (Test-Path -LiteralPath $destinationParent)) {
    New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
  }

  if (Test-Path -LiteralPath $destination) {
    Remove-Item -LiteralPath $destination -Recurse -Force
  }

  Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

$config = Read-ContentRepoConfig $hugoYamlPath
$token = Get-GithubToken
if (-not $token) {
  throw "Missing GitHub token. Set CONTENT_REPO_TOKEN or GITHUB_TOKEN, or run 'gh auth login'."
}

$headers = @{
  Accept = "application/vnd.github+json"
  Authorization = "Bearer $token"
  "User-Agent" = "namu-garden-blog-fetch-content"
  "X-GitHub-Api-Version" = "2022-11-28"
}

$repoSlug = "$($config.owner)/$($config.name)"
$commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$repoSlug/commits/$($config.ref)" -Headers $headers -Method Get
$sha = $commit.sha

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("namu-content-" + [Guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $tempRoot "repo.tar.gz"
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
  $tarballUri = "https://api.github.com/repos/$repoSlug/tarball/$($config.ref)"
  Invoke-WebRequest -Uri $tarballUri -Headers $headers -OutFile $archivePath

  $extractDir = Join-Path $tempRoot "extract"
  New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
  tar -xzf $archivePath -C $extractDir

  $repoRoot = Get-ChildItem -LiteralPath $extractDir -Directory | Select-Object -First 1
  if (-not $repoRoot) {
    throw "Tarball extraction did not produce a repository root directory."
  }

  foreach ($path in $config.paths) {
    $target = Join-Path $Root ($path -replace "/", "\")
    if (Test-Path -LiteralPath $target) {
      Remove-Item -LiteralPath $target -Recurse -Force
    }
    Copy-RepoPath $repoRoot.FullName $path $Root
  }

  $contentRoot = Join-Path $Root "content"
  if (Test-Path -LiteralPath $contentRoot) {
    Get-ChildItem -LiteralPath $contentRoot -Recurse -File -Filter "*.en.md" | ForEach-Object {
      Remove-Item -LiteralPath $_.FullName -Force
    }
  }

  $postsRoot = Join-Path $Root "content\posts"
  $organizeScript = Join-Path $Root "scripts\content-paths.mjs"
  if (Test-Path -LiteralPath $postsRoot) {
    & node $organizeScript $postsRoot
    if ($LASTEXITCODE -ne 0) {
      throw "Content path organization failed."
    }
  }

  Write-ContentSourceMeta @{
    repo = $repoSlug
    ref = $config.ref
    sha = $sha
    fetched_at = (Get-Date).ToUniversalTime().ToString("o")
    paths = $config.paths
  }

  Write-Host "Content fetched from $repoSlug@$($config.ref) ($sha)."
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
