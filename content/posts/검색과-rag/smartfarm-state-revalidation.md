---
title: "SmartFarm 상태 변경과 답변 재검증"
date: 2026-09-13
draft: false
slug: "smartfarm-state-revalidation"
categories:
  - "검색과 RAG"
tags:
  - "rag"
  - "ml"
summary: "SmartFarm 연구에서는 상태가 바뀔 때 답변을 어디까지 다시 검토할지 다뤘다. 결정론적 연구 하네스에서 답변 전체를 다시 만드는 경로와 바뀐 값에 의존한 부분만 고치는 경로를 비교하도록 구성했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-81d5-bf36-c289432b4f6b"
generated_by: "notion"
---
SmartFarm 연구에서는 상태가 바뀔 때 답변을 어디까지 다시 검토할지 다뤘다. 결정론적 연구 하네스에서 답변 전체를 다시 만드는 경로와 바뀐 값에 의존한 부분만 고치는 경로를 비교하도록 구성했다.


## 구현과 확인 과정


smartfarm 저장소의 상태 재검증 연구 모듈을 살펴봤다. 상태 값이 바뀌었을 때 답변 전체를 다시 만드는 경로와, 바뀐 값에 의존하는 부분만 골라 고치는 경로를 비교하는 코드였다. 여기서는 결정론적 연구 하네스에서 상태 변경과 답변 재검증을 다룬다.


![06-state-roles.png](/images/notion/smartfarm-state-revalidation/image-1.png)


그림 1. 상태 재검증 연구 모듈과 제품 콘솔의 승인, 실행 흐름. 두 구현은 분리되어 있으며, 아래 실행 대상은 실제 농장 장비가 아닌 시뮬레이터다.


## 답변 전체 갱신과 선택적 개정


답변 전체를 다시 만들면 갱신 경로가 단순하지만, 변경과 무관한 설명도 다시 생성된다. 연구 모듈은 답변 단위가 어떤 상태에 의존하는지 미리 선언해 두고 영향받은 부분만 고치는 경로를 따로 두고 있었다. 재생성 범위가 줄어드는 대신, 의존성을 빠뜨리면 필요한 갱신도 누락된다.


## 실험의 비교 조건


[실험 조건 정의](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/contracts.py)의 `Condition` 열거형이 네 조건을 정의한다.

- **B0** (one-shot): 재검증 없이 한 번 생성
- **B1** (block): 관련 상태 변경 후 실행을 차단
- **B2** (refresh-once): 한 번 응답을 갱신한 뒤 최종 상태, 실행 검사 수행
- **SR** (selective-revision): 변경에 영향받는 답변 단위만 다시 생성한 뒤 같은 최종 검사 수행

`Barrier` 열거형에 12개의 검사 장벽이 정의되어 있고, `FailureCode`가 각 장벽의 실패 유형을 나타낸다. 주요 결과, 명세 객체는 frozen 데이터클래스로 선언된다. 필드 재할당을 제한하며, 중첩 객체의 변경 가능성은 그 객체의 타입과 사용 방식에 따라 확인해야 한다.


## 상태 의존성과 개정 대상


SR 경로에서 눈에 띈 부분은 개정 범위를 생성된 텍스트 내용으로 정하지 않는다는 점이었다. 모델 출력을 읽고 사후에 의존성을 추정하는 방식과 달리, 의존 관계를 생성 전에 선언하는 구조다.


[답변과 상태의 의존성 관리](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/dependency.py)의 `DependencyRegistry`는 사전 선언된 프로파일만 받는다.


보조 함수 `declare_answer_units()`로 답변 단위 명세를, `declare_related_state()`로 상태 의존성 프로파일을 만들고 레지스트리에 등록한다. 모델 출력에서 의존성을 추론하는 로직은 없다.


`affected_unit_ids(spec, diff)` 함수는 선언된 의존성과 계산된 `StateDiff`만 사용해서 영향받는 답변 단위 ID를 반환한다. 생성된 텍스트 내용은 전혀 참조하지 않으므로, 프로파일 선언 시점에는 가능한 의존관계가 정해진다.


실제로 고칠 단위는 실행 중 발생한 상태 차이와 미리 선언된 관계를 대조해 정하고 있었다. 고정된 것은 관계 선언이며, 어떤 단위를 다시 생성할지는 실행 중 발생한 변경에 따라 달라질 수 있다.


프로파일에 답변 단위가 선언되지 않은 조건은 상태 키 하나당 답변 단위 하나로 폴백한다. v1 확인 실험의 조건들이 이 폴백 경로를 타므로 기존 동작이 유지된다.


## 상태를 바꾸는 시점을 따라가 보기


[재검증 실험 실행 코드](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/engine.py)의 `ExperimentEngine`이 재검증 흐름 전체를 실행한다.


`StateReader`, `StateMutator`, `BarrierInjector` 프로토콜이 상태 접근 인터페이스를 추상화하고, `InMemoryStateStore`가 메모리 기반 구현을 제공한다. `BarrierPatchInjector`가 장벽 기반 상태 주입을 수행한다.


`ExperimentEngine.run()` 메서드가 조건(B0/B1/B2/SR)에 따라 분기하면서, 상태 스냅샷 → 생성 → 상태 변경 주입 → 재검증(또는 개정) → 최종 검사의 흐름을 실행한다. `RunResult` 데이터클래스가 실행 결과를 담는다. SR 경로에서는 `affected_unit_ids()`가 반환한 단위만 재생성한다.


