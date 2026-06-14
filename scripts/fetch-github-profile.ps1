param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$dataDir = Join-Path $Root "data"
$outputPath = Join-Path $dataDir "github.yaml"
$githubUsername = if ($env:GITHUB_PROFILE_USERNAME) { $env:GITHUB_PROFILE_USERNAME } else { "NAMUORI00" }

function Get-YamlQuotedString([string]$Value) {
  if ($null -eq $Value) {
    return '""'
  }
  $escaped = $Value -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", "" -replace "`n", '\n'
  return """$escaped"""
}

function Read-ProfileFallback([string]$Username) {
  # Used only if the GitHub API call fails. Live values come from the API.
  return @{
    login = $Username
    name = $Username
    bio = ""
    avatar_url = "https://github.com/$Username.png"
    html_url = "https://github.com/$Username"
  }
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

$username = $githubUsername
$fallback = Read-ProfileFallback $githubUsername

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
