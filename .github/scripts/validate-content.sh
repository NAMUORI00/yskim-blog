#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
POSTS_ROOT="${ROOT}/content/posts"
STATIC_ROOT="${ROOT}/static"
REQUIRED_FIELDS=(title date draft slug categories tags summary comments)
LIST_FIELDS=(categories tags)
ERRORS=()

add_error() {
  ERRORS+=("$1")
}

extract_frontmatter() {
  local file="$1"
  local text="$2"
  local line_count
  line_count="$(wc -l <"$file" | tr -d ' ')"

  if ((line_count < 3)) || ! head -n1 "$file" | tr -d '\r' | grep -qx -- '---'; then
    add_error "Missing YAML frontmatter: ${file}"
    return 1
  fi

  local end_line=0
  local line
  local i=2
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line//$'\r'/}"
    if [[ "$line" == "---" ]]; then
      end_line=$i
      break
    fi
    ((i++))
  done < <(tail -n +2 "$file")

  if ((end_line == 0)); then
    add_error "Unclosed YAML frontmatter: ${file}"
    return 1
  fi

  FRONTMATTER="$(sed -n "1,${end_line}p" "$file" | tr -d '\r')"
  return 0
}

should_skip_file() {
  local basename="$1"
  local filename="$2"

  if [[ "$basename" == "_index" ]]; then
    return 0
  fi
  if [[ "$filename" =~ ^_index\.[A-Za-z-]+\.md$ ]]; then
    return 0
  fi
  if [[ "$filename" =~ \.[A-Za-z-]+\.md$ ]]; then
    return 0
  fi
  return 1
}

if [[ ! -d "$POSTS_ROOT" ]]; then
  echo "Content validation passed."
  exit 0
fi

if ! node "${ROOT}/scripts/content-paths.mjs" --check "$POSTS_ROOT"; then
  add_error "Post files must live under content/posts/<category>/<slug>.md."
fi

while IFS= read -r -d '' file; do
  basename="$(basename "$file" .md)"
  filename="$(basename "$file")"
  if should_skip_file "$basename" "$filename"; then
    continue
  fi

  text="$(tr -d '\r' <"$file")"
  if ! extract_frontmatter "$file" "$text"; then
    continue
  fi

  for field in "${REQUIRED_FIELDS[@]}"; do
    is_list=false
    for list_field in "${LIST_FIELDS[@]}"; do
      if [[ "$field" == "$list_field" ]]; then
        is_list=true
        break
      fi
    done

    if $is_list; then
      if ! grep -Eq "^${field}[[:space:]]*:[[:space:]]*$" <<<"$FRONTMATTER"; then
        add_error "Missing YAML list field '${field}': ${file}"
      fi
    else
      if ! grep -Eq "^${field}[[:space:]]*:[[:space:]]*.+" <<<"$FRONTMATTER"; then
        add_error "Missing frontmatter field '${field}': ${file}"
      fi
    fi
  done

  if grep -Eq '^publish[[:space:]]*:' <<<"$FRONTMATTER"; then
    add_error "Obsidian-only field 'publish' must not be exported: ${file}"
  fi

  if ! grep -Eq '^comments[[:space:]]*:[[:space:]]*(true|false)[[:space:]]*$' <<<"$FRONTMATTER"; then
    add_error "Frontmatter field 'comments' must be true or false: ${file}"
  fi

  if grep -Eq '\[\[[^]]+\]\]' <<<"$text"; then
    add_error "Obsidian wikilink remains in exported content: ${file}"
  fi

  if grep -Eq '!\[\[[^]]+\]\]' <<<"$text"; then
    add_error "Obsidian embed remains in exported content: ${file}"
  fi

  while IFS= read -r image_path; do
    [[ -z "$image_path" ]] && continue
    relative="${image_path#/}"
    image_file="${STATIC_ROOT}/${relative}"
    if [[ ! -f "$image_file" ]]; then
      add_error "Referenced image does not exist: ${image_path} in ${file}"
    fi
  done < <(grep -Eo '!\[[^]]*\]\(/images/[^)]+\)' <<<"$text" 2>/dev/null | sed -E 's/!\[[^]]*\]\(([^)]+)\)/\1/' || true)

  cover_line="$(grep -E '^cover[[:space:]]*:' <<<"$FRONTMATTER" | head -n1 || true)"
  cover_value="$(sed -E 's/^cover[[:space:]]*:[[:space:]]*//; s/^"//; s/"$//; s/^'\''//; s/'\''$//' <<<"${cover_line:-}" | tr -d '\r')"
  if [[ -n "$cover_value" ]]; then
    if [[ "$cover_value" != /* ]]; then
      add_error "Cover path must start with /: ${file}"
    else
      cover_relative="${cover_value#/}"
      cover_file="${STATIC_ROOT}/${cover_relative}"
      if [[ ! -f "$cover_file" ]]; then
        add_error "Cover image does not exist: ${cover_value} in ${file}"
      fi
    fi
  fi
done < <(find "$POSTS_ROOT" -type f -name '*.md' -print0)

if ((${#ERRORS[@]} > 0)); then
  for error in "${ERRORS[@]}"; do
    echo "Error: ${error}" >&2
  done
  exit 1
fi

echo "Content validation passed."
