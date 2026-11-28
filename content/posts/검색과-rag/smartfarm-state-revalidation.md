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
summary: "센서나 장치 상태가 바뀔 때 답변 전체를 다시 만드는 방식과 바뀐 값과 관련된 부분만 골라 고치는 방식을 실험 코드로 비교한다. 상태가 달라진 뒤 답변을 어디까지 다시 만들고 어떻게 최종 실행 가능 여부를 검사하는지 알 수 있다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-81d5-bf36-c289432b4f6b"
generated_by: "notion"
---
스마트팜처럼 온도 센서나 급수 장치 상태가 수시로 바뀌는 환경에서는 AI가 답변을 만든 뒤 실제 조치를 하기 전에 상태가 달라질 수 있다. 상태가 바뀐 뒤 기존 답변이 여전히 유효한지 다시 확인하는 과정을 상태 **재검증**(revalidation)이라 한다. 이때 답변 전체를 처음부터 다시 만들면 처리 절차는 단순하지만 바뀌지 않은 설명까지 모두 새로 생성해야 한다. 반대로 바뀐 값과 관련된 부분만 골라 고치는 **선택적 개정**(selective revision)을 쓰면 다시 만드는 범위는 줄어든다. 다만 어떤 답변 단위가 어떤 상태 값과 연결되는지 미리 정해 두어야 하며, 이 연결을 빠뜨리면 꼭 고쳐야 할 내용이 누락된다.


`smartfarm-rag-ops` 저장소의 상태 재검증 연구 모듈은 이 두 경로를 비교하려고 구성한 실험 틀인 연구 하네스다. 코드 패키지 이름은 `smartfarm_state_revalidation`이며 같은 입력에 늘 같은 결과를 내는 결정론적 방식으로 동작한다. 이 글에서는 상태 값이 바뀌었을 때 답변을 어디까지 다시 만들고 어떤 절차로 최종 실행 가능 여부를 검사하는지 코드 구조를 따라가며 확인한다.


## 네 가지 재검증 비교 조건


앞선 두 갱신 경로를 비교하기 위해 [실험 조건 정의](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/contracts.py) 파일의 `Condition` 열거형은 상태 변경에 대응하는 방식을 네 가지 조건으로 나눈다. 첫째 조건인 B0(one-shot)는 상태 재검증 없이 처음에 답변을 한 번만 생성한다. 둘째 조건인 B1(block)은 답변과 관련된 상태가 바뀌면 뒤이은 후속 실행을 바로 차단한다. 셋째 조건인 B2(refresh-once)는 답변 전체를 한 번 다시 생성한 뒤 최종 상태와 실행 검사를 수행한다. 마지막 조건인 SR(selective-revision)은 상태 변경에 영향받는 답변 단위만 다시 생성한 뒤 B2와 같은 최종 검사를 수행한다.


![초기 답변 생성 후 상태 변경이 발생했을 때 B0, B1, B2, SR 네 조건으로 분기하고 B2와 SR이 최종 상태 검사로 이어지는 흐름도](/images/notion/smartfarm-state-revalidation/image-1.png)


그림 1. 상태 변경 발생 이후 네 가지 실험 조건(B0, B1, B2, SR)의 처리 경로 비교.


같은 파일의 `Barrier` 열거형에는 실행 도중 상태 변경이나 검사가 일어나는 기준점인 12개의 **장벽**(barrier) 시점이 정의되어 있다. 각 장벽 시점에서 발생할 수 있는 실패 유형은 `FailureCode`에 따로 정리되어 있다. 실험 명세와 주요 결과 객체는 실행 도중 필드에 다른 값이 다시 할당되지 않도록 `frozen` 데이터클래스로 선언되어 있다. 다만 데이터클래스 자체를 `frozen`으로 두더라도 내부에 중첩된 객체의 변경 가능성은 해당 객체의 타입과 사용 방식에 따라 달라지므로 따로 확인해야 한다.


## 상태 의존성 선언과 개정 대상 계산


네 가지 조건 가운데 SR 경로는 각 답변 단위와 상태 값 사이의 **의존성**(dependency)을 바탕으로 고칠 범위를 정한다. 이때 모델이 출력한 텍스트를 사후에 읽고 어떤 센서 값과 관련 있는지 거꾸로 추정하지 않는다. 대신 답변을 생성하기 전에 어떤 답변 단위가 어떤 상태 값을 참조하는지 미리 선언해 두는 방식을 쓴다.


[답변과 상태의 의존성 관리](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/dependency.py) 파일의 `DependencyRegistry`는 이처럼 사전 선언된 의존성 프로파일만 등록받는다. 보조 함수인 `declare_answer_units()`는 전체 답변을 나눈 답변 단위 명세를 만든다. 이어서 `declare_related_state()`로 각 단위가 참조하는 상태 의존성 프로파일을 정의해 레지스트리에 넣는다. 상태가 바뀐 뒤 호출되는 `affected_unit_ids(spec, diff)` 함수는 선언된 명세(`spec`)와 상태 차이(`StateDiff`)만 대조한다. 이 함수는 생성된 텍스트를 전혀 참조하지 않고 모델 출력에서 의존성을 역으로 추론하지도 않은 채 영향받는 답변 단위 ID 목록을 반환한다.


