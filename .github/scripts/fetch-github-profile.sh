#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
DATA_DIR="${ROOT}/data"
OUTPUT_PATH="${DATA_DIR}/github.yaml"

yaml_quote() {
  local value="${1:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\r'/}"
  value="${value//$'\n'/\\n}"
  printf '"%s"' "$value"
}

read_github_username() {
  echo "${GITHUB_PROFILE_USERNAME:-NAMUORI00}"
}

read_profile_fallback() {
  # Used only if the GitHub API call fails. The live values come from the API.
  FALLBACK_LOGIN="${GITHUB_PROFILE_USERNAME:-NAMUORI00}"
  FALLBACK_NAME="${GITHUB_PROFILE_USERNAME:-NAMUORI00}"
  FALLBACK_BIO=""
  FALLBACK_AVATAR="https://github.com/${GITHUB_PROFILE_USERNAME:-NAMUORI00}.png"
  FALLBACK_HTML="https://github.com/${GITHUB_PROFILE_USERNAME:-NAMUORI00}"
}

write_github_data() {
  local login="$1"
  local name="$2"
  local bio="$3"
  local avatar_url="$4"
  local html_url="$5"
  local fetched_at="$6"

  mkdir -p "$DATA_DIR"
  {
    echo "login: ${login}"
    echo "name: $(yaml_quote "$name")"
    echo "bio: $(yaml_quote "$bio")"
    echo "avatar_url: ${avatar_url}"
    echo "html_url: ${html_url}"
    echo "fetched_at: $(yaml_quote "$fetched_at")"
  } >"$OUTPUT_PATH"
}

USERNAME="$(read_github_username)"
read_profile_fallback
FETCHED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

AUTH_HEADER=()
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

if ! command -v jq >/dev/null 2>&1; then
  if [[ -f "$OUTPUT_PATH" ]]; then
    echo "jq is unavailable; keeping existing data/github.yaml." >&2
    exit 0
  fi

  write_github_data \
    "$FALLBACK_LOGIN" \
    "$FALLBACK_NAME" \
    "$FALLBACK_BIO" \
    "$FALLBACK_AVATAR" \
    "$FALLBACK_HTML" \
    "$FETCHED_AT"
  echo "jq is unavailable; wrote fallback profile." >&2
  exit 0
fi

if RESPONSE="$(curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  -H "User-Agent: namu-garden-blog-fetch-profile" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "${AUTH_HEADER[@]}" \
  "https://api.github.com/users/${USERNAME}")"; then

  LOGIN="$(jq -r '.login // empty' <<<"$RESPONSE")"
  NAME="$(jq -r 'if .name == null or .name == "" then .login else .name end' <<<"$RESPONSE")"
  BIO="$(jq -r '.bio // ""' <<<"$RESPONSE")"
  AVATAR="$(jq -r '.avatar_url // empty' <<<"$RESPONSE")"
  HTML="$(jq -r '.html_url // empty' <<<"$RESPONSE")"

  write_github_data "$LOGIN" "$NAME" "$BIO" "$AVATAR" "$HTML" "$FETCHED_AT"
  echo "GitHub profile fetched for ${LOGIN}."
  exit 0
fi

if [[ -f "$OUTPUT_PATH" ]]; then
  echo "GitHub profile fetch failed; keeping existing data/github.yaml." >&2
  exit 0
fi

write_github_data \
  "$FALLBACK_LOGIN" \
  "$FALLBACK_NAME" \
  "$FALLBACK_BIO" \
  "$FALLBACK_AVATAR" \
  "$FALLBACK_HTML" \
  "$FETCHED_AT"
echo "GitHub profile fetch failed; wrote fallback profile." >&2
