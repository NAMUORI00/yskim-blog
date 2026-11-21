---
title: "검색 결과 결합의 중복과 식별자 처리"
date: 2025-03-09
draft: false
slug: "tech-s07"
categories:
  - "검색과 RAG"
tags:
  - "workflow"
summary: "앞 글의 RRF 계산을 두 검색 목록에 적용하며 합산 대상의 식별 기준을 정리했다. 같은 청크는 점수를 합치지만 같은 문서의 다른 청크는 별도 항목으로 남길 수 있다. 계산 전에 자료의 동일성을 정하는 단계가 필요했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-819b-a91c-cb57bfa9a488"
generated_by: "notion"
---
## 검색 결과의 식별 기준


앞 글의 RRF 계산을 두 검색 목록에 적용하며 합산 대상의 식별 기준을 정리했다. 같은 청크는 점수를 합치지만 같은 문서의 다른 청크는 별도 항목으로 남길 수 있다. 계산 전에 자료의 동일성을 정하는 단계가 필요했다.


검색 결과 두 묶음에서 순위와 식별자가 어떻게 사용되는지 따라갔다. RRF가 순위의 역수를 누적한다는 원리와 청크 구분을 기준으로 계산했다. 임베딩 모델 내부 구조는 이 예제의 범위에서 제외했다.


## 청크 식별자와 결과 결합


검색 A가 `[a, b, c]`, 검색 B가 `[b, d]`를 반환했다고 하자. 여기서 소문자는 같은 청크를 가리키는 안정적인 식별자라고 가정한다. 제목이 같아도 내용이 다를 수 있고, 같은 내용이 다른 제목으로 저장될 수도 있어서 제목 문자열을 키로 삼지 않았다.


| 청크 | A 순위 | B 순위 |
| -- | ---- | ---- |
| a  | 1    | 없음   |
| b  | 2    | 1    |
| c  | 3    | 없음   |
| d  | 없음   | 2    |


설명을 짧게 하려고 RRF 상수 k를 10으로 놓으면 b의 점수는 `1/12 + 1/11 ≈ 0.17424`가 된다. a는 `1/11 ≈ 0.09091`, d는 `1/12 ≈ 0.08333`, c는 `1/13 ≈ 0.07692`다. 따라서 이 예제의 결합 순서는 b, a, d, c가 된다. k=10은 손계산을 위해 고른 예시 값이다.


목록에 없는 항목은 해당 검색기에서 기여하는 점수를 0으로 두었다. 순위를 0으로 넣는 것과는 다르다. 누락된 항목에 `1/(k+0)`을 주면 오히려 1위보다 높은 점수를 받기 때문이다.


![readable-S07-01.png](/images/notion/tech-s07/image-1.png)


그림 1. 두 검색 목록을 청크 식별자로 묶어 RRF 점수를 계산한 예. 계산 흐름을 설명하기 위해 직접 작성한 도식이다.


## 한 검색기 안의 중복은 한 표로 남기기


A가 `[a, b, b, c]`를 반환하는 경우에는 한 검색기 안에서 같은 청크가 반복된 것으로 보고 첫 등장만 남겼다. 두 검색기에서 각각 b를 찾은 경우와 달리 한 목록의 중복을 처리하는 선택이다.


중복을 제거한 뒤 순위를 다시 매길지도 정해야 한다. 아래 예제는 원래 반환 위치를 유지한다. 따라서 c의 순위는 4다. 검색기의 원래 순서를 보존한다는 장점이 있지만, 중복이 다른 항목의 기여도를 낮추는 영향은 남는다. 고유 항목 기준으로 재순위를 매기는 정책도 가능하므로 둘 중 하나를 정해 기록해야 한다.


```python
from collections import defaultdict

def fuse(rankings, k=10):
    scores = defaultdict(float)
    for items in rankings:
        seen = set()
        for rank, chunk_id in enumerate(items, start=1):
            if chunk_id in seen:
                continue
            seen.add(chunk_id)
            scores[chunk_id] += 1 / (k + rank)
    return sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))

fuse([["a", "b", "c"], ["b", "d"]])
# b, a, d, c 순서
```


동점에서는 식별자의 사전순을 사용했다. 품질을 높이는 규칙이라기보다 같은 입력에서 결과 순서가 흔들리지 않게 하기 위한 선택이다. 정렬 결과를 비교하는 테스트나 사용자 화면에서 재현성을 확인하기 쉬워진다.


## 문서와 청크 단위의 중복 처리


문서 D의 첫 청크에는 장치 설정이, 두 번째 청크에는 예외 조건이 있다고 하자. 문서 ID만 보고 하나를 지우면 답변에 필요한 예외가 빠질 수 있다. 반대로 서로 크게 겹치는 청크를 모두 넣으면 문맥 공간을 낭비할 수 있다. 그래서 정확히 같은 청크를 합치는 작업과 관련 청크의 다양성을 조절하는 작업을 나누어 보았다.


![S07-02.png](/images/notion/tech-s07/image-2.png)


그림 2. 같은 청크의 결과 결합과 같은 문서 안의 서로 다른 청크 선택을 구분한 예. 직접 작성한 설명용 도식.


동일성 기준에는 버전도 포함했다. 갱신 전후 청크가 같은 ID를 공유하면 다른 내용을 하나로 합칠 수 있다. 문서 ID, 문서 버전, 청크 위치 또는 내용 식별자의 조합은 원문으로 돌아가는 경로와도 연결된다.


## 결합 점수 이후에 남는 판단


계산한 RRF 점수는 검색 순위를 결합한 값으로 읽었다. 검색기가 같은 잘못된 자료를 선호하면 높은 점수에도 근거가 부족할 수 있다. 가중치 변경은 목록별 영향력을 바꾸며, 답변 신뢰도의 보정은 별도로 평가할 항목이다.


재순위화는 질문과 후보 내용을 다시 읽는 후속 단계로 구분했다. 순위만 사용하는 RRF와 평가 입력이 다르다. 이어지는 문맥 조립에서는 후보의 길이와 배치 순서, 잘린 청크의 출처 유지가 확인 항목으로 남았다.


**참고**

- [Cormack 외, Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- [Elasticsearch RRF 공식 문서](https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion)

## 함께 읽기


먼저 읽을 글: [RRF를 이용한 검색 순위 결합](https://blog.namuori.net/posts/tech-k08/)


이어 읽을 글: [aerospace-rag의 검색 결과 결합과 가중치 조정](https://blog.namuori.net/posts/aerospace-rag-weighted-rrf/)
