param(
  [string]$ProjectName = "yskim-blog",
  [string]$DatabaseName = "yskim_blog_comments",
  [ValidateSet("weur", "eeur", "apac", "oc", "wnam", "enam")]
  [string]$Location = "apac",
  [string]$TurnstileSiteKey = "",
  [string]$TurnstileSecretKey = "",
  [string]$AdminToken = "",
  [switch]$AutoApprove
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$schemaPath = Join-Path $root "schema\comments.sql"
$wranglerPath = Join-Path $root "wrangler.toml"
$hugoPath = Join-Path $root "hugo.yaml"

function Invoke-Wrangler {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & npx --yes wrangler @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "wrangler $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Get-D1Database {
  param([string]$Name)

  $json = & npx --yes wrangler d1 list --json
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to list D1 databases. Run 'npx wrangler login' first."
  }

  $databases = $json | ConvertFrom-Json
  return $databases | Where-Object { $_.name -eq $Name } | Select-Object -First 1
}

function Get-D1DatabaseId {
  param($Database)

  foreach ($property in @("uuid", "id", "database_id")) {
    if ($Database.PSObject.Properties.Name -contains $property -and $Database.$property) {
      return [string]$Database.$property
    }
  }

  throw "Could not determine the D1 database id from wrangler output."
}

function Write-WranglerConfig {
  param([string]$DatabaseId)

  $content = @"
name = "$ProjectName"
compatibility_date = "2026-06-08"
pages_build_output_dir = "public"

[[d1_databases]]
binding = "COMMENTS_DB"
database_name = "$DatabaseName"
database_id = "$DatabaseId"
"@

  Set-Content -LiteralPath $wranglerPath -Value $content -Encoding utf8
}

function Enable-AnonymousCommentsInHugo {
  param([string]$SiteKey)

  if (-not $SiteKey) {
    return
  }

  $text = Get-Content -LiteralPath $hugoPath -Raw
  $text = $text -replace "(\r?\n\s+anonymous:\r?\n\s+)enabled:\s+false", "`$1enabled: true"
  $text = $text -replace 'turnstileSiteKey:\s*""', "turnstileSiteKey: `"$SiteKey`""
  Set-Content -LiteralPath $hugoPath -Value $text -Encoding utf8
}

Push-Location $root
try {
  $whoamiOutput = & npx --yes wrangler whoami 2>&1
  $whoamiExitCode = $LASTEXITCODE
  $whoamiText = $whoamiOutput -join "`n"
  $whoamiOutput | Out-Host
  if ($whoamiExitCode -ne 0 -or $whoamiText -match "not authenticated|CLOUDFLARE_API_TOKEN") {
    throw "Wrangler is not authenticated. Run 'npx wrangler login' or set CLOUDFLARE_API_TOKEN and retry."
  }

  $database = Get-D1Database -Name $DatabaseName
  if (-not $database) {
    Invoke-Wrangler d1 create $DatabaseName --location $Location
    $database = Get-D1Database -Name $DatabaseName
  }

  $databaseId = Get-D1DatabaseId -Database $database
  Write-WranglerConfig -DatabaseId $databaseId
  Invoke-Wrangler d1 execute $DatabaseName --remote --file $schemaPath -y

  if ($TurnstileSecretKey) {
    $TurnstileSecretKey | & npx --yes wrangler pages secret put TURNSTILE_SECRET_KEY --project-name $ProjectName
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to store TURNSTILE_SECRET_KEY."
    }
  }

  if ($AdminToken) {
    $AdminToken | & npx --yes wrangler pages secret put COMMENTS_ADMIN_TOKEN --project-name $ProjectName
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to store COMMENTS_ADMIN_TOKEN."
    }
  }

  if ($AutoApprove) {
    "true" | & npx --yes wrangler pages secret put COMMENTS_AUTO_APPROVE --project-name $ProjectName
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to store COMMENTS_AUTO_APPROVE."
    }
  }

  Enable-AnonymousCommentsInHugo -SiteKey $TurnstileSiteKey

  Write-Host "Cloudflare anonymous comments setup is ready."
  Write-Host "D1 database: $DatabaseName ($databaseId)"
  Write-Host "Generated or updated: wrangler.toml"
  if (-not $TurnstileSiteKey -or -not $TurnstileSecretKey) {
    Write-Host "Create a Turnstile widget in Cloudflare, then rerun with -TurnstileSiteKey and -TurnstileSecretKey to enable the public form."
  }
  if (-not $AdminToken) {
    Write-Host "Set COMMENTS_ADMIN_TOKEN with -AdminToken before using the moderation API."
  }
  Write-Host "Commit wrangler.toml and hugo.yaml after confirming the settings."
}
finally {
  Pop-Location
}
