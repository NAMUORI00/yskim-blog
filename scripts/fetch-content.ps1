param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$source = if ($env:CONTENT_SOURCE) { $env:CONTENT_SOURCE } else { "notion" }
if ($source -ne "notion") {
  throw "Only CONTENT_SOURCE=notion is supported in the single-repository publishing flow."
}

& (Join-Path $Root "scripts\fetch-notion-content.ps1") -Root $Root
if ($LASTEXITCODE -ne 0) {
  throw "Notion content fetch failed."
}
