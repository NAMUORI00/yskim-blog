---
title: "제안, 승인, 실행 결과의 상태 관리"
date: 2026-09-08
draft: false
slug: "tech-s11"
categories:
  - "웹과 백엔드"
tags:
  - "workflow"
summary: "제안, 승인, 실행, 결과 확인을 별도 상태로 기록하는 흐름을 정리했다. 설명용으로 냉각 출력을 70%로 올리는 조정안을 두었다. 운영자가 허용한 상태, 명령이 적용된 상태, 이후 온도 변화가 확인된 상태를 각각 나누어 읽었다."
cover: ""
canonical: ""
comments: false
notion_id: "3dcdcd44-779f-819b-b06c-cf2af046d772"
generated_by: "notion"
---
## 승인, 실행, 결과 확인의 기록


제안, 승인, 실행, 결과 확인을 별도 상태로 기록하는 흐름을 정리했다. 설명용으로 냉각 출력을 70%로 올리는 조정안을 두었다. 운영자가 허용한 상태, 명령이 적용된 상태, 이후 온도 변화가 확인된 상태를 각각 나누어 읽었다.


이 구분으로 승인 뒤 실행되지 않은 경우와 실행 뒤 효과가 확인되지 않은 경우를 따로 표현할 수 있다. 각 기록이 어느 단계의 결과를 담는지에 초점을 맞췄다.


이 구분을 두 저장소의 코드에서 확인했다. smartfarm의 FarmOps MCP 서비스에서 장치 제어 흐름을, cross-review-bridge에서 코드 리뷰 승인 흐름을 읽었다. 별도 맥락에 놓인 두 저장소의 상태 구분을 비교한다. FarmOps에서는 시뮬레이터 경로의 실행 결과를 확인 대상으로 삼았다.


## 장치 제어에서의 상태 분리: FarmOps MCP


smartfarm 저장소의 FarmOps MCP는 장치 조정안을 관리하는 내부 서비스다. `ControlProposal`이라는 자료형이 조정안 하나의 전체 생명주기를 담는다. API를 보면 각 단계가 별도 엔드포인트로 분리되어 있다.


```python
# services/farm-mcp/app/main.py (엔드포인트 요약)
@app.post("/v1/control/proposals")          # 조정안 생성
def propose_control(...): ...

@app.post("/v1/control/proposals/{id}/approve")  # 승인
async def approve_control(...): ...

@app.post("/v1/control/proposals/{id}/reject")   # 거부
def reject_control(...): ...
```


생성과 승인이 별도 호출이라는 것은 곧 두 호출 사이에 시간이 흐른다는 뜻이다. 그 사이에 센서 상태가 바뀔 수 있고, 다른 조정안이 먼저 실행될 수도 있다.


각 호출마다 감사 이벤트(`AuditEvent`)가 기록되므로, 어떤 시점에 어떤 행위자가 어떤 결정을 했는지를 사후에 추적할 수 있다([코드: 제안과 승인 요청 처리](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/services/farm-mcp/app/main.py), 저장소 접근 권한 필요).


프론트엔드 타입 정의에서 이 구분이 더 명확하게 드러난다. `ApiProposal`은 세 가지 독립된 상태 필드를 가진다.


```typescript
// apps/web/src/api.ts — ApiProposal (필드 요약)
status: 'pending_approval' | 'approved' | 'rejected' | 'failed'
execution: {
  status: 'not_executed' | 'applied_to_simulator' | 'failed'
  executed_at?: string | null
}
verification?: {
  status?: 'verified' | 'mismatch' | 'unavailable'
  outcome?: 'device_applied' | 'recovery_pending' | 'resolved' | 'unrecovered'
} | null
```


`status`는 승인 여부, `execution.status`는 시뮬레이터 적용 여부, `verification`은 적용 상태나 회복 확인 결과를 담는다. 검증 필드가 존재한다는 사실만으로 실제 환경의 개선을 측정했다고 볼 수는 없다.