`RevalidationEngine`은 `ExperimentEngine`의 별칭이다.


## 생성 횟수의 측정 범위


이 모듈은 제품 런타임을 임포트하거나 호스트 포트를 열지 않는 연구용 구성이었고, 시나리오 값도 통제된 입력이었다. 제품 기능과는 별개이므로, 여기서 확인한 동작을 실측 농장 결과로 바로 옮기기는 어렵다.


결정론적 생성기를 사용해 생성 후 재검증 메커니즘과 자동 오라클을 검증하는 구성이었다. 이 기록에서 자연어 품질이나 실제 LLM 토큰 비용, 장치, 농장 결과까지 측정했다고 볼 근거는 없었다. `unit_generation_count`는 결정론적 하네스에서 생성한 답변 단위 수를 가리킨다.


이 수가 줄더라도 실제 LLM의 입력 토큰, 출력 토큰, 지연, 비용이 같은 비율로 줄어든다고 볼 수는 없다. 실제 모델에서는 일부 문단만 고치더라도 전체 문맥을 다시 전달해야 할 수 있기 때문이다.


## 간단한 상태 변화로 보는 SR


설명용으로 답변을 환경 요약 U1, 급수 제안 U2, 장치 상태 U3로 나눈다고 하자. U1은 온도와 습도, U2는 수분 상태와 사용 가능 자원, U3는 장치 상태에 의존한다고 미리 선언한다. 생성 이후 장치 상태만 바뀌었다면 직접 영향을 받는 단위는 U3다. 전체를 갱신하는 B2와 달리 SR은 선언된 관계에 따라 U3를 다시 생성한다.


선택 범위를 설명하기 위해 구성한 가상 시나리오다. 만약 장치 상태가 급수 가능 여부에도 영향을 준다면 U2에도 해당 의존성이 선언되어 있어야 한다. 선언이 빠지면 선택적 개정이 갱신이 필요한 단위를 그대로 보존하게 된다. 일부만 고치는 경로를 쓸 때는 의존관계 누락 여부를 먼저 점검하는 것이 전제가 된다.


재검증을 마친 뒤 실행 전까지도 상태가 바뀔 수 있으므로, 개정 성공과 실행 허용은 별개 판정이다. B2와 SR은 갱신 이후 최종 상태, 실행 검사를 거친다. 변경 탐지 시점, 갱신에 쓴 스냅샷, 최종 검사 시점이 결과 기록에 함께 남는지는 확인이 남아 있다.


## 제품 승인 흐름과 연구 모듈의 관계


제품 콘솔의 흐름은 AI 분석, 조정안, 운영자 승인, 시뮬레이터 반영, 회복 확인으로 이어진다. 승인과 구조화된 실행 요청이 제어 경계를 이루며, 생성된 자연어 자체를 장치 명령으로 취급하지 않는다. 연구 모듈의 선택적 개정 실험은 이 제품 서비스와 분리되어 있다.


연구 엔진의 조건 통과와 제품 전체 제어, 실농장 운영의 검증은 단계별로 나누어 수행해야 한다. [제품 구조](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/docs/architecture.md)


## 재사용 시 확인할 조건


다른 상태 기반 서비스에 적용한다면 답변 단위, 상태 의존성, 최종 검사를 나누는 구조를 먼저 검토하게 된다. 그에 앞서 의존성 누락 시 동작, 상태가 연속으로 바뀌는 경우의 처리, 실제 LLM을 붙였을 때 문맥 유지 여부를 확인할 항목으로 남겨 둔다. 일부 단위만 고친 뒤 나머지 단위와 모순이 생기는지도 별도 확인 대상이다.


다음 글에서는 영상 검색 결과를 답변의 근거로 사용하는 과정을 살펴본다. 영상이 검색되었는지와 그 영상만으로 질문에 답할 수 있는지를 나누어 확인하는 내용이다.


## 함께 읽을 내용


상태 버전과 실제 측정 시각을 구분한 뒤 어떤 답변이 영향을 받는지 따라간다.


먼저 읽을 글: [동시 요청과 상태 변경 처리](https://blog.namuori.net/posts/tech-k10/), [답변의 상태 의존성과 재검증 범위](https://blog.namuori.net/posts/tech-s10/)


이어 읽을 글: [SmartFarm 조정안의 승인과 실행 기록](https://blog.namuori.net/posts/tech-03-02/)


## 참고

- [실험 조건 정의](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/contracts.py): 조건, 장벽, 실패 코드, 데이터 타입 (저장소 접근 권한 필요)
- [답변과 상태의 의존성 관리](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/dependency.py): 의존성 레지스트리, 영향 단위 계산 (저장소 접근 권한 필요)
- [재검증 실험 실행 코드](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/engine.py): 실험 엔진, 장벽 주입, 실행 흐름 (저장소 접근 권한 필요)

---


이전 글, [aerospace-rag의 검색 결과 결합과 가중치 조정](https://blog.namuori.net/posts/aerospace-rag-weighted-rrf/)


다음 글, [MV-EviRAG의 영상 선택과 답변 판단 과정](https://blog.namuori.net/posts/mvevirag-evidence-risk-control/)


## 작업을 정리하며


변경된 값과 답변의 의존 관계를 남겨 두면 재검토할 범위를 구체적으로 설명할 수 있다. 여기서 얻는 구조적 비용 지표를 실제 모델의 시간, 토큰 비용과 연결하는 것이 후속 평가 과제다. 선택 범위와 검증 기준을 같은 기록으로 남기는 방향이 유용하다고 본다.
