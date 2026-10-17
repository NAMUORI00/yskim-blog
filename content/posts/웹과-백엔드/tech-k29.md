---
title: "CMS 콘텐츠와 정적 웹페이지 생성"
date: 2026-09-15
draft: false
slug: "tech-k29"
categories:
  - "웹과 백엔드"
tags:
  - "workflow"
summary: "CMS의 글이 정적 웹페이지로 나오는 과정을 정리했다. 원본 수집, HTML 변환, 이미지 처리, 배포는 각각의 단계다. 글 한 편과 그림 한 장이 이 경로를 지나는 예제로 발행 상태와 공개 결과의 관계를 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8127-8361-f6d27490358b"
generated_by: "notion"
---
## 발행 상태와 문서 생성 단계


CMS의 글이 정적 웹페이지로 나오는 과정을 정리했다. 원본 수집, HTML 변환, 이미지 처리, 배포는 각각의 단계다. 글 한 편과 그림 한 장이 이 경로를 지나는 예제로 발행 상태와 공개 결과의 관계를 살펴봤다.


## 마크다운에서 정적 파일까지


아래와 같은 마크다운 파일 하나를 생각해 보자.


```markdown
---
title: "첫 글"
date: 2026-09-15
draft: false
---

본문 내용이 여기에 온다.

![사진](photo.jpg)
```


프런트매터(front matter)의 `draft: false`는 Hugo 기본 규칙에서 초안 제외 조건에 걸리지 않는다는 표시다. 발행일, 만료일과 빌드 옵션도 포함 여부에 영향을 준다. SSG는 빌드 시 이 값을 읽어 출력에 포함할지 결정한다.


Hugo를 예로 들면, `hugo build` 명령이 `content/` 디렉터리의 마크다운 파일을 Goldmark 파서로 HTML로 변환하고, `layouts/`의 템플릿과 결합해 완성된 HTML 파일을 `public/` 디렉터리에 출력한다([Hugo - Introduction](https://gohugo.io/about/introduction/)).


이 과정에서 `photo.jpg`의 처리 방식이 갈린다. `static/` 폴더에 넣으면 이름 그대로 복사되고, `assets/` 폴더에 넣고 이미지 처리 파이프라인을 거치면 호출한 리소스 처리 함수에 따라 리사이즈, 포맷 변환된 파일을 출력할 수 있다.


폴더 배치만으로 변환까지 수행되지는 않는다. 내용 해시를 URL에 쓰는 경우에도 fingerprint 처리와 실제 반환 URL을 함께 확인할 부분이 있다.


![K29-01.png](/images/notion/tech-k29/image-1.png)


그림 1. 마크다운 파일이 빌드를 거쳐 독자에게 도달하는 경로: draft 상태에 따라 빌드 포함 여부가 갈린다 (설명용 도식)


## 헤드리스 CMS가 분리하는 것


헤드리스(headless) CMS는 콘텐츠 관리와 방문자 화면의 렌더링을 분리한다. API가 JSON 등의 형태로 콘텐츠를 제공하고, 표시할 화면은 별도 앱이 만든다. CMS는 자체 편집, 미리보기 화면을 별도로 제공할 수 있다. 이 JSON을 받아 HTML을 만드는 것은 SSG나 프런트엔드 프레임워크의 몫이다.


콘텐츠와 화면을 나누면 같은 글 데이터를 웹, 모바일 앱, 뉴스레터에서 각기 다른 형태로 사용할 수 있다. 화면 기술을 바꿀 때 저장소를 유지할 여지가 생기는 대신 새 화면에 필요한 필드와 모델은 조정할 수 있다. 이 두 조건을 선택의 장단점으로 정리했다.


CMS가 테마 렌더링까지 담당하면 콘텐츠 구조와 화면 설정의 결합도도 함께 검토하게 된다. WordPress도 API를 통한 헤드리스 구성이 가능하므로 실제 콘텐츠 제공, 렌더링 경로를 확인한다.


빌드 트리거는 보통 웹훅(webhook)으로 연결된다. CMS에서 글 상태가 바뀌면 빌드 서버에 HTTP POST가 가고, 빌드 서버가 CMS API에서 콘텐츠를 가져와 전체 사이트를 다시 생성한다.


## 이미지 URL과 캐시의 관계


해시가 붙은 파일명을 쓰면 내용이 바뀔 때만 URL이 바뀐다. 같은 해시 URL의 내용을 바꾸지 않고 접근 정책에도 맞는 정적 자원이라면 긴 캐시 수명을 검토할 수 있다. 파일 내용이 바뀌면 해시도 바뀌므로 새 URL로 요청이 가고, 이전 캐시와 충돌하지 않는다.


해시 없이 같은 파일명(`photo.jpg`)을 유지하면 상황이 달라진다. 이미지를 교체했는데 CDN에 이전 버전이 남아 있으면 독자에게 옛 이미지가 보인다.


이를 해결하려면 CDN에 퍼지(purge) 요청을 보내거나, 쿼리 문자열(`photo.jpg?v=2`)을 캐시 키에 포함하도록 설정한 환경에서 버전을 구분할 수 있다. CDN이 쿼리를 무시하면 이 방법만으로 갱신되지 않는다. 해시 파일명은 이 문제를 구조적으로 피한다.


![K29-02.png](/images/notion/tech-k29/image-2.png)


그림 2. 웹훅으로 연결된 빌드, 배포 흐름: 글 발행이 빌드를 촉발하고 CDN까지 전파된다 (설명용 도식)


## 초안 미리보기와 발행 제어


`draft: true`인 글은 빌드에서 빠진다. 이것이 정적 사이트의 발행 제어 방식이다. 공개 결과물에 포함할지는 빌드 시점에 결정된다. 따라서 발행 전 초안을 확인하려면 별도의 미리보기 빌드가 필요하다.


Hugo는 `--buildDrafts` 플래그로 초안을 포함한 빌드를 지원한다([Hugo - hugo build](https://gohugo.io/commands/hugo_build/)).


미리보기 결과를 공개 CDN에 배포하면 초안도 접근 가능해질 수 있다. 출력 경로 분리는 배포 대상을 구분하는 방법이며 별도 도메인만으로 비공개가 보장되지는 않는다. 제한된 미리보기에는 인증 같은 접근 제어가 추가로 필요하다.


## 후속 검토


글이 많아질 때 전체 빌드 시간과 변경된 글만 만드는 증분 빌드(incremental build)를 비교할 수 있다. 템플릿 수정이 영향을 주는 페이지 범위와 재생성 조건은 후속 주제로 남겼다.


---


**참고 자료**

- [Hugo - Introduction](https://gohugo.io/about/introduction/)
- [Hugo - hugo build](https://gohugo.io/commands/hugo_build/)
- [Hugo - Content Organization](https://gohugo.io/content-management/organization/)

## 함께 읽기


먼저 읽을 글: [HTTP 요청과 응답, 인증과 인가 정리](https://blog.namuori.net/posts/tech-k24/)


이어 읽을 글: [Notion 콘텐츠의 저장과 사이트 반영](https://blog.namuori.net/posts/tech-s20/), [Notion 콘텐츠의 블로그 문서 변환 과정](https://blog.namuori.net/posts/tech-11-01/), [Notion 블로그의 콘텐츠 수집과 배포 흐름](https://blog.namuori.net/posts/tech-11-02/), [포트폴리오와 GitHub 프로필의 콘텐츠 구성](https://blog.namuori.net/posts/tech-11-03/)