세 필드가 독립적이기 때문에 "승인됨 + 실행 안 됨 + 검증 없음"이나 "승인됨 + 실행됨 + 미복귀" 같은 조합이 가능하다. 하나의 enum으로 이 조합을 모두 표현하려면 서로 다른 단계의 조합을 일일이 나열해야 한다.


![S11-01.png](/images/notion/tech-s11/image-1.png)


그림 1. 승인, 시뮬레이터 적용, 회복 확인을 분리한 설명용 도식. 주요 상태와 전이를 중심으로 요약한 개념도다. 출처: ControlProposal과 ApiProposal의 역할을 바탕으로 직접 구성.


## 승인 전 상태 변경 처리


상태 변경 예제로 “근권 온도 28°C”를 근거로 조정안을 만들고, 운영자가 확인하는 동안 온도가 정상 범위로 돌아오는 경우를 두었다.


smartfarm 아키텍처 문서에 따르면 장치 조정 요청은 활성 경보와 조정 방향이 일치해야 실행안으로 만들어진다. 장애 해결 요청인데 해당 경보가 이미 해소되었거나 반대 방향의 조정이라면 실행안을 생성하지 않는다. 모호한 요청도 마찬가지로 차단된다.


상태 재검증은 여기서도 필요한 질문이지만, 논문용 재검증 모듈이 제품 승인 경로에 그대로 연결됐다고 보지는 않았다. 확인한 FarmOps `approve_control`은 행위자 역할과 제안 상태를 검사하고, 이미 실행 결과가 있으면 그것을 반환한다. 승인 후에는 별도 실행 경로를 호출한다.


응답이 유실됐을 때를 위한 `_execute_with_reconciliation`은 제한된 재요청을 수행한다. `_validate_execution`은 돌아온 결과의 제안 ID, 농장, 행동, 구역, 상관 ID가 승인한 내용과 맞는지 검사하고, `simulated_only`와 실행 ID도 확인한다. 상관 ID를 실행 결과와 대조하고 중복 요청을 처리하는 규칙이 필요하다.


기존 실행 기록과 대상 서비스의 제안별 처리까지 함께 봐야 한다. [서비스 코드](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/services/farm-mcp/app/service.py), 저장소 접근 권한 필요.


## 실행 성공과 문제 회복 확인


설명용 흐름에서 시뮬레이터가 냉각 출력을 70%로 바꾼 상태를 다음 단계로 놓았다. 명령의 적용과 이후 회복 관측은 여기서도 나누어 기록할 대상이다.


프론트엔드 타입에는 `device_applied`, `device_pending`, `recovery_pending`, `resolved`, `unrecovered`, `mismatch`, `unavailable` 같은 결과가 구분돼 있다.


이 값들은 적용 확인과 회복 판단을 나눠 표시할 수 있게 한다. 다만 타입 선언만으로 각 전환이 실제로 발생했다거나 특정 시간 안에 반드시 회복된다고 말할 수는 없다.


목표 상태의 변경과 이후 관측의 회복은 서로 다른 결과다. “검증 불가”는 판단할 관측이 없는 경우로, “회복하지 못함”은 관측했지만 회복 조건을 충족하지 않은 경우로 나누어 읽었다. 실제 상태 전이와의 대조는 추가 확인 범위로 남았다.


## 코드 리뷰 승인에서의 같은 구조


