#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [[ -z "${NOTION_TOKEN:-}" ]]; then
  echo "Missing NOTION_TOKEN. Create a read-only Notion integration token and store it as a secret." >&2
  exit 1
fi
if [[ -z "${NOTION_DATABASE_ID:-}" ]]; then
  echo "Missing NOTION_DATABASE_ID. Set it to the Namu Garden Blog CMS database id." >&2
  exit 1
fi

node "${ROOT}/scripts/notion-content.mjs" --root "$ROOT"
