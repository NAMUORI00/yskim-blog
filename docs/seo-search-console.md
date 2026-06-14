# 검색엔진 등록 가이드 (Google + 네이버)

블로그를 검색에 노출하려면 두 검색엔진에 사이트를 등록하고 sitemap을 제출해야
합니다. 한국 트래픽은 **구글 + 네이버 이원화**가 핵심입니다.

> 소유확인 코드는 `hugo.yaml`의 `params.googleSiteVerification`,
> `params.naverSiteVerification`에 입력하면 `<head>`에 자동으로 meta 태그가
> 들어갑니다. 코드 입력 후 배포해야 인증이 완료됩니다.

전제: **커스텀 도메인 연결을 먼저 끝내는 것을 권장**합니다. `*.pages.dev`로 먼저
등록한 뒤 도메인을 바꾸면 재등록·재색인이 필요합니다.

---

## 1. Google Search Console

1. <https://search.google.com/search-console> 접속 → 속성 추가.
2. 속성 유형은 **URL 접두어**를 선택하고 사이트 주소 입력
   (예: `https://blog.namuori.net/`).
3. 소유확인 방법 중 **HTML 태그**를 선택하면 `content="..."` 값이 표시됩니다.
   그 값(코드)만 복사합니다.
4. `hugo.yaml` 에 입력:

   ```yaml
   params:
     googleSiteVerification: "여기에_복사한_코드"
   ```

5. 커밋 → `main` push → GitHub Actions가 배포 완료할 때까지 대기.
6. Search Console로 돌아가 **확인** 클릭.
7. 좌측 **Sitemaps** → `sitemap.xml` 입력 후 제출.
8. **URL 검사**에서 주요 글 URL을 넣고 **색인 생성 요청**으로 색인을 앞당길 수 있습니다.

## 2. 네이버 서치어드바이저

1. <https://searchadvisor.naver.com> 접속 → 웹마스터 도구 → 사이트 등록.
2. 사이트 URL 입력 후 소유확인에서 **HTML 태그** 방식 선택, 코드 복사.
3. `hugo.yaml` 에 입력:

   ```yaml
   params:
     naverSiteVerification: "여기에_복사한_코드"
   ```

4. 커밋 → 배포 → **소유확인** 클릭.
5. **요청 → 사이트맵 제출**에 `sitemap.xml` 등록.
6. **요청 → RSS 제출**에 `index.xml`(Hugo RSS) 등록 — 네이버는 RSS 수집을 활용합니다.
7. **검증 → 웹페이지 최적화**로 메타·구조 점검.

> ⚠️ 네이버는 외부 사이트 색인이 구글보다 느리고 보수적입니다. 빠른 한국 노출이
> 목표라면 네이버 블로그에 **요약 + 원문 링크** 형태로 교차 게시하는 전략을 함께
> 쓰는 것을 권장합니다(중복 콘텐츠는 canonical로 원문을 가리키게 처리).

## 3. 등록 후 확인

- `https://<도메인>/robots.txt` 에 `Sitemap:` 줄이 있는지 확인.
- `https://<도메인>/sitemap.xml` 이 정상 출력되는지 확인.
- 구글에서 `site:<도메인>` 검색으로 색인 여부 추적(보통 며칠~수주 소요).

## 4. 두 verification을 동시에 넣은 예시

```yaml
params:
  googleSiteVerification: "abcd1234..."
  naverSiteVerification: "efgh5678..."
```

두 코드가 모두 비어 있으면 meta 태그는 출력되지 않으므로 안전합니다.
