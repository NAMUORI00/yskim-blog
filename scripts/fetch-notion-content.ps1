param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

if (-not $env:NOTION_TOKEN) {
  throw "Missing NOTION_TOKEN. Create a read-only Notion integration token and store it as a secret."
}
$hasPostsDatabase = -not [string]::IsNullOrWhiteSpace($env:NOTION_POSTS_DATABASE_ID)
$hasSiteDatabase = -not [string]::IsNullOrWhiteSpace($env:NOTION_SITE_DATABASE_ID)

if (($hasPostsDatabase -or $hasSiteDatabase) -and -not ($hasPostsDatabase -and $hasSiteDatabase)) {
  throw "Missing split Notion database id. Set both NOTION_POSTS_DATABASE_ID and NOTION_SITE_DATABASE_ID."
}
if (-not $env:NOTION_DATABASE_ID -and -not ($hasPostsDatabase -and $hasSiteDatabase)) {
  throw "Missing Notion database settings. Set NOTION_DATABASE_ID or both NOTION_POSTS_DATABASE_ID and NOTION_SITE_DATABASE_ID."
}

& node (Join-Path $Root "scripts\notion-content.mjs") --root $Root
if ($LASTEXITCODE -ne 0) {
  throw "Notion content fetch failed."
}
