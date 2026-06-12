#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
CONTENT_SOURCE="${CONTENT_SOURCE:-notion}"

if [[ "${CONTENT_SOURCE}" != "notion" ]]; then
  echo "Only CONTENT_SOURCE=notion is supported in the single-repository publishing flow." >&2
  exit 1
fi

bash "${ROOT}/.github/scripts/fetch-notion-content.sh"