cross-review-bridge는 Codex Desktop용 코드 리뷰 플러그인이다. 로컬에서 만든 리뷰 요약을 외부 리뷰어(ChatGPT 웹)에게 보내기 전에 반드시 사용자 승인을 거치도록 설계되어 있다([리뷰 작업 지침](https://github.com/NAMUORI00/cross-review-bridge/blob/e0e20ea26d0c8eeb67fd3bffcf6d0422d97a2ef6/skills/cross-review-bridge/SKILL.md)).


워크플로를 읽으면 장치 제어와 같은 단계 구분이 나타난다.

1. **로컬 컨텍스트 수집**: 프로젝트 상태를 읽어 리뷰 요약을 만든다 (제안 생성에 해당)
2. **전송 승인**: 전송할 내용과 목적지를 요약하고 사용자에게 승인을 요청한다 (승인 게이트)
3. **외부 제출**: 승인된 내용을 브라우저를 통해 전송하고 응답을 수신한다 (실행)
4. **피드백 분류**: 외부 응답을 `apply`, `consider`, `reject`, `needs user decision`으로 분류한다 (결과 확인)

외부 피드백을 무조건 적용하지 않는다는 원칙이 명시되어 있다. `external-feedback-integrator` 스킬에서 "외부 피드백은 advisory이며, 로컬 파일과 테스트에 대조한 뒤 검증된 항목만 반영한다"고 기술한다([external-feedback-integrator 리뷰 작업 지침](https://github.com/NAMUORI00/cross-review-bridge/blob/e0e20ea26d0c8eeb67fd3bffcf6d0422d97a2ef6/skills/external-feedback-integrator/SKILL.md)).


두 흐름에서 실행 결과를 별도로 검토한다는 공통점을 읽었다. 장치 명령 이후의 회복 확인과 외부 리뷰 의견의 검증은 대상과 판단 기준이 서로 다르다.


![S11-02.png](/images/notion/tech-s11/image-2.png)


그림 2. 제안-승인-실행-검증의 공통 흐름을 나타낸 설명 도식. 장치 제어(smartfarm MCP)와 코드 리뷰(cross-review-bridge)에서 읽을 수 있는 승인, 실행, 검토 역할을 비교했다. 두 저장소의 문서와 코드에서 읽은 역할을 비교한 그림이다. 출처: FarmOps 코드와 cross-review-bridge 작업 지침을 바탕으로 직접 구성.


## 추가 확인 항목


이번 비교는 단일 조정안과 리뷰 요청의 생명주기까지다. 이전 조정안이 끝나기 전에 같은 장치의 새 조정안이 들어오는 경우는 후속 범위로 남겼다. 여러 제안의 순서와 충돌을 상태 기록에 어떻게 반영할지 이어서 살펴볼 수 있다.


---


**참고**

- [cross-review-bridge 리뷰 작업 지침](https://github.com/NAMUORI00/cross-review-bridge/blob/e0e20ea26d0c8eeb67fd3bffcf6d0422d97a2ef6/skills/cross-review-bridge/SKILL.md): 브라우저 기반 리뷰 승인 워크플로
- [external-feedback-integrator 리뷰 작업 지침](https://github.com/NAMUORI00/cross-review-bridge/blob/e0e20ea26d0c8eeb67fd3bffcf6d0422d97a2ef6/skills/external-feedback-integrator/SKILL.md): 외부 피드백 분류 및 적용 정책
- [smartfarm FarmOps MCP 제안과 승인 요청 처리](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/services/farm-mcp/app/main.py) (저장소 접근 권한 필요): 제안, 승인, 감사 API
- [smartfarm 아키텍처 문서](https://github.com/NAMUORI00/smartfarm-rag-ops/blob/426cbe5e0dbc9e62d65ed4fdd5ae58e302d1dd8e/docs/architecture.md) (저장소 접근 권한 필요): 제어 경계와 검증 흐름

## 함께 읽기


먼저 읽을 글: [동시 요청과 상태 변경 처리](https://blog.namuori.net/posts/tech-k10/), [HTTP 요청과 응답, 인증과 인가 정리](https://blog.namuori.net/posts/tech-k24/)


이어 읽을 글: [SmartFarm 조정안의 승인과 실행 기록](https://blog.namuori.net/posts/tech-03-02/), [외부 리뷰 자료 준비와 변경 검토 과정](https://blog.namuori.net/posts/tech-07-04/)