![DependencyRegistry에 등록된 명세와 StateDiff를 입력받아 affected_unit_ids 함수가 생성된 텍스트를 참조하지 않고 재생성 대상 ID를 반환하는 구조도](/images/notion/smartfarm-state-revalidation/image-2.png)


그림 2. 사전 선언된 의존성 프로파일과 StateDiff를 대조해 재생성 대상 답변 단위를 계산하는 흐름.


따라서 가능한 의존 관계는 프로파일 선언 시점에 고정되지만, 실제로 다시 생성할 단위는 실행 중 발생한 상태 변경(`StateDiff`)에 따라 매번 달라진다. 프로파일에 답변 단위가 따로 선언되지 않은 조건에서는 상태 키 하나당 답변 단위 하나를 두는 예비 방식인 폴백(fallback)으로 동작한다. 초기 확인 실험(v1)의 조건들이 이 폴백 경로를 타도록 되어 있어 기존 동작과 호환된다.


## 답변 단위별 선택적 개정과 전제 조건


앞 절의 의존성 대조 방식이 재생성 범위를 어떻게 좁히는지 보려면 답변을 세 단위로 나눈 가상 시나리오를 예로 들 수 있다. 이 시나리오에서 전체 답변은 환경 요약(U1), 급수 제안(U2), 장치 상태(U3)의 세 단위로 구성된다. 답변 생성 전에 U1은 온도와 습도, U2는 수분 상태와 가용 자원, U3는 장치 상태에 의존한다고 미리 선언해 둔다. 초기 답변을 만든 뒤 장치 상태만 바뀌었다면 전체를 다시 만드는 B2는 U1과 U2까지 모두 새로 생성한다. 반면 SR은 선언된 의존 관계에 따라 변경된 장치 상태에 의존하는 U3만 다시 생성하고 U1과 U2는 그대로 유지한다.


![온도와 습도에 의존하는 U1, 수분과 가용 자원에 의존하는 U2는 유지되고, 변경된 장치 상태에 의존하는 U3만 재생성되는 대응 관계도](/images/notion/smartfarm-state-revalidation/image-3.png)


그림 3. 답변 단위를 U1, U2, U3로 나눈 가상 시나리오에서 장치 상태만 변경되었을 때 U3만 재생성되는 과정.


이 가상 시나리오는 일부 단위만 골라 고치는 선택적 개정이 성립하기 위한 전제 조건도 함께 보여 준다. 만약 장치 상태가 바뀌었을 때 급수 가능 여부까지 달라진다면 급수 제안을 담는 U2에도 장치 상태 의존성이 함께 선언되어 있어야 한다. 선언이 빠지면 SR은 갱신이 필요한 U2를 수정 대상에서 제외하고 기존 내용을 그대로 남겨 둔다. 따라서 일부 단위만 고치는 경로를 쓸 때는 의존 관계가 누락되지 않았는지 먼저 점검해야 한다.


## 상태 변경 주입과 재검증 실행 흐름


선언된 의존성을 바탕으로 네 가지 조건의 실험 전체를 돌리는 역할은 [재검증 실험 실행 코드](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/engine.py)의 `ExperimentEngine`이 맡는다. 코드에서 `RevalidationEngine`은 `ExperimentEngine`을 가리키는 별칭으로 정의되어 있다. 상태를 읽고 바꾸는 인터페이스는 공통 동작 규약인 `StateReader`, `StateMutator`, `BarrierInjector` 프로토콜로 추상화되어 있다. 실제 실험에서는 메모리 기반 저장소인 `InMemoryStateStore`가 상태를 보관한다. 여기에 연결된 `BarrierPatchInjector`는 지정된 장벽 시점에 상태 변경을 주입한다.


`ExperimentEngine.run()` 메서드는 먼저 특정 시점의 상태 값을 그대로 기록한 초기 상태 **스냅샷**(snapshot)을 확보한다. 그다음 초기 답변을 생성하고 장벽 시점에 상태 변경을 주입한 뒤 실험 조건(B0, B1, B2, SR)에 따라 경로를 분기한다. 조건에 따른 재검증과 답변 개정 단계에서 SR 경로는 `affected_unit_ids()`가 반환한 단위만 다시 생성한다. 마지막으로 최종 상태 및 실행 검사를 마친 뒤 실험 결과 객체인 `RunResult`를 반환한다.


![상태 스냅샷, 초기 생성, 상태 변경 주입, 재검증 및 개정, 최종 검사를 거쳐 RunResult를 반환하는 실험 엔진 실행 파이프라인](/images/notion/smartfarm-state-revalidation/image-4.png)


