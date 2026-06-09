param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$hugoYamlPath = Join-Path $Root "hugo.yaml"
$dataDir = Join-Path $Root "data"
$outputPath = Join-Path $dataDir "github.yaml"

function Get-YamlQuotedString([string]$Value) {
  if ($null -eq $Value) {
    return '""'
  }
  $escaped = $Value -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", "" -replace "`n", '\n'
  return """$escaped"""
}

function Read-GithubUsername([string]$Path) {
  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -match "(?m)^\s+username:\s*(\S+)\s*$") {
    return $Matches[1]
  }
  return "NAMUORI00"
}

function Read-ProfileFallback([string]$Path) {
  $content = Get-Content -LiteralPath $Path -Raw
  $fallback = @{
    login = "NAMUORI00"
    name = "NAMUORI00"
    bio = ""
    avatar_url = "https://github.com/NAMUORI00.png"
    html_url = "https://github.com/NAMUORI00"
  }

  if ($content -match "(?m)^\s+login:\s*(\S+)\s*$") { $fallback.login = $Matches[1] }
  if ($content -match "(?m)^\s+name:\s*(.+?)\s*$") { $fallback.name = $Matches[1].Trim().Trim('"') }
  if ($content -match "(?m)^\s+bio:\s*(.+?)\s*$") { $fallback.bio = $Matches[1].Trim().Trim('"') }
  if ($content -match "(?m)^\s+avatar_url:\s*(\S+)\s*$") { $fallback.avatar_url = $Matches[1] }
  if ($content -match "(?m)^\s+html_url:\s*(\S+)\s*$") { $fallback.html_url = $Matches[1] }

  return $fallback
}

function Write-GithubData([hashtable]$Profile) {
  if (-not (Test-Path -LiteralPath $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
  }

  $yaml = @(
    "login: $($Profile.login)"
    "name: $(Get-YamlQuotedString $Profile.name)"
    "bio: $(Get-YamlQuotedString $Profile.bio)"
    "avatar_url: $($Profile.avatar_url)"
    "html_url: $($Profile.html_url)"
    "fetched_at: $(Get-YamlQuotedString $Profile.fetched_at)"
  ) -join "`n"

  [System.IO.File]::WriteAllText($outputPath, $yaml, [System.Text.UTF8Encoding]::new($false))
}

$username = Read-GithubUsername $hugoYamlPath
$fallback = Read-ProfileFallback $hugoYamlPath

$headers = @{
  Accept = "application/vnd.github+json"
  "User-Agent" = "namu-garden-blog-fetch-profile"
  "X-GitHub-Api-Version" = "2022-11-28"
}

if ($env:GITHUB_TOKEN) {
  $headers.Authorization = "Bearer $($env:GITHUB_TOKEN)"
}

try {
  $response = Invoke-RestMethod -Uri "https://api.github.com/users/$username" -Headers $headers -Method Get
  $profile = @{
    login = $response.login
    name = if ($response.name) { $response.name } else { $response.login }
    bio = if ($response.bio) { $response.bio } else { "" }
    avatar_url = $response.avatar_url
    html_url = $response.html_url
    fetched_at = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-GithubData $profile
  Write-Host "GitHub profile fetched for $($profile.login)."
} catch {
  if (Test-Path -LiteralPath $outputPath) {
    Write-Warning "GitHub profile fetch failed; keeping existing data/github.yaml. $($_.Exception.Message)"
    exit 0
  }

  $profile = @{
    login = $fallback.login
    name = $fallback.name
    bio = $fallback.bio
    avatar_url = $fallback.avatar_url
    html_url = $fallback.html_url
    fetched_at = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-GithubData $profile
  Write-Warning "GitHub profile fetch failed; wrote fallback profile. $($_.Exception.Message)"
}
