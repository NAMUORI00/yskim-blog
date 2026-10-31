---
title: "aerospace-rag의 검색 결과 결합과 가중치 조정"
date: 2026-05-18
draft: false
slug: "aerospace-rag-weighted-rrf"
categories:
  - "검색과 RAG"
tags:
  - "rag"
  - "ml"
summary: "항공우주 RAG의 검색 결과를 합치며 채널별 가중치를 조정하는 흐름을 정리했다. 순위 기반 결합과 가중치 설정 파일을 연결하고, 보정에 쓴 질의와 최종 평가 질의를 나누는 문제를 다뤘다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-81d8-b14a-d8be2b7cebea"
generated_by: "notion"
---
항공우주 RAG의 검색 결과를 합치며 채널별 가중치를 조정하는 흐름을 정리했다. 순위 기반 결합과 가중치 설정 파일을 연결하고, 보정에 쓴 질의와 최종 평가 질의를 나누는 문제를 다뤘다.


## 구현과 확인 과정


aerospace-rag의 검색 결과 결합 방식을 살펴봤다. 키워드 검색과 벡터 검색이 같은 청크를 서로 다른 순위로 돌려줄 때, 이 프로젝트는 채널별 순위를 가중 RRF로 합쳐 최종 순서를 정한다. 앞 글에서 정리한 공통 청크 식별자가 합산 기준이 된다. 가중치를 인덱스 생성 시점에 보정하는 과정과 질의 시점에 조정하는 과정을 나눠서 확인했다.


![05-fusion-roles.png](/images/notion/aerospace-rag-weighted-rrf/image-1.png)


그림 1. 인덱스 생성 시 가중치를 보정하는 과정과 질문 시 순위를 결합하는 과정. 자체 보정 질의와 독립 평가 질의를 분리해야 한다.


## 순위 기반 결합의 선택 근거와 한계


검색기마다 점수의 척도가 달라, 점수를 정규화해서 합치는 방법과 순위를 기준으로 합치는 방법을 함께 생각해 볼 수 있었다. 현재 코드는 순위를 사용하고 있었다. 척도를 직접 맞추는 부담은 줄지만, 1위와 2위 사이의 원점수 차이는 사라진다. 두 방식의 우열은 같은 질문셋에서 비교한 결과가 있어야 판단할 수 있어, 이번에는 구현에서 확인한 차이까지 정리했다.


## 가중 RRF 점수 계산


