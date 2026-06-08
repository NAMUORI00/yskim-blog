param(
  [string]$VaultPath = "",
  [string]$PublicRepoPath = "",
  [string]$PluginBaseUrl = "https://yskim-blog.pages.dev/downloads/hugo-git-publisher",
  [string]$PluginId = "hugo-git-publisher",
  [string]$OldPluginId = "yskim-hugo-publisher",
  [switch]$SkipDependencies,
  [switch]$SkipGithubLogin
)

$ErrorActionPreference = "Stop"

function Test-CommandAvailable([string]$Command) {
  $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Install-WingetPackage([string]$Command, [string]$PackageId) {
  if (Test-CommandAvailable $Command) {
    Write-Host "$Command is already installed."
    return
  }
  if (-not (Test-CommandAvailable "winget")) {
    throw "winget is not installed. Install 'App Installer' from Microsoft Store, then rerun this installer."
  }
  Write-Host "Installing $PackageId..."
  winget install --id $PackageId -e --source winget --accept-package-agreements --accept-source-agreements
}

function Read-DefaultedValue([string]$Prompt, [string]$DefaultValue) {
  $value = Read-Host "$Prompt [$DefaultValue]"
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $DefaultValue
  }
  return $value
}

if (-not $SkipDependencies) {
  Install-WingetPackage "git" "Git.Git"
  Install-WingetPackage "gh" "GitHub.cli"
  Install-WingetPackage "node" "OpenJS.NodeJS.LTS"
}

if ([string]::IsNullOrWhiteSpace($VaultPath)) {
  $VaultPath = Read-DefaultedValue "Obsidian vault path" "G:\내 드라이브\Obsidian_Note\yskim_note"
}
if ([string]::IsNullOrWhiteSpace($PublicRepoPath)) {
  $PublicRepoPath = Read-DefaultedValue "Local Hugo public repo path" "$env:USERPROFILE\Documents\Projects\yskim-blog-public"
}

$ObsidianPath = Join-Path $VaultPath ".obsidian"
$PluginTarget = Join-Path $ObsidianPath "plugins\$PluginId"
$OldPluginTarget = Join-Path $ObsidianPath "plugins\$OldPluginId"
$CommunityPluginsPath = Join-Path $ObsidianPath "community-plugins.json"

if (-not (Test-Path -LiteralPath $ObsidianPath)) {
  throw "Obsidian settings folder was not found: $ObsidianPath"
}

New-Item -ItemType Directory -Path $PluginTarget -Force | Out-Null

foreach ($file in @("manifest.json", "main.js")) {
  $url = "$PluginBaseUrl/$file"
  $destination = Join-Path $PluginTarget $file
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile $destination
}

$settings = [ordered]@{
  readyFolder = "_Blog/30_Ready"
  assetFolder = "_Blog/assets"
  publicRepoPath = ($PublicRepoPath -replace "\\", "/")
  postsFolder = "content/posts"
  imageFolder = "static/images/blog"
  githubHost = "github.com"
  autoPush = $false
  commitMessage = "content: publish obsidian notes"
}
$settings | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PluginTarget "data.json") -Encoding UTF8

if (Test-Path -LiteralPath $CommunityPluginsPath) {
  $plugins = @(Get-Content -LiteralPath $CommunityPluginsPath -Raw | ConvertFrom-Json)
} else {
  $plugins = @()
}

$plugins = @($plugins | Where-Object { $_ -ne $OldPluginId })
if ($plugins -notcontains $PluginId) {
  $plugins += $PluginId
}
$plugins | ConvertTo-Json | Set-Content -LiteralPath $CommunityPluginsPath -Encoding UTF8

if (Test-Path -LiteralPath $OldPluginTarget) {
  Remove-Item -LiteralPath $OldPluginTarget -Recurse -Force
}

if (-not $SkipGithubLogin) {
  if (-not (Test-CommandAvailable "gh")) {
    throw "GitHub CLI was not found after dependency installation. Restart the terminal and rerun this installer."
  }
  gh auth status --hostname github.com *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Starting GitHub browser login..."
    gh auth login --hostname github.com --git-protocol https --web --skip-ssh-key
  } else {
    Write-Host "GitHub CLI is already logged in."
  }
}

Write-Host ""
Write-Host "Hugo Git Publisher installed."
Write-Host "Vault: $VaultPath"
Write-Host "Plugin: $PluginTarget"
Write-Host "Restart Obsidian, then enable or reload Hugo Git Publisher if needed."
