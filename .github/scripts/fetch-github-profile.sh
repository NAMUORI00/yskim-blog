#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
HUGO_YAML="${ROOT}/hugo.yaml"
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
  local username
  username="$(grep -E '^[[:space:]]*username:' "$HUGO_YAML" | head -n1 | awk '{print $2}' | tr -d '\r')"
  if [[ -n "$username" ]]; then
    echo "$username"
  else
    echo "NAMUORI00"
  fi
}

read_profile_fallback() {
  local block
  block="$(awk '
    /^[[:space:]]*profileFallback:[[:space:]]*$/ { capture=1; next }
    capture && /^[[:space:]]*[A-Za-z0-9_]+:/ && $0 !~ /^[[:space:]]*(login|name|bio|avatar_url|html_url):/ { exit }
    capture { print }
  ' "$HUGO_YAML" | tr -d '\r')"

  FALLBACK_LOGIN="$(grep -E '^[[:space:]]*login:' <<<"$block" | head -n1 | awk '{print $2}')"
  FALLBACK_NAME="$(grep -E '^[[:space:]]*name:' <<<"$block" | head -n1 | sed -E 's/^[[:space:]]*name:[[:space:]]*//; s/^"//; s/"$//')"
  FALLBACK_BIO="$(grep -E '^[[:space:]]*bio:' <<<"$block" | head -n1 | sed -E 's/^[[:space:]]*bio:[[:space:]]*//; s/^"//; s/"$//')"
  FALLBACK_AVATAR="$(grep -E '^[[:space:]]*avatar_url:' <<<"$block" | head -n1 | awk '{print $2}')"
  FALLBACK_HTML="$(grep -E '^[[:space:]]*html_url:' <<<"$block" | head -n1 | awk '{print $2}')"

  FALLBACK_LOGIN="${FALLBACK_LOGIN:-NAMUORI00}"
  FALLBACK_NAME="${FALLBACK_NAME:-NAMUORI00}"
  FALLBACK_BIO="${FALLBACK_BIO:-}"
  FALLBACK_AVATAR="${FALLBACK_AVATAR:-https://github.com/NAMUORI00.png}"
  FALLBACK_HTML="${FALLBACK_HTML:-https://github.com/NAMUORI00}"
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
