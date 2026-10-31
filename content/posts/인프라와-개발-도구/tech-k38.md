---
title: "파일 동기화, 백업, 변경 이력 정리"
date: 2026-09-19
draft: false
slug: "tech-k38"
categories:
  - "인프라와 개발 도구"
tags:
  - "workflow"
summary: "파일 관리에서 동기화, 백업, 변경 이력이 맡는 역할을 정리했다. 삭제가 다른 기기로 전달되면 현재 상태는 같아지지만 삭제 전 내용을 복원할 수 있는지는 별도 조건이다. 기기 간 반영과 과거 상태의 보관을 나누어 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3f4dcd44-779f-815e-af0d-c17dade53ad7"
generated_by: "notion"
---
## 두 기기의 파일 상태


파일 관리에서 동기화, 백업, 변경 이력이 맡는 역할을 정리했다. 삭제가 다른 기기로 전달되면 현재 상태는 같아지지만 삭제 전 내용을 복원할 수 있는지는 별도 조건이다. 기기 간 반영과 과거 상태의 보관을 나누어 살펴봤다.


동기화는 현재 상태를 맞추고, 백업은 특정 시점의 복사본을 보관하며, 이력은 변경 과정을 되짚는 수단이다. 도구를 비교하기에 앞서 최신 파일 공유와 실수, 장애 이후 복원 중 어떤 범위가 필요한지 정리했다.


## 단방향 복사와 양방향 동기화


단방향 복사는 원본을 유지하면서 대상에 내용을 복제하는 작업이다. rsync는 이 작업에 자주 쓰이는데, 파일 크기와 수정 시각을 비교해서 바뀐 파일만 전송한다. 원격 전송에서는 기존 파일과의 차이를 활용해 전송량을 줄일 수 있다. 로컬 복사나 whole-file 옵션 등에서는 동작이 달라진다.


```javascript
rsync -avz ./notes/ server:/backup/notes/
```


이 명령은 로컬 `notes/` 디렉터리를 서버로 복사한다. 서버에서 로컬로는 바뀐 내용을 가져오지 않는다. 한 방향이다.


양방향 동기화는 양쪽 모두의 변경을 반영한다. 노트북에서 `report.md`를 수정하고, 같은 시간에 데스크톱에서도 수정하면 양쪽 변경을 모두 반영해야 한다. 문제는 같은 파일의 같은 부분을 양쪽에서 고쳤을 때 발생한다.


## 두 기기에서 같은 파일을 수정했을 때


