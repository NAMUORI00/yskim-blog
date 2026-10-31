---
title: "Git 포크, 브랜치와 변경 이력 비교"
date: 2025-03-30
draft: false
slug: "tech-k25"
categories:
  - "인프라와 개발 도구"
tags:
  - "workflow"
summary: "포크에서 직접 수정한 범위를 읽기 위해 브랜치와 원본 이력의 관계를 정리했다. 최신 원본과의 차이에는 포크 이후 원본의 변경도 섞일 수 있다. 비교할 커밋과 공통 조상을 먼저 정하는 흐름으로 예제를 구성했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-81c6-b007-ec6fbd8dfc68"
generated_by: "notion"
---
## 같은 코드를 두 곳에서 고칠 때


포크에서 직접 수정한 범위를 읽기 위해 브랜치와 원본 이력의 관계를 정리했다. 최신 원본과의 차이에는 포크 이후 원본의 변경도 섞일 수 있다. 비교할 커밋과 공통 조상을 먼저 정하는 흐름으로 예제를 구성했다.


## 원본 두 커밋, 포크 한 커밋으로 보는 구조


원본 저장소에 커밋 두 개가 쌓여 있다고 하자.


```javascript
커밋 A: README.md 생성 — "프로젝트 소개"
커밋 B: config.json 추가 — {"port": 3000}
```


이 시점에 포크를 만들면 포크 저장소에 A와 B가 그대로 복제된다. 포크는 별도 저장소이므로, 이후에 어느 쪽에서 커밋을 추가해도 상대편에 영향을 주지 않는다. 포크에서 하나를 추가해 본다.


```javascript
커밋 C (포크): config.json 수정 — {"port": 8080}
```


브랜치였다면 같은 저장소 안에 `main`과 `feature`가 나란히 존재하고, `git log main..feature` 한 줄로 feature에만 있는 커밋을 곧바로 볼 수 있다.


포크에서는 원본 이력을 로컬에 가져오면 같은 비교를 할 수 있다. 리모트를 등록하면 반복 비교에 사용할 주소를 편리하게 관리할 수 있다. 예제에서는 이력의 위치부터 나눈 뒤 비교 기준을 정했다.


![K25-01.png](/images/notion/tech-k25/image-1.png)


_그림 1. 포크에서 변경을 만들고 원본과 비교하는 설명용 흐름. 출처: 본문 예제, 직접 작성_


## 브랜치에서 내 변경 찾기


같은 저장소 안의 브랜치는 추가 설정 없이 비교할 수 있다.


```bash
# feature에만 있는 커밋
git log main..feature --oneline

# 공통 조상 기준 변경 파일
git diff main...feature --stat
```


`main..feature`는 "main에 없고 feature에만 있는 커밋"이라는 뜻이다. 점 세 개(`...`)를 쓰면 두 브랜치의 공통 조상부터 feature 끝까지의 차이를 보여준다. `--stat`을 붙이면 파일별 추가, 삭제 줄 수가 나오므로, 어떤 파일에 작업이 집중되었는지 한눈에 확인할 수 있다.


`git diff`에서 점 두 개와 세 개가 헷갈릴 수 있다. `A..B`는 A 끝과 B 끝의 스냅샷을 직접 비교하는 반면, `A...B`는 A와 B의 공통 조상과 B 끝을 비교한다. 브랜치가 갈라진 이후 B에서만 변경된 부분만 골라보고 싶다면 점 세 개 쪽이 유용하다.


## 포크에서 원본과 비교하기


포크를 클론한 로컬에서 원본 저장소를 `upstream`으로 등록하면, 브랜치 비교와 동일한 명령을 쓸 수 있게 된다.


```bash
git remote add upstream https://github.com/원본/repo.git
git fetch upstream

git log upstream/main..HEAD --oneline
git diff upstream/main...HEAD
```


![K25-02.png](/images/notion/tech-k25/image-2.png)


_그림 2. 원격 이력을 로컬로 가져온 뒤 비교하는 흐름. remote add는 로컬 설정이며 원본 서버를 수정하지 않는다. 출처: 본문 예제, 직접 작성_


포크는 호스팅 서비스가 저장소 사이의 관계를 관리하는 방식이다. Git이 보는 것은 커밋 그래프뿐이고, "이 저장소는 저 저장소에서 복제되었다"는 관계는 GitHub 같은 호스팅 서비스가 기억해 준다. `upstream`을 등록하는 것은 그 관계를 로컬에서 직접 재현하는 셈이다.


## 줄 단위 출처와 동기화 문제


특정 파일의 각 줄이 어느 커밋에서 왔는지 보려면 `git blame`이 쓸모 있다.


```bash
git blame config.json
```


blame의 기본 출력은 해당 줄에 마지막으로 영향을 준 커밋과 작성자 정보다. 최초 작성자나 전체 기여와는 범위가 다르다. 이동, 복사, 포맷 변경도 해석에 영향을 주며 작성자 메타데이터만으로 소유권이 증명되지는 않는다.


[git-blame 문서](https://git-scm.com/docs/git-blame)의 추적 옵션을 함께 확인할 이유다. `git log -p -- config.json`을 쓰면 해당 파일을 건드린 모든 커밋과 변경 내용이 시간순으로 나열되어, 하나의 파일이 어떤 경로를 거쳐 지금 모양이 되었는지 따라갈 수 있다.


포크를 만든 뒤 원본에 커밋 D가 추가되면, 내 포크에는 D가 없다. 이 상태에서 Pull Request를 보내면 충돌이 생길 수 있다. `git fetch upstream` 후 `git rebase upstream/main`을 실행하면 내 커밋을 새 기반 위에서 다시 만들 수 있다.


공유한 커밋을 재작성하면 다른 사람의 기준 이력과 달라질 수 있다. 기존 커밋을 유지하는 merge도 이 상황의 대안이다. 변경 범위를 읽는 작업은 fetch 이후 log와 diff만으로 진행할 수 있어 이력 재작성과 분리했다.


## 추가 확인 항목


Git 내부의 커밋, 트리, 블롭 저장 구조와 `git diff` 출력의 관계는 후속 주제로 정리했다. 같은 줄을 여러 사람이 고친 경우의 충돌 해결도 머지 전략과 함께 살펴볼 내용으로 남았다.


**참고**

- [About forks — GitHub Docs](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-forks)
- [git-diff — Git Documentation](https://git-scm.com/docs/git-diff)
- [git-log — Git Documentation](https://git-scm.com/docs/git-log)

## 함께 읽기


이어 읽을 글: [표시 이름과 저장 형식의 호환성](https://blog.namuori.net/posts/tech-s02/), [포크의 기준 버전과 수정 범위 정리](https://blog.namuori.net/posts/tech-s05/), [노트 이전의 충돌, 링크, 첨부파일 관리](https://blog.namuori.net/posts/tech-s21/), [Structly 이름 변경과 파일, 플러그인 호환성 정리](https://blog.namuori.net/posts/structly-api-abi-compatibility/)
