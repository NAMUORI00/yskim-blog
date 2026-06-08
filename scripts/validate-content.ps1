param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"

$postsRoot = Join-Path $Root "content\posts"
$staticRoot = Join-Path $Root "static"
$requiredFields = @("title", "date", "draft", "slug", "categories", "tags", "summary", "translationKey", "comments")
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

Get-ChildItem -LiteralPath $postsRoot -Recurse -File -Filter "*.md" | ForEach-Object {
  $path = $_.FullName
  if ($_.BaseName -eq "_index" -or $_.Name -match "^_index\.[A-Za-z-]+\.md$") {
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

  $imageMatches = [regex]::Matches($text, "!\[[^\]]*\]\((/images/[^)]+)\)")
  foreach ($match in $imageMatches) {
    $relative = $match.Groups[1].Value.TrimStart("/") -replace "/", "\"
    $imagePath = Join-Path $staticRoot $relative
    if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) {
      Add-Error "Referenced image does not exist: $($match.Groups[1].Value) in $path"
    }
  }
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Host "Content validation passed."