Syncthing은 양방향 동기화 도구다. 두 기기에서 같은 파일을 동시에 수정하면 내용이 실제로 다를 경우 충돌(conflict)이 발생한다. [Syncthing 공식 문서](https://docs.syncthing.net/users/syncing.html)에 따르면, 수정 시각이 더 오래된 쪽의 파일 이름을 바꿔서 보존한다.


예를 들어 노트북에서 14:00에 수정하고, 데스크톱에서 14:02에 수정한 뒤 동기화가 일어나면:

- `report.md` → 데스크톱 버전(14:02)으로 유지
- 노트북 버전(14:00) → `report.sync-conflict-20260915-140000-ABCDE.md`로 이름 변경

충돌 파일도 일반 파일로 다른 기기에 전파된다. 내용이 자동 병합되지는 않아 두 버전을 읽고 채택할 내용을 고르는 단계가 남는다.


<pre class="mermaid">flowchart TD
    A((&quot;노트북&quot;)) --&gt;|&quot;14:00 수정&quot;| F1[/&quot;report.md&lt;br/&gt;v1 → v2a&quot;/]
    B((&quot;데스크톱&quot;)) --&gt;|&quot;14:02 수정&quot;| F2[/&quot;report.md&lt;br/&gt;v1 → v2b&quot;/]
    F1 --&gt; Sync{&quot;동기화&lt;br/&gt;내용 비교&quot;}
    F2 --&gt; Sync
    Sync --&gt;|&quot;내용 다름&quot;| Conflict[&quot;충돌 발생&quot;]
    Conflict --&gt; Keep[/&quot;report.md&lt;br/&gt;v2b 유지&quot;/]
    Conflict --&gt; Rename[/&quot;sync-conflict-...&lt;br/&gt;v2a 보존&quot;/]</pre>


_그림 1. 두 기기에서 같은 파일을 수정했을 때 Syncthing의 충돌 처리 흐름 (설명용 예제)_


## 동기화와 백업의 관리 범위


삭제를 전파하는 양방향 동기화 설정에서는 노트북에서 지운 파일이 다른 기기에서도 지워질 수 있다. 앞의 rsync 예는 `--delete`를 쓰지 않았으므로 대상에만 남은 파일을 자동 삭제하지 않는다. 이것이 동기화와 백업의 핵심 차이다.


백업은 특정 시점의 복사본을 보관한다. 삭제된 파일이 백업에 남아 있어야 복원할 수 있다. Syncthing의 파일 버전 관리 기능은 이 문제를 부분적으로 해결한다.


[Syncthing 버전 관리 문서](https://docs.syncthing.net/users/versioning.html)에서 설명하는 방식은, 다른 기기로부터 받은 변경이 로컬 파일을 대체할 때 이전 버전을 `.stversions` 폴더에 보관하는 것이다.


그러나 이 기능은 로컬에서 직접 삭제한 파일에는 적용되지 않는다. 동기화 도구의 버전 관리와 전용 백업 도구의 보호 범위가 다른 지점이 여기서 드러난다.


## 복원 경로가 달라지는 지점


"어제 버전의 [report.md](http://report.md/)로 돌아가고 싶다"는 요청을 생각해 보면 각 방식의 차이가 선명해진다.


| 방식                  | 복원 가능 여부              | 조건                  |
| ------------------- | --------------------- | ------------------- |
| 단방향 복사 (rsync)      | 마지막 복사본만 있음           | 이전 버전은 덮어써서 사라짐     |
| 양방향 동기화 (Syncthing) | 버전 관리, 충돌 사본 등에 따라 다름 | 복원할 사본이 실제 남아 있어야 함 |
| 스냅샷 백업              | 날짜별 복원 가능             | 백업 주기에 따라 빈 시간대 존재  |
| 버전 관리 (Git)         | 커밋 단위로 복원             | 커밋하지 않은 변경은 기록 없음   |


<pre class="mermaid">flowchart LR
    Original[/&quot;report.md&lt;br/&gt;현재 상태&quot;/] --&gt; Q{&quot;무엇을&lt;br/&gt;복원?&quot;}
    Q --&gt;|&quot;직전 동기화&lt;br/&gt;이전 버전&quot;| STV[(&quot;.stversions&lt;br/&gt;폴더&quot;)]
    Q --&gt;|&quot;어제 상태&quot;| Backup[(&quot;백업&lt;br/&gt;스냅샷&quot;)]
    Q --&gt;|&quot;특정 커밋&quot;| Git[(&quot;Git&lt;br/&gt;저장소&quot;)]
    Q --&gt;|&quot;마지막 복사본&quot;| Rsync[/&quot;서버 사본&quot;/]
    STV --&gt; Restore[&quot;복원&quot;]
    Backup --&gt; Restore
    Git --&gt; Restore
    Rsync --&gt; Restore</pre>


_그림 2. 복원 요청에 따라 찾아가는 경로가 달라지는 구조 (설명용 예제)_


동기화의 복원 범위는 삭제, 덮어쓰기 전 버전의 보관 여부와 기간에 달려 있다. 백업만으로는 기기 간 최신 편집이 자동 반영되지 않는다. 두 기능을 보관과 전파의 조건으로 나누어 읽었다.


## 후속 정리


파일 형식에 따른 자동 병합의 조건과 백업 사이에 잃을 수 있는 변경량은 다음 주제로 남겼다. 작업 빈도와 백업 주기를 비교하면 복원 시점의 간격을 구체적으로 정할 수 있다.


---


**참고 자료**

- [Syncthing — Understanding Synchronization](https://docs.syncthing.net/users/syncing.html): 충돌 감지와 처리 방식
- [Syncthing — File Versioning](https://docs.syncthing.net/users/versioning.html): 버전 보관 전략
- [rsync(1) man page](https://download.samba.org/pub/rsync/rsync.1): delta-transfer 알고리즘과 기본 동작

## 함께 읽기


먼저 읽을 글: [Git 포크, 브랜치와 변경 이력 비교](https://blog.namuori.net/posts/tech-k25/)
