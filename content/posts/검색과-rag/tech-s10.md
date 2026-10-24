---
title: "답변의 상태 의존성과 재검증 범위"
date: 2026-09-08
draft: false
slug: "tech-s10"
categories:
  - "검색과 RAG"
tags:
  - "workflow"
summary: "답변이 의존한 값과 판단 경계를 작은 상태 변경 예제로 정리했다. 온도를 근거로 만든 답변이라도 이후 바뀐 값이 판단에 쓰였는지에 따라 재검토 범위가 달라진다. 모든 변화를 문장의 오류로 처리하기보다 영향받은 부분을 고르는 조건을 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dcdcd44-779f-81dc-99da-e016fea006b6"
generated_by: "notion"
---
## 답변 생성 시점의 상태


답변이 의존한 값과 판단 경계를 작은 상태 변경 예제로 정리했다. 온도를 근거로 만든 답변이라도 이후 바뀐 값이 판단에 쓰였는지에 따라 재검토 범위가 달라진다. 모든 변화를 문장의 오류로 처리하기보다 영향받은 부분을 고르는 조건을 살펴봤다.


이 판단을 자동화하려면 두 가지를 기록해야 한다. 답변이 어떤 상태값에 의존하는지, 그 상태값이 답변 생성 이후에 바뀌었는지. 이 기록이 없으면 선택적으로 갱신할 근거가 부족해진다. 전체를 다시 만들거나, 최신 상태를 다시 읽고 보수적으로 보류하는 방법도 있지만 각각 지연과 응답 범위의 부담이 있다.


smartfarm 저장소의 `research/state-revalidation` 모듈에서 이 구분이 구체적으로 구현된 것을 확인했다. 이 모듈은 논문 전용 실험 구현으로 제품 런타임과 완전히 분리되어 있으며, 결정론적 생성기를 사용해 구조적 검증만 수행한다.


실제 LLM 품질이나 현장 센서를 다루지 않는다([README](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/README.md), 저장소 접근 권한 필요).


## 물리적 시각과 상태 버전


상태 재검증 실행에서 상태를 읽는 부분을 보면, `StateSnapshot`이 `revision`과 `observed_at` 두 필드를 함께 가진다. `observed_at`은 "14시 32분에 읽었다"라는 물리적 시각이고, `revision`은 상태가 몇 번째 변경인지를 나타내는 정수다.


시각과 revision은 다른 정보를 담는다. 같은 1초 안에 값이 두 번 바뀌면 시각만으로 변경을 구분하기 어려울 수 있다. 반대로 10분이 지나도 상태가 바뀌지 않으면 revision은 그대로다.


revision은 변경의 순서를 추적하는 단서이고, 답변에 영향을 주는지는 관련 값과 허용 오차, 경계 조건을 함께 확인해야 한다. 값이 그대로여도 너무 오래된 관측은 사용할 수 없을 수 있으므로 관측 시각의 신선도 검사는 별도 문제다.


`InMemoryStateStore`의 `apply_patch`에서 이 관계가 명확하게 드러난다.


```python
# engine.py — InMemoryStateStore.apply_patch (요약)
values = dict(self._state.values)
values.update(patch.values)
for key in patch.remove_keys:
    values.pop(key, None)
self._state = StateSnapshot(
    revision=self._state.revision + patch.revision_delta,
    values=values,
    observed_at=patch.observed_at or datetime.now(timezone.utc),
)
```


패치를 적용할 때마다 `revision`이 `revision_delta`만큼 증가한다. 물리적 시각은 패치에 명시되어 있으면 그 값을, 아니면 현재 시각을 사용한다. 두 축이 독립적으로 기록되기 때문에 "같은 시각, 다른 revision"이나 "다른 시각, 같은 revision" 모두 표현할 수 있다.


## 의존성 선언과 갱신 범위


상태 재검증 실행에는 `RelatedStateSpec`이라는 구조가 파라미터로 전달된다. 답변을 구성하는 개별 단위(answer unit)가 어떤 상태 키에 의존하는지를 응답 생성 전에 미리 선언하는 역할이다.


손으로 계산할 수 있는 예를 들면 이렇다. 관측값이 `root_temp`, `water_ec`, `humidity` 세 개이고, 답변 단위가 A("근권 상태 요약")와 B("관수 권고") 두 개라고 하자.

- A는 `root_temp`와 `water_ec`에 의존
- B는 `water_ec`와 `humidity`에 의존

`water_ec`가 바뀌면 A와 B 모두 재검토 대상이 된다. `root_temp`만 바뀌면 A가 재검토 대상이 되고 B는 이 선언 기준에서 유지된다. `humidity`만 바뀌면 B만 영향을 받는다.


이 예제는 사전에 선언한 의존성에 따라 관련 변화가 판정된 경우다. 실제 관련 키가 선언에서 빠지면 필요한 갱신도 누락될 수 있다. 단위 선택 결과와 의존성 선언의 정확성을 각각 확인 대상으로 두었다.


답변과 상태의 의존성 관리의 `affected_unit_ids` 함수는 `RelatedStateSpec`과 `StateDiff`를 받아 영향받은 단위의 ID 목록을 반환한다.


![S10-01.png](/images/notion/tech-s10/image-1.png)


