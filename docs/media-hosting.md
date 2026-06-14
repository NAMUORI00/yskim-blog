# 미디어 호스팅 모드 (다운로드 vs Notion 프록시)

영상·오디오·첨부파일 같은 **무거운 미디어**를 어떻게 다룰지 두 가지 모드로
설정할 수 있습니다. `NOTION_MEDIA_MODE` 저장소 변수로 전환합니다.

| 모드 | 동작 | 장점 |
| ---- | ---- | ---- |
| `download` (기본) | 빌드 때 미디어를 내려받아 `static/files/notion/`에 self-host | 단순·안정. 외부 의존 없음 |
| `proxy` | 미디어를 내려받지 않고 `/media/<블록ID>` 링크만 심음. 요청 시 Cloudflare Function이 Notion에서 신선한 URL을 받아 302 리다이렉트 | 저장소·빌드가 가벼움. 실물은 Notion(S3)이 호스팅 |

- **이미지**는 두 모드 모두 self-host합니다(작고, 성능·SEO에 유리).
- **YouTube/Vimeo**는 두 모드 모두 반응형 `<iframe>`으로 직접 임베드합니다.
- 외부 직접 URL(예: 외부 호스팅 mp4)은 `proxy` 모드에서 그대로 직접 서빙합니다.

## 왜 프록시가 필요한가

Notion 업로드 파일의 URL은 **약 1시간 뒤 만료되는 S3 임시 URL**입니다. 그래서
URL을 그대로 박아둘 수 없고, `proxy` 모드는 요청 시점에 `functions/media/[id].js`가
Notion API(`GET /v1/blocks/{id}`)로 새 URL을 받아 리다이렉트합니다.

## proxy 모드 켜기

1. **Cloudflare Pages에 `NOTION_TOKEN` 추가** (필수):
   - Cloudflare 대시보드 → Workers & Pages → `yskim-blog` → Settings →
     Variables and Secrets → **Production**과 **Preview** 모두에
     `NOTION_TOKEN` = (읽기 전용 Notion 통합 토큰) 추가 후 저장.
   - 이 토큰은 런타임에 Function이 Notion을 호출하는 데 쓰입니다.
2. **저장소 변수 설정**: `NOTION_MEDIA_MODE` = `proxy`
   (GitHub → yskim-blog → Settings → Variables, 또는 `gh variable set`).
3. 다음 빌드(수동 dispatch / 스케줄 / `main` push)부터 미디어가 `/media/<id>`로
   서빙됩니다.

> ⚠️ `NOTION_TOKEN`을 Pages에 추가하기 전에 `proxy`로 바꾸면 미디어가 500을
> 반환합니다. 토큰을 먼저 추가하세요. 되돌리려면 `NOTION_MEDIA_MODE`를
> `download`로 바꾸면 됩니다.
