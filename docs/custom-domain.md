# 커스텀 도메인 연결 (blog.namuori.net)

현재 사이트는 `https://yskim-blog.pages.dev/` 로 서비스됩니다. `*.pages.dev`
주소는 브랜딩·신뢰도·검색·애드센스 승인 모두에 불리하므로 커스텀 도메인을 연결합니다.

`namuori.net` 루트는 포트폴리오가 사용하므로, 블로그는 **`blog.namuori.net`**
서브도메인을 사용합니다.

> ⚠️ 순서 주의: **도메인을 먼저 연결해 정상 동작을 확인한 뒤** `hugo.yaml`의
> `baseURL`을 바꾸세요. baseURL을 먼저 바꾸면 아직 연결 안 된 도메인으로
> canonical·sitemap이 가리켜 검색에 잘못 등록됩니다.

---

## 1. Cloudflare Pages에 커스텀 도메인 추가

1. Cloudflare 대시보드 → **Workers & Pages** → `yskim-blog` 프로젝트.
2. **Custom domains** 탭 → **Set up a custom domain**.
3. `blog.namuori.net` 입력 → 계속.
4. `namuori.net`이 같은 Cloudflare 계정의 영역(zone)에 있으면 CNAME 레코드가
   자동 생성됩니다. **확인/활성화**만 누르면 됩니다.
5. 다른 DNS에 있다면, 해당 DNS에 다음 레코드를 직접 추가:
   - 유형: `CNAME`
   - 이름: `blog`
   - 값: `yskim-blog.pages.dev`
6. 상태가 **Active**가 되고 HTTPS 인증서가 발급될 때까지 대기(보통 수 분).
7. 브라우저에서 `https://blog.namuori.net/` 접속 확인.

## 2. baseURL 변경 (도메인 활성화 확인 후)

`hugo.yaml`:

```yaml
baseURL: https://blog.namuori.net/
```

커밋 → `main` push → GitHub Actions 재배포. 이후 sitemap·canonical·OG·RSS의
모든 절대 URL이 새 도메인으로 갱신됩니다.

## 3. 배포 브랜치 메모

배포는 GitHub Actions가 `wrangler pages deploy ... --branch production`으로
수행합니다(자세한 내용은 `docs/cloudflare-pages.md`). 커스텀 도메인은
**production 브랜치**에 연결된 프로덕션 배포를 가리키도록 설정되어 있어야 합니다.

## 4. 연결 후 체크리스트

- [ ] `https://blog.namuori.net/robots.txt` 의 `Sitemap:` 줄이 새 도메인인지 확인
- [ ] `baseURL` 변경 후 재배포 완료
- [ ] Google Search Console / 네이버 서치어드바이저를 **새 도메인**으로 등록
      (`docs/seo-search-console.md`)
- [ ] 기존 `*.pages.dev`는 검색엔진에 등록하지 않거나, 등록했다면 새 도메인으로 이전
