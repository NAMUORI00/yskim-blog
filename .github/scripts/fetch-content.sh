#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [[ "${CONTENT_SOURCE:-repo}" == "notion" ]]; then
  bash "${ROOT}/.github/scripts/fetch-notion-content.sh"
  exit 0
fi

HUGO_YAML="${ROOT}/hugo.yaml"
DATA_DIR="${ROOT}/data"
META_PATH="${DATA_DIR}/content-source.yaml"
PRIVATE_DIR="${PRIVATE_CONTENT_DIR:-${ROOT}/.private-content}"

OWNER="NAMUORI00"
NAME="yskim-blog-private"
REF="main"
PATHS=("content" "static/images")

yaml_quote() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\r'/}"
  value="${value//$'\n'/\\n}"
  printf '"%s"' "$value"
}

read_content_repo_config() {
  if [[ ! -f "$HUGO_YAML" ]]; then
    return
  fi

  local block
  block="$(awk '
    /^[[:space:]]*contentRepo:[[:space:]]*$/ { capture=1; next }
    capture && /^[[:space:]]*[A-Za-z0-9_]+:/ && $0 !~ /^[[:space:]]*(owner|name|ref|paths):/ { exit }
    capture { print }
  ' "$HUGO_YAML" | tr -d '\r')"

  if [[ -n "$block" ]]; then
    local parsed_owner parsed_name parsed_ref
    parsed_owner="$(grep -E '^[[:space:]]*owner:' <<<"$block" | head -n1 | awk '{print $2}' | tr -d '\r')"
    parsed_name="$(grep -E '^[[:space:]]*name:' <<<"$block" | head -n1 | awk '{print $2}' | tr -d '\r')"
    parsed_ref="$(grep -E '^[[:space:]]*ref:' <<<"$block" | head -n1 | awk '{print $2}' | tr -d '\r')"
    [[ -n "$parsed_owner" ]] && OWNER="$parsed_owner"
    [[ -n "$parsed_name" ]] && NAME="$parsed_name"
    [[ -n "$parsed_ref" ]] && REF="$parsed_ref"

    local parsed_paths=()
    while IFS= read -r line; do
      parsed_paths+=("$line")
    done < <(grep -E '^[[:space:]]*-[[:space:]]+' <<<"$block" | sed -E 's/^[[:space:]]*-[[:space:]]+//' | tr -d '\r')
    if ((${#parsed_paths[@]} > 0)); then
      PATHS=("${parsed_paths[@]}")
    fi
  fi
}

copy_repo_path() {
  local source="${PRIVATE_DIR}/$1"
  local destination="${ROOT}/$1"

  if [[ ! -e "$source" ]]; then
    return
  fi

  rm -rf "$destination"
  mkdir -p "$(dirname "$destination")"
  cp -a "$source" "$destination"
}

read_content_repo_config

if [[ ! -d "$PRIVATE_DIR" ]]; then
  echo "Missing private content checkout at ${PRIVATE_DIR}." >&2
  exit 1
fi

SHA="${PRIVATE_CONTENT_SHA:-}"
if [[ -z "$SHA" ]] && command -v git >/dev/null 2>&1; then
  SHA="$(git -C "$PRIVATE_DIR" rev-parse HEAD 2>/dev/null || true)"
fi
if [[ -z "$SHA" ]]; then
  echo "Unable to determine private content SHA." >&2
  exit 1
fi

for path in "${PATHS[@]}"; do
  copy_repo_path "$path"
done

if [[ -d "${ROOT}/content" ]]; then
  find "${ROOT}/content" -type f -name '*.en.md' -delete
fi

if [[ -d "${ROOT}/content/posts" ]]; then
  node "${ROOT}/scripts/content-paths.mjs" "${ROOT}/content/posts"
fi

mkdir -p "$DATA_DIR"
{
  echo "repo: $(yaml_quote "${OWNER}/${NAME}")"
  echo "ref: $(yaml_quote "$REF")"
  echo "sha: $(yaml_quote "$SHA")"
  echo "fetched_at: $(yaml_quote "$(date -u +"%Y-%m-%dT%H:%M:%SZ")")"
  echo "paths:"
  for path in "${PATHS[@]}"; do
    echo "  - $(yaml_quote "$path")"
  done
} >"$META_PATH"

echo "Content fetched from ${OWNER}/${NAME}@${REF} (${SHA})."
