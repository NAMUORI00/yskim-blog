#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [[ -z "${NOTION_TOKEN:-}" ]]; then
  echo "Missing NOTION_TOKEN. Create a read-only Notion integration token and store it as a secret." >&2
  exit 1
fi
if [[ -z "${NOTION_POSTS_DATABASE_ID:-}" || -z "${NOTION_SITE_DATABASE_ID:-}" ]]; then
  echo "Missing Notion database settings. Set both NOTION_POSTS_DATABASE_ID and NOTION_SITE_DATABASE_ID." >&2
  exit 1
fi

node "${ROOT}/scripts/notion-content.mjs" --root "$ROOT"
