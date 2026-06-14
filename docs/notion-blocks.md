# Notion 블록 지원 현황

Notion 페이지를 발행하면 `scripts/notion-content.mjs`가 각 블록을 Markdown/HTML로
변환합니다. 아래는 블록 타입별 처리 방식입니다. 표에 없는(또는 향후 추가될) 블록은
**빌드를 깨뜨리지 않고** 안전하게 무시됩니다.

## 텍스트·구조

| 블록 | 렌더링 |
| ---- | ------ |
| 문단(paragraph) | 본문 문단. **굵게/기울임/취소선/밑줄/인라인 코드/링크** 보존 |
| 제목 1·2·3 | `<h1>`/`<h2>`/`<h3>` |
| 불릿·번호 목록 | `<ul>`/`<ol>` (중첩 포함) |
| 체크박스(to_do) | `- [ ]` / `- [x]` |
| 토글(toggle) | `<details><summary>` (자식 블록 포함) |
| 인용(quote) | `<blockquote>` |
| 콜아웃(callout) | 아이콘 + 자식 블록을 포함한 `<blockquote>` |
| 코드(code) | 언어별 하이라이트가 적용된 코드 블록 |
| 구분선(divider) | `<hr>` |
| 표(table) | Markdown 표 → `<table>` |
| 컬럼(column_list/column) | 자식 블록을 순서대로 렌더(모바일에서 자연스레 세로 배치) |
| 동기화 블록(synced_block) | 원본 자식 블록을 그대로 렌더 |
| 수식(equation) | KaTeX 블록/인라인 수식 |

## 미디어·임베드

| 블록 | 렌더링 |
| ---- | ------ |
| 이미지(image) | self-host 후 `<img>` |
| 동영상(video) | YouTube/Vimeo → 반응형 `<iframe>`, 업로드 → `<video>` |
| 오디오(audio) | `<audio>` 플레이어 |
| PDF(pdf) | `<object>` 인라인 미리보기 + 다운로드 링크 |
| 파일(file) | 파일명·확장자 배지가 있는 다운로드 카드 |
| 임베드(embed) | 동영상이면 `<iframe>`, 아니면 링크 |
| 북마크/링크 미리보기(bookmark, link_preview, link_to_page) | 제목·도메인을 보여주는 링크 카드 |

자세한 미디어 호스팅 방식(`download` vs `proxy`)은 [media-hosting.md](media-hosting.md)를 참고하세요.

## 안전 처리

- `unsupported`·`breadcrumb`·`table_of_contents` 등 마땅한 표현이 없는 블록은
  **조용히 생략**되어 빌드가 중단되지 않습니다.
- 만료되는 Notion 임시 URL, `file://`, 미변환 아티팩트는 검증 단계
  (`assertNoUnsupportedGeneratedMarkdown`, `validate-content.sh`)에서 차단됩니다.
