---
title: "측정 조건과 연구 주장 정리"
date: 2026-08-26
draft: false
slug: "tech-s14"
categories:
  - "연구와 논문 기록"
tags:
  - "workflow"
summary: "MedEdge, MV-EviRAG, MultiAgentBiasModerator의 기록에서 측정 조건과 연구 주장의 연결을 정리했다. 기준선, 입력, 측정 구간을 함께 읽으며 결과 차이를 어디까지 해석할 수 있는지 살펴봤다. MV-EviRAG 소스에는 저장소 접근 권한이 필요하다."
cover: ""
canonical: ""
comments: false
notion_id: "3dcdcd44-779f-8150-8dee-e03a1b506b7c"
generated_by: "notion"
---
MedEdge, MV-EviRAG, MultiAgentBiasModerator의 기록에서 측정 조건과 연구 주장의 연결을 정리했다. 기준선, 입력, 측정 구간을 함께 읽으며 결과 차이를 어디까지 해석할 수 있는지 살펴봤다. MV-EviRAG 소스에는 저장소 접근 권한이 필요하다.


## 같은 질문에 검색 근거만 달리 넣기


kiit26-mededge-rag의 [질문별 답변 평가](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/evaluation.py)는 같은 질문에 대해 `llm_only`와 `rag_top3` 두 조건의 답변을 나란히 생성한다.


`run_benchmark()` 함수의 핵심 구간을 보면, 각 질문마다 먼저 검색 근거 없이 모델만 호출하는 llm_only 행을 만들고, 이어서 상위 3개 근거를 포함한 rag_top3 행을 만든다.


```python
rows.append(benchmark_row(condition="llm_only", hits=[], ...))
hits = index.search(question, top_k=top_k)
rows.append(benchmark_row(condition=f"rag_top{top_k}", hits=hits, ...))
```


두 조건은 같은 모델 설정을 전달하지만 프롬프트와 검색 근거 구성이 다르다. 검색의 효과를 분리하려면 생성의 확률성, 호출 순서, 대체 응답 경로를 함께 통제해야 한다. 특히 같은 모델 이름을 기록한 것과 실제 모델 호출을 완료한 것은 used_llm 필드로 구분해야 한다.


기준선과 변경 조건을 남긴 기록은 이후 비교를 다시 읽는 출발점이 된다. 검색의 효과를 보려면 두 조건 사이에 실제로 달라진 입력과 실행 경로가 먼저 드러나야 했다.


## 임계값 설정과 근거 자료


