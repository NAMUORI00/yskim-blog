---
title: "비동기 작업의 재시도와 승인 기록"
date: 2026-06-15
draft: false
slug: "tech-s19"
categories:
  - "웹과 백엔드"
tags:
  - "workflow"
summary: "앞 글의 재시도와 상태 전이를 중복 메시지 예제에 적용했다. 서버의 처리는 끝났지만 응답이 유실된 상황을 가정하고, 대화, 작업, 실행 시도의 식별자를 나누어 기록하는 이유를 정리했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dcdcd44-779f-8181-a630-eb20116ba397"
generated_by: "notion"
---
앞 글의 재시도와 상태 전이를 중복 메시지 예제에 적용했다. 서버의 처리는 끝났지만 응답이 유실된 상황을 가정하고, 대화, 작업, 실행 시도의 식별자를 나누어 기록하는 이유를 정리했다.


큐 등록, 실행 시작, 결과 확인을 별도 사건으로 놓았다. 작업 큐와 상태 전이 개념을 바탕으로 재시도 전후에 보존할 기록을 살펴봤다.


## 대화, 작업, 실행 시도를 구분하기


하나의 대화에서 두 개의 작업을 요청할 수 있고, 하나의 작업을 여러 번 시도할 수도 있다. 그래서 세 식별자를 같은 값으로 쓰면 원인을 찾기 어렵다. 설명용으로 대화는 session-8, 문서 갱신 작업은 job-42, 첫 시도는 attempt-1로 적어 보자. 첫 시도가 실패하더라도 job-42의 목적은 그대로이고, 다음 실행만 attempt-2가 된다.


```plain text
session_id: session-8
job_id: job-42
attempt_id: attempt-1
operation: replace_document
target_version: 7
payload_digest: 본문 내용의 해시
status: running
```


대상 버전과 입력 해시를 함께 남기는 이유는 같은 작업 ID에 다른 내용을 끼워 넣는 일을 구분하기 위해서다. 해시는 내용을 비교하는 수단이며, 권한 검사와 중복 실행 제어는 별도로 구현한다. 동일 키의 등록을 원자적으로 처리하거나 데이터베이스의 유일성 제약을 쓰는 등 실제 저장 동작이 뒤따라야 한다.


[Amazon SQS의 표준 큐 문서](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues-at-least-once-delivery.html)는 메시지가 다시 전달될 수 있어 소비자가 중복 처리를 고려해야 한다고 설명한다.


이 사례를 모든 큐가 같은 방식으로 동작한다는 뜻으로 넓히지는 않는다. 사용할 큐의 전달 보장과 도구가 남기는 효과를 함께 확인해야 한다.


## 시간 초과와 실행 완료 여부


문서는 이미 바뀌었지만 응답이 끊긴 경우를 가정했다. 호출자가 본 시간 초과와 서버의 처리 결과가 다를 수 있다. 이 상태는 outcome_unknown으로 남기고 작업 ID로 결과나 대상 상태를 조회하는 흐름으로 두었다. 곧바로 실패로 처리해 재실행할 때 생길 수 있는 중복 변경을 구분하기 위해서다.


![readable-S19-01.png](/images/notion/tech-s19/image-1.png)


그림 1. 작업의 효과는 발생했지만 응답을 받지 못한 설명용 경로. 출처: 직접 구성.


여기서 멱등성은 같은 요청을 반복해도 의도한 효과가 더 누적되지 않도록 하는 성질이다. [HTTP 의미를 정리한 RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods)에서도 응답이 항상 같아야 한다는 뜻으로 설명하지 않는다.


첫 삭제가 성공하고 두 번째 삭제가 없는 대상을 보고할 수 있어도, 대상이 삭제된다는 효과는 더 늘지 않는다. 서버는 요청 ID를 저장하고 처리 결과와 대조하는 규칙으로 멱등성을 구현한다.


외부 도구의 효과와 로컬 완료 기록을 하나의 트랜잭션에 묶을 수 없다면 그 사이에 장애 구간이 남는다. 이 경우 도구 자체의 중복 키 지원, 결과 조회, 재조정 절차가 필요하다. 단순히 실행 전 기록을 남기는 방법만으로 정확히 한 번 실행을 주장하기는 어렵다.


## 다시 실행할 조건과 실행해도 되는 범위


재시도 조건은 실패 원인별로 나누었다. 일시적 연결 오류는 재시도 후보가 되지만 입력 오류와 권한 부족은 같은 요청의 반복으로 해결되지 않는다. 재시도가 몰리는 상황에는 지수 백오프와 무작위 지연을 비교할 수 있고, 총 시간과 최대 횟수는 별도 종료 조건으로 남는다.


승인 기록은 실행 상태와 다른 축으로 정리했다. 검토 의견과 변경 권한을 구분하고, 허용한 대상, 버전, 내용을 기록에 연결하는 방식이다. 승인 이후 입력이 달라지면 기존 허용 범위와 다시 대조할 수 있다.


![S19-02.png](/images/notion/tech-s19/image-2.png)


그림 2. 검토 의견, 반영 판단, 승인, 실행 결과를 나누어 남기는 설명용 흐름. 출처: 직접 구성.


[claude-orchestrator의 설계 문서](https://github.com/NAMUORI00/claude-orchestrator/blob/23a74633900fd496add0134456e3fe3abff590ce/claude/docs/orchestrator-architecture.md)는 정책과 명령을 조합하는 구조를 설명한다. 이것을 지속성 있는 큐나 데이터베이스 실행 상태가 이미 구현됐다는 근거로 쓰기는 어렵다.


[cross-review-bridge의 README](https://github.com/NAMUORI00/cross-review-bridge/blob/e0e20ea26d0c8eeb67fd3bffcf6d0422d97a2ef6/README.md)에서도 외부 피드백은 조언으로 받아들이고 로컬에서 검증한 뒤 반영하는 흐름을 확인할 수 있다. 상태표와 두 그림은 구현 점검을 위해 구성한 설명용 모델이다.


의존 작업에도 산출물 버전을 연결했다. A가 자료를 수집하고 B가 원고를 만드는 예제에서는 A의 시작보다 완료 결과가 B의 입력 조건이 된다. 취소한 시도의 늦은 응답도 시도 ID와 버전을 대조할 대상으로 두었다.


작업 상태와 함께 결과를 확인한 근거를 남기는 구조로 정리했다. 외부 실행 직후 프로세스가 종료되는 상황은 후속 재현 범위다. 외부 효과와 로컬 완료 기록 사이의 장애를 복구하는 과정을 비교하면 재시도 정책을 더 구체적으로 정할 수 있다.


## 함께 읽기


먼저 읽을 글: [작업 재시도와 멱등성 정리](https://blog.namuori.net/posts/tech-k19/), [이벤트, 콜백과 실행 순서](https://blog.namuori.net/posts/tech-k35/)


이어 읽을 글: [claude-orchestrator의 작업 위임과 실행 규칙](https://blog.namuori.net/posts/tech-07-02/), [Discord 봇의 대화 기록과 승인 대기 상태](https://blog.namuori.net/posts/tech-07-03/), [외부 리뷰 자료 준비와 변경 검토 과정](https://blog.namuori.net/posts/tech-07-04/)