[검색 순위를 합치는 처리](https://github.com/NAMUORI00/aerospace-rag/blob/ac33be02be2ba6262b2529d0d663e46c1dbac228/aerospace_rag/retrieval/fusion.py)의 `weighted_rrf()` 함수가 채널별 결과를 합산한다.


각 청크의 점수는 채널 가중치 × `1/(k + rank + 1)`로 계산되며, k 기본값은 60이다. 표준 RRF(`k=60`, 균등 가중치)에 채널별 가중치를 곱한 형태다.


네 정규 채널(`vector_dense_text`, `vector_sparse`, `vector_image`, `graph`)의 점수가 합산되므로, 한 채널에서 높은 순위를 받은 청크가 다른 채널에서도 등장하면 점수가 누적된다. 채널 가중치가 0이면 해당 채널의 결과는 합산에 기여하지 않는다.


## 가중치 보정과 적용 시점


검색 채널마다 얼마만큼 비중을 줄지는 인덱스 생성 시점에 미리 보정해 둔다. 아래 순서로 가중치 설정을 만들어 파일로 저장하고 런타임에서 사용한다.


[검색 가중치 보정 처리](https://github.com/NAMUORI00/aerospace-rag/blob/ac33be02be2ba6262b2529d0d663e46c1dbac228/aerospace_rag/retrieval/profile.py)

1. 인덱스의 청크에서 의사 질의(pseudo query)를 생성한다. `_pseudo_query()`가 제목 메타데이터, 원본 파일명의 stem, 본문 앞 24개 토큰을 결합한다. 기본 설정에서는 최대 32개 사례를 사용한다.
2. `DEFAULT_WEIGHT_GRID`에 정의된 8개 가중치 후보 조합을 순회한다.
3. 각 조합으로 가중 RRF를 수행하고, 목표 청크 또는 같은 원본 파일의 청크가 처음 나타나는 순위의 역수를 구해 평균한다. 구현에서는 이를 `mrr_at_k`로 기록하지만, 정확히 같은 청크만 정답으로 인정하는 MRR보다 느슨한 기준이다.
4. MRR@k가 가장 높은 조합을 선택해 가중치 설정 파일에 저장한다.

코드에서 확인한 보정 시점은 인덱스를 만들 때이고, 선택된 값은 파일로 남아 런타임에서 읽힌다. 의사 질의가 인덱스 본문에서 만들어지므로 독립 평가셋으로 측정한 결과와는 성격이 다르다.


## 프로파일 누락 시 기본 설정


질문의 성격에 맞게 검색 비중을 바꾸기 위해 질의를 세 구간으로 분류한다. [질문별 검색 가중치 선택](https://github.com/NAMUORI00/aerospace-rag/blob/ac33be02be2ba6262b2529d0d663e46c1dbac228/aerospace_rag/retrieval/weights.py)

- `entity_rich`: 미리 정의된 엔티티 힌트 토큰과 겹치는 질의
- `keyword_fact`: 앞 조건에 해당하지 않으면서 토큰 수가 6개 이하인 질의
- `general`: 일반 질의

각 구간에 `DEFAULT_CHANNEL_WEIGHTS`로 정의된 정적 기본 가중치가 할당된다. 자기 보정 프로파일이 존재하면 그 값이 기본값을 대체한다. `normalize_channel_weights()`가 가중치 합을 1로 정규화한다.


## 검색 결과 수에 따른 가중치 조정


`_apply_evidence_adjustment()`는 질의 시점에 텍스트 밀집, 희소, 그래프 채널의 실제 검색 결과 수를 확인하고 가중치를 조정한다. 코드에서 확인한 규칙은 다음 두 가지다.

- 결과가 0건인 채널: 가중치를 0으로 설정
- 결과가 2건 미만인 채널: 가중치를 절반으로 감소

조정 후 `normalize_channel_weights()`로 다시 정규화한다. 결과가 없는 채널에 배정된 가중치를 재분배하고, 결과가 한 건뿐인 채널의 비중을 낮추는 규칙이다.


빈 채널은 애초에 합산에 점수를 더하지 않았다. 그래서 이 처리는 노이즈를 제거한다기보다, 남은 채널의 가중치를 다시 배분하는 동작으로 읽혔다. 결과가 여러 건이라는 사실만으로 내용의 적합성까지 확인되지는 않는다. 질문별 순위가 조정 전후에 어떻게 달라지는지는 추가로 살펴볼 부분으로 남았다.


## 테스트 항목과 확인 범위


[검색과 생성 테스트](https://github.com/NAMUORI00/aerospace-rag/blob/ac33be02be2ba6262b2529d0d663e46c1dbac228/tests/test_retrieval.py)에 RRF 계산과 검색, 생성 관련 테스트가 있다.


RRF 점수 계산, 근거 조정 로직, 해시 임베딩 결정론성, graph-lite 이웃 탐색, vLLM 출력 파싱 등을 다룬다. 이번에는 테스트 코드의 검사 내용을 확인했다. 현재 환경의 통과 여부는 실행으로 확인해야 한다. 자기 보정은 의사 질의로 내부 일관성을 검증할 뿐, 외부 벤치마크 성능을 측정하지 않는다.


## 숫자로 읽는 순위 융합


순위가 1부터 시작한다고 쓰면 청크 d의 최종 점수는 `Σ w_c / (60 + r_c(d))`다. 코드의 `rank`는 0부터 시작하므로 분모에 1을 더한다. 각 채널 안에서는 원래 검색 점수로 순서를 정하지만, 채널 사이에서는 원점수의 크기를 직접 비교하지 않는다.


벡터와 BM25 가중치를 각각 0.6, 0.4로 둔 설명용 예시를 보자. 청크 A가 두 채널에서 모두 2위라면 `0.6/62 + 0.4/62 ≈ 0.01613`이다.


청크 B가 벡터에서는 1위지만 BM25 결과에는 없으면 `0.6/61 ≈ 0.00984`다. 이 예시에서는 두 목록에 함께 나타난 A가 B보다 앞선다. 순위 결합의 원리를 계산으로 확인한 것이며, 실제 검색 성능 측정과는 별개다.


RRF에서는 원점수의 간격 정보가 사라진다. 1위가 2위보다 압도적으로 높은 경우와 거의 같은 경우 모두, 순위가 동일하면 동일한 기여를 한다. 또한 두 검색기가 같은 토큰 단서에 의존한다면, 중복된 신호가 독립적인 근거인 것처럼 합산될 수 있다.


## 보정 파일과 평가셋 사이의 경계


본문 일부로 만든 의사 질의는 실제 사용자의 질문보다 원본을 찾기 쉽다. 같은 파일의 다른 청크도 정답으로 인정하면, 긴 문서에서 적절한 문단을 찾는 능력이 과대평가될 수 있다. 자체 보정은 초기 가중치를 잡는 용도이며, 이 점수가 실제 질문에 대한 검색 성능을 대표하지는 않는다.


후속 평가에서 비교할 항목도 이 구조를 기준으로 정리했다. 사용자가 작성한 질문, 정답 청크와 허용 가능한 보조 청크, 문서 단위 분리를 고정하고, 가중치를 고르는 자료와 최종 성능을 보고할 자료를 나누는 방식이다. 검색 순위가 좋아져도 답변의 근거성이 함께 좋아진다고 볼 수는 없어, 생성 결과의 인용 정확성도 별도 확인 항목에 포함했다.


다음 글에서는 검색 당시 맞았던 근거가 답변을 실행하기 전에 낡아지는 문제를 살펴본다. smartfarm의 상태 재검증에서 확인할 부분은 시간에 따라 조건이 달라졌을 때 답변을 다시 검토하는 흐름이다.


## 함께 읽을 내용


임베딩 검색, 단어 검색의 차이를 알고 두 순위표의 RRF 값을 계산할 수 있는 정도를 전제로 한다.


먼저 읽을 글: [텍스트 임베딩과 벡터 유사도 정리](https://blog.namuori.net/posts/tech-k06/), [역색인과 BM25 검색 정리](https://blog.namuori.net/posts/tech-k07/), [RRF를 이용한 검색 순위 결합](https://blog.namuori.net/posts/tech-k08/), [검색 결과 결합의 중복과 식별자 처리](https://blog.namuori.net/posts/tech-s07/)


이어 읽을 글: [aerospace-rag의 검색 구조와 출처 관리](https://blog.namuori.net/posts/aerospace-rag-hybrid-retrieval/), [SmartFarm_RAG의 검색 문맥과 출처 전달](https://blog.namuori.net/posts/tech-02-03/)


## 참고

- [검색 순위를 합치는 처리](https://github.com/NAMUORI00/aerospace-rag/blob/ac33be02be2ba6262b2529d0d663e46c1dbac228/aerospace_rag/retrieval/fusion.py): 가중 RRF 구현
- [검색 가중치 보정 처리](https://github.com/NAMUORI00/aerospace-rag/blob/ac33be02be2ba6262b2529d0d663e46c1dbac228/aerospace_rag/retrieval/profile.py): 자기 보정 프로파일 생성
- [질문별 검색 가중치 선택](https://github.com/NAMUORI00/aerospace-rag/blob/ac33be02be2ba6262b2529d0d663e46c1dbac228/aerospace_rag/retrieval/weights.py): 질의 분류, 가중치 해소, 근거 조정

---


이전 글, [aerospace-rag의 검색 구조와 출처 관리](https://blog.namuori.net/posts/aerospace-rag-hybrid-retrieval/)


다음 글, [SmartFarm 상태 변경과 답변 재검증](https://blog.namuori.net/posts/smartfarm-state-revalidation/)


## 작업을 정리하며


가중치는 결합 방식을 표현하는 설정이며 성능은 독립 질문으로 확인해야 한다. 설정 생성과 런타임 적용을 나누면 어떤 조건으로 검색했는지 재현하기 쉽다. 보정 질의를 바꿨을 때 결과가 얼마나 달라지는지도 함께 남기는 편이 좋다.