그림 1. 상태 키와 답변 단위 사이의 의존성 예시. water_ec가 변경되면 의존하는 A, B 모두 재검토 대상이 된다. 실제 의존성은 RelatedStateSpec으로 선언한다. 출처: 사전 의존성 구조를 본문의 두 단위 예제로 직접 구성.


## 해시가 달라진 것과 의미 있는 변화


관련 상태 비교를 읽으면 서로 다른 역할의 두 함수가 보인다. `fingerprint`는 선언된 상태 값과 단위를 정규화해 SHA-256 요약값을 만든다. `compare_related`는 각 키의 값이 사라졌는지, 허용 오차를 넘었는지, 정해 둔 경계를 넘었는지 검사한다. revision과 observed_at 자체는 이 fingerprint의 입력에 포함되지 않는다.


예를 들어 온도 허용 오차가 0.5이고 판단 경계가 28이라고 하자. 27.0→27.2는 직렬화된 값이 달라져 해시가 달라질 수 있어도, 허용 오차 안이고 경계도 넘지 않았으므로 관련 변화 목록에 들어가지 않는다. 반면 27.9→28.1은 차이가 0.2여도 경계를 넘었으므로 변화로 잡힌다. 코드 조건을 설명하기 위해 구성한 수치다.


구현에서는 해시를 상태 추적의 요약으로 사용하고, 영향받은 답변 단위는 `StateDiff.changes`와 사전 의존성으로 고른다. 해시 차이만을 답변 무효화 조건으로 설명하면 이 비교 과정을 놓친다.


해시를 계산할 때도 관련 값을 읽고 직렬화하므로 그 비용을 전체 비교 비용에 포함해야 한다. SHA-256에는 이론적으로 충돌 가능성이 있으며, 입력 규약과 충돌 위험을 고려해 사용한다.


코드: [관련 상태 비교](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/fingerprint.py), [답변과 상태의 의존성 관리](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/dependency.py). 저장소 접근 권한이 필요하다.


## 변경을 감지한 뒤의 네 가지 대응


변화 이후의 대응은 `RevalidationPolicy`에 정의된 네 가지 조건으로 비교했다.


**B0**은 재검증 없이 응답을 그대로 보낸다. 가장 단순하지만 상태 변경을 완전히 무시한다. **B1**은 변경이 감지되면 응답은 전달하되 행동 후보(action_candidate)를 차단한다.


답변을 다시 생성하지 않고, 선언된 관련 변화와 실행 전제 조건에 따라 행동을 막는 비교 조건이다. 판별 범위는 기록한 조건과 검사 규칙에 한정된다. **B2**는 응답을 한 번 새로 만들고, 다시 상태를 읽어 여전히 바뀌었으면 행동을 차단한다. 갱신 예산이 1회로 고정되어 있다.


**SR**은 B2와 갱신 예산은 같지만 전체가 아닌 영향받은 답변 단위만 재생성한다. `affected_unit_ids`로 특정된 단위만 갱신하고 나머지는 이전 응답에서 보존한다.


이 모듈의 README에 따르면 확인적 실험(confirmatory run)의 동결 시나리오에서 B2와의 쌍별 정확성 차이가 모두 0이었고, 답변 단위 생성 횟수의 차이는 감소 방향이었다고 기록돼 있다. 저장된 결과 묶음과 통계 처리 경로를 읽은 범위에서 정리했다. 생성 횟수는 결정론적 하니스의 구조적 비용 지표다. 실제 LLM 토큰 비용은 별도 계측이 필요하다.


![S10-02.png](/images/notion/tech-s10/image-2.png)


그림 2. 관련 변화와 답변 단위의 의존성을 연결한 설명용 흐름. revision 차이만으로 갱신을 결정하지 않는다. 갱신 예산과 실패 처리는 실제 엔진에서 별도로 적용한다. 출처: 관련 상태 비교, 답변과 상태의 의존성 관리, 상태 재검증 실행을 바탕으로 직접 구성.


## 추가 확인 항목


여기까지는 전달 전 답변을 재검증하는 읽기 경로였다. 행동 후보가 승인과 실행으로 이어지는 경우에는 그 사이의 상태 변경도 남는다. 제안, 승인, 결과 확인 시점의 상태를 따로 기록하는 흐름을 다음 내용으로 연결했다.


---


**참고**

- [state-revalidation README](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/README.md) (저장소 접근 권한 필요): 실험 범위와 확인적 실행 결과
- [state-revalidation 상태 재검증 실행](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/engine.py) (저장소 접근 권한 필요): StateCapture, fingerprint, 재검증 정책 구현
- [갱신 예산과 실행 조건 정의](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/research/state-revalidation/src/smartfarm_state_revalidation/policies.py) (저장소 접근 권한 필요): 갱신 예산과 실행 전제 조건

## 함께 읽기


먼저 읽을 글: [동시 요청과 상태 변경 처리](https://blog.namuori.net/posts/tech-k10/)


이어 읽을 글: [SmartFarm 상태 변경과 답변 재검증](https://blog.namuori.net/posts/smartfarm-state-revalidation/)


먼저 알아둘 내용: 센서 데이터의 시각, 단위, 결측값 정리: 원고, 그림 작성 완료, Notion 연결 준비 중
