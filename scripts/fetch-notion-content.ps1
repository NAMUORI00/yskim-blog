param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

if (-not $env:NOTION_TOKEN) {
  throw "Missing NOTION_TOKEN. Create a read-only Notion integration token and store it as a secret."
}
if (-not $env:NOTION_DATABASE_ID) {
  throw "Missing NOTION_DATABASE_ID. Set it to the Namu Garden Blog CMS database id."
}

& node (Join-Path $Root "scripts\notion-content.mjs") --root $Root
if ($LASTEXITCODE -ne 0) {
  throw "Notion content fetch failed."
}
