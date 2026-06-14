param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$postsRoot = Join-Path $Root "content\posts"
$staticRoot = Join-Path $Root "static"
$requiredFields = @("title", "date", "draft", "slug", "categories", "tags", "summary", "comments")
$listFields = @("categories", "tags")
$errors = New-Object System.Collections.Generic.List[string]

function Add-Error($Message) {
  $script:errors.Add($Message) | Out-Null
}

function Get-FrontMatterLines($Text, $Path) {
  $lines = $Text -split "`r?`n"
  if ($lines.Count -lt 3 -or $lines[0].Trim() -ne "---") {
    Add-Error "Missing YAML frontmatter: $Path"
    return $null
  }

  for ($i = 1; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq "---") {
      return $lines[0..$i]
    }
  }

  Add-Error "Unclosed YAML frontmatter: $Path"
  return $null
}

if (-not (Test-Path -LiteralPath $postsRoot)) {
  Write-Host "Content validation passed."
  exit 0
}

$organizeScript = Join-Path $Root "scripts\content-paths.mjs"
& node $organizeScript --check $postsRoot
if ($LASTEXITCODE -ne 0) {
  Add-Error "Post files must live under content/posts/<category>/<slug>.md."
}

Get-ChildItem -LiteralPath $postsRoot -Recurse -File -Filter "*.md" | ForEach-Object {
  $path = $_.FullName
  if ($_.BaseName -eq "_index" -or $_.Name -match "^_index\.[A-Za-z-]+\.md$") {
    return
  }
  if ($_.Name -match "\.[A-Za-z-]+\.md$") {
    return
  }

  $text = Get-Content -LiteralPath $path -Raw
  $frontMatter = Get-FrontMatterLines $text $path
  if ($null -eq $frontMatter) {
    return
  }
  $frontMatterText = $frontMatter -join "`n"

  foreach ($field in $requiredFields) {
    if ($listFields -contains $field) {
      if ($frontMatterText -notmatch "(?m)^$field\s*:\s*$") {
        Add-Error "Missing YAML list field '$field': $path"
      }
      continue
    }
    if ($frontMatterText -notmatch "(?m)^$field\s*:\s*.+$") {
      Add-Error "Missing frontmatter field '$field': $path"
    }
  }

  if ($frontMatterText -match "(?m)^publish:\s*") {
    Add-Error "Obsidian-only field 'publish' must not be exported: $path"
  }
  if ($frontMatterText -notmatch "(?m)^comments:\s*(true|false)\s*$") {
    Add-Error "Frontmatter field 'comments' must be true or false: $path"
  }
  if ($text -match "\[\[[^\]]+\]\]") {
    Add-Error "Obsidian wikilink remains in exported content: $path"
  }
  if ($text -match "(?m)!\[\[[^\]]+\]\]") {
    Add-Error "Obsidian embed remains in exported content: $path"
  }
  if ($text -match 'https?://[^\s\)`"]*(notion-static\.com|notion\.site|amazonaws\.com)[^\s\)`"]*(X-Amz-|notion|secure)') {
    Add-Error "Temporary Notion file URL remains in exported content: $path"
  }
  if ($text -match '(?i)<(unknown|pdf|file)\b|file://') {
    Add-Error "Unsupported Notion artifact remains in exported content: $path"
  }

  $imageMatches = [regex]::Matches($text, "!\[[^\]]*\]\((/images/[^)]+)\)")
  foreach ($match in $imageMatches) {
    $relative = $match.Groups[1].Value.TrimStart("/") -replace "/", "\"
    $imagePath = Join-Path $staticRoot $relative
    if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
      Add-Error "Referenced image does not exist: $($match.Groups[1].Value) in $path"
    }
  }

  if ($frontMatterText -match "(?m)^cover:\s*(.+)$") {
    $coverValue = $Matches[1].Trim().Trim('"').Trim("'")
    if ($coverValue) {
      if ($coverValue -notmatch "^/") {
        Add-Error "Cover path must start with /: $path"
      } else {
        $coverRelative = $coverValue.TrimStart("/") -replace "/", "\"
        $coverPath = Join-Path $staticRoot $coverRelative
        if (-not (Test-Path -LiteralPath $coverPath -PathType Leaf)) {
          Add-Error "Cover image does not exist: $coverValue in $path"
        }
      }
    }
  }
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "Content validation passed."