그림 4. `ExperimentEngine.run()`의 단계별 실행 흐름과 상태 저장소 및 장벽 주입기의 연결 구조.


여기서 답변 개정 단계와 최종 검사 단계를 분리한 이유는 재검증을 마친 뒤 실제 실행 직전까지도 상태가 다시 바뀔 수 있기 때문이다. 답변 단위를 성공적으로 고쳤더라도 그사이에 또 다른 변경이 일어났다면 실행을 허용해서는 안 된다. 그래서 B2와 SR은 답변을 갱신한 뒤에도 최종 상태와 실행 검사를 한 번 더 거친다. 다만 변경을 탐지한 시점과 갱신에 사용한 스냅샷, 최종 검사 시점의 상태가 결과 기록(`RunResult`)에 모두 구분되어 남는지는 추가로 확인할 부분이다.


## 단위 생성 횟수와 측정 한계


앞 절의 `ExperimentEngine`이 돌아가는 연구 모듈은 제품 런타임을 임포트하거나 호스트 포트를 열지 않는 독립된 실험 환경이다. 시나리오 값도 통제된 입력을 쓰며, 결정론적 생성기를 사용해 답변 생성 이후의 재검증 절차와 자동 판정 기준(오라클)이 의도대로 돌아가는지 검증한다.


따라서 이 모듈의 실험 결과에 나오는 `unit_generation_count`는 결정론적 하네스에서 생성한 답변 단위 수를 뜻한다. 이 기록만으로 자연어 품질이나 실제 거대언어모델(LLM)의 토큰 비용, 실제 농장 장비의 제어 결과까지 측정했다고 볼 수는 없다. 또한 `unit_generation_count`가 줄더라도 실제 LLM을 연결했을 때 입력 토큰, 출력 토큰, 응답 지연, 호출 비용이 같은 비율로 준다고 단정하기 어렵다. 실제 언어 모델에서는 일부 문단만 다시 쓰더라도 앞뒤 문맥을 맞추기 위해 전체 지시문(프롬프트)과 기존 답변 문맥을 다시 입력해야 할 수 있기 때문이다.


## 제품 승인 흐름과 연구 모듈의 분리


측정 지표의 범위와 더불어 이 연구 모듈이 실제 제품 화면(콘솔)의 승인 및 실행 흐름과 분리되어 있다는 점도 함께 보아야 한다. [제품 구조](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/docs/architecture.md) 문서에 정의된 제품 콘솔의 운영 흐름은 AI 분석, 조정안 제시, 운영자 승인, 시뮬레이터 반영, 회복 확인 순서로 이어진다. 제품 환경에서는 생성된 자연어 답변 자체를 장치 제어 명령으로 바로 쓰지 않고 운영자 승인과 구조화된 실행 요청을 제어 경계로 둔다.


![독립 연구 모듈의 4단계 재검증 흐름과 제품 콘솔의 조정안, 운영자 승인, MCP 실행, 회복 관측 흐름을 위아래로 나란히 비교한 구조도](/images/notion/smartfarm-state-revalidation/image-5.png)


그림 5. 상태 재검증 연구 모듈과 제품 콘솔의 승인 및 실행 흐름 비교. 두 구현은 분리되어 있으며 제품 콘솔의 실행 대상은 시뮬레이터다.


상태 재검증 연구 모듈은 이 제품 콘솔 서비스와 분리되어 있으며, 제품 콘솔의 실행 대상 역시 실제 농장 설비가 아니라 가상 환경인 시뮬레이터다. 따라서 연구 엔진의 재검증 조건 통과와 제품 콘솔의 승인 및 제어 흐름 검증, 실제 농장 운영 환경에서의 검증은 각각 별도 단계로 나누어 다루어야 한다.


## 결론


답변 단위와 상태 값의 의존 관계를 미리 선언해 두면 상태가 바뀌었을 때 영향받은 부분만 다시 생성하고 재검토 범위를 명확히 설명할 수 있다. 이 연구 모듈은 생성된 문장을 참조하지 않고 선언된 명세와 상태 차이(`StateDiff`)만 대조해 개정 대상을 고른다. 이어서 답변 단위를 고친 뒤에도 실행 직전의 추가 변경을 막기 위해 최종 상태와 실행 검사를 한 번 더 수행한다.


반면 탐지 시점과 갱신 스냅샷, 최종 검사 상태가 `RunResult`에 구분되어 남는지와 실제 LLM의 응답 시간 및 토큰 비용 절감은 아직 확인하지 않았다. 의존성 선언 누락 시의 안전장치, 재검증 도중 상태가 연속으로 바뀔 때의 처리 방식, 기존 단위와 재생성 단위의 문맥 모순 여부도 추가로 검증해야 한다. 다음 글에서는 영상 검색 결과를 답변 근거로 쓸 때 관련 영상이 검색되었는지와 찾은 영상만으로 질문에 답할 수 있는지를 나누어 판단하는 과정을 다룬다.


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