[MultiAgentBiasModerator](https://github.com/NAMUORI00/multi-agent-bias-moderator/blob/861a308d318ef97f5665915d8595ec402d2c1274/src/bias_detection/ensemble_detector.py)의 `EnsembleBiasDetector`에는 두 종류의 숫자가 있다.


하나는 `ensemble_weights`로, pattern=0.4, similarity=0.3, hybrid=0.3이 코드에 직접 적혀 있다. 다른 하나는 `calibration_params`로, 모든 카테고리에서 alpha=1.0, beta=0.0으로 초기화되어 있다.


`_calibrate_score`는 `alpha * raw + beta`를 계산하고 결과를 0~1로 자른다. 기본 alpha=1.0, beta=0.0이면 범위 안의 점수는 그대로 남는다.


예를 들어 패턴 0.2, 유사도 0.8, 혼합 0.5를 가정하면 가중합은 0.4×0.2 + 0.3×0.8 + 0.3×0.5 = 0.47이고, 기본 변환 후에도 0.47이다. 설명용으로 구성한 확률 계산이다.


함수 이름에 calibration이 들어간다는 사실만으로 검증 데이터에서 확률 보정을 학습했다고 볼 수는 없다. 범위를 자르는 것과, 0.7이라고 예측한 사례의 실제 정답 비율을 70%에 가깝게 맞추는 일은 다른 질문이다. 확인한 초기화 코드에는 기본 가중치와 변환 파라미터가 있고, 이 숫자를 정한 과거 근거는 해당 코드만으로 알 수 없다.


`BiasScorer`의 별도 개입 판단 함수도 읽어 보면 기본 임계값 0.3 외에 confidence > 0.2 조건이 있다. 호출자가 임계값을 전달할 수도 있다. 따라서 “모든 카테고리에서 0.3만 넘으면 개입”이라는 그림으로 줄이면 실제 조건을 잃는다. 앙상블 점수의 계산 경로와 대화 점수를 받아 개입을 판단하는 경로를 각각 확인해야 한다.


![S14-01.png](/images/notion/tech-s14/image-1.png)


그림 1. 기본 앙상블 파라미터를 적용한 설명용 수치 예제. 범위 제한을 거친 점수와 실증적으로 보정된 확률을 구분했다. 출처: 여러 탐지 점수를 합치는 계산을 바탕으로 직접 계산, 구성.


## 반복 측정과 부트스트랩 신뢰구간


kiit26-mededge-rag의 `summarize_answer_relevancy()` 함수는 llm_only와 rag_top3 조건의 Answer Relevancy 점수 차이(delta)에 대해 부트스트랩 신뢰구간을 산출한다([RAGAS Metrics](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)).


```python
ci_low, ci_high = bootstrap_mean_ci(
    deltas, confidence=0.95, samples=10000, seed=13
)
```


평균 delta 하나만 보고하면 그 차이가 표본 변동에 의한 것일 가능성을 배제할 수 없다. 10,000번 재추출한 부트스트랩 분포에서 95% 구간의 하한과 상한을 함께 보고하면, delta의 방향(양수인지 음수인지)이 표본 변동에 어느 정도 안정적인지 확인할 수 있다.


시드 13은 이 재표집의 난수 순서를 고정한다. 같은 데이터, 구현, 환경에서 계산을 재현하는 데 사용하며, 모델 호출과 표본 수집은 각각 별도 재현 조건이 필요하다. 시드 변경은 같은 표본에 대한 수치적 민감도를 확인하는 방법이다. 독립 데이터는 별도로 수집해야 한다. 신뢰구간이 0을 포함하면 이 절차에서 차이의 방향을 분명히 구분하지 못한 것으로 읽어야 한다.


예를 들어 paired_n=20인 상황을 가정해 보자. 20개 질문 각각에 대해 llm_only 점수와 rag_top3 점수의 차이를 구하면 20개의 delta가 나온다. 이 20개에서 복원 추출로 20개를 뽑아 평균을 구하는 과정을 10,000번 반복하면, 평균 delta의 분포가 만들어진다.


이 코드에서는 정렬한 평균 목록의 하위, 상위 꼬리에 해당하는 정수 인덱스를 사용한다. 보간한 백분위수 함수와 작은 수치 차이가 날 수 있다. 질문들이 같은 사건의 변형이라면 독립 샘플로 취급해도 되는지부터 확인해야 한다. 재표집 10,000회는 기존 표본을 반복 추출하는 계산이다.


빈 차이 목록에는 [0, 0], 한 표본에는 [평균, 평균]을 반환하는 경로가 있다. 구간 폭을 읽을 때 paired_n과 제외된 행을 함께 확인한 이유다.


## 오프라인 시뮬레이션과 운영 성능의 경계


MV-EviRAG의 고정 커밋 README에는 과거 라우팅 분석에서 회수한 가용 쌍을 실제 생성 정답 수와 구분하는 설명이 있다. `evidence_supported_correct_yield`라는 이름만 보면 정답 산출량처럼 보이지만, 그 기록에서 세는 대상은 선택된 규칙 기반 가용 쌍이다. 생성 결과의 정오를 직접 센 수치로 바꿔 표현할 수 없다.


README는 해당 라우팅 분석을 고정 응답과 실측 평균 생성 시간을 사용한 오프라인 반사실 분석으로 설명한다. 개별 생성 시간 측정과 운영 정책의 실제 서비스 실행은 증거 범위가 달랐다.


큐 대기, 동시 요청, 장애와 재시도 등 운영 조건까지 포함한 결과로 확대하지 않았다. [README](https://github.com/NAMUORI00/RoleSep-VQA/blob/775b34eafca5db8914522ac7a582a1d841a63773/README.md), 저장소 접근 권한 필요.


## 검증 단계와 주장 범위의 대응


아래는 해당 README가 요약한 초기 검증 기록의 구분이다. 저장소에는 별도 코호트와 후속 평가를 담은 제출 아카이브도 있으므로 이 네 행을 프로젝트 전체의 최종 상태로 보지는 않았다.


| 단계        | 데이터 특성             | 주장 범위 제한           |
| --------- | ------------------ | ------------------ |
| 개발 실증     | 개발 데이터             | 구성요소 작동 확인         |
| 준확증       | 노출 이력 있는 B/C 자료    | 읽기 전용 비교, 독립 확증 아님 |
| 정렬 학습     | 탐색적 학습 및 평가        | 탐색적 결과             |
| 사전 동결 재평가 | 노출 이력 있는 heldout-C | 방향 유지 확인, 독립 확증 불가 |


마지막 단계에 대해 README는 "공개 시각 인증을 거친 사전등록이 아니라 실행 전에 해시로 고정한 내부 동결 기록"이라고 적고 있다. 해시는 현재 파일이 기록된 사본과 같은지 확인하는 수단이다. 해시 문자열만으로 그 파일이 언제 존재했는지, 분석 전에 만들어졌는지까지 증명할 수는 없다. 실행 전의 동결 기록과 타임스탬프, 공개 기록을 함께 확인해야 공개 사전등록 여부를 판단할 수 있다.


[제출 아카이브](https://github.com/NAMUORI00/RoleSep-VQA/blob/775b34eafca5db8914522ac7a582a1d841a63773/outputs/submission_archive_20260819/README.md)(저장소 접근 권한 필요)에는 등록 기록, 동결 프로토콜, 저장된 모델 응답, 분석 코드의 SHA-256이 정리되어 있어 재현 가능한 감사 경로가 남아 있다.


![S14-02.png](/images/notion/tech-s14/image-2.png)


그림 2. 평가 절차와 근거 파일의 설명용 관계도. 파일 동일성 확인과 실행 전 공개 기록 확인은 서로 다른 질문이다.  출처: 본문에서 대조한 기록의 역할을 직접 구성.


다음 확인 항목으로는 질문별 짝의 대응, 대체 응답의 포함 여부, 같은 사건에서 파생된 행의 독립성을 남겼다. 재표집 시드의 민감도를 비교하기에 앞서 측정 단위와 실제 실행 경로를 맞추는 과정이다.


**참고**

- [RAGAS Available Metrics -- docs.ragas.io](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
- [MV-EviRAG submission archive README](https://github.com/NAMUORI00/RoleSep-VQA/blob/775b34eafca5db8914522ac7a582a1d841a63773/outputs/submission_archive_20260819/README.md) (저장소 접근 권한 필요)
- [MultiAgentBiasModerator 여러 탐지 점수를 합치는 계산](https://github.com/NAMUORI00/multi-agent-bias-moderator/blob/861a308d318ef97f5665915d8595ec402d2c1274/src/bias_detection/ensemble_detector.py)
- [BiasScorer](https://github.com/NAMUORI00/multi-agent-bias-moderator/blob/861a308d318ef97f5665915d8595ec402d2c1274/src/bias_detection/bias_scorer.py): 개입 판단의 임계값과 confidence 조건

## 함께 읽기


먼저 읽을 글: [실험 재현을 위한 실행 기록 정리](https://blog.namuori.net/posts/tech-k28/)


이어 읽을 글: [SmartFarm 벤치마크의 평가 경로와 측정 기준](https://blog.namuori.net/posts/tech-03-05/), [MV-EviRAG의 선택 위험과 평가 자료 관리](https://blog.namuori.net/posts/tech-04-03/), [MedEdge의 모델 초기화와 응답 시간 측정](https://blog.namuori.net/posts/tech-05-02/), [BitNet 가중치 표현과 추론용 변환 정리](https://blog.namuori.net/posts/tech-05-04/)
