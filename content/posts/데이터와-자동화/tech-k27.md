---
title: "표 데이터의 스키마와 정규화"
date: 2025-04-08
draft: false
slug: "tech-k27"
categories:
  - "데이터와 자동화"
tags:
  - "workflow"
summary: "두 출처의 재고표를 합치는 예제로 스키마와 정규화를 정리했다. 같은 품명이라도 수량 단위가 개와 상자로 다르면 바로 더할 수 없다. 열 이름뿐 아니라 자료형, 결측, 중복, 단위와 원문 연결을 함께 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-81dd-abc1-e7108861244a"
generated_by: "notion"
---
## 서로 다른 표의 스키마 비교


두 출처의 재고표를 합치는 예제로 스키마와 정규화를 정리했다. 같은 품명이라도 수량 단위가 개와 상자로 다르면 바로 더할 수 없다. 열 이름뿐 아니라 자료형, 결측, 중복, 단위와 원문 연결을 함께 살펴봤다.


## 다섯 행짜리 표로 보는 세 가지 문제


과일 재고를 두 곳에서 수집했다고 하자.


**표 A (창고)**


| 품명  | 수량 | 단위 |
| --- | -- | -- |
| 사과  | 50 | 개  |
| 바나나 |    | 개  |
| 사과  | 50 | 개  |


**표 B (매장)**


| item_name | qty | unit |
| --------- | --- | ---- |
| 사과        | 2.5 | kg   |
| 포도        | 30  | 개    |


이 두 표를 합치면 바로 보이는 문제가 세 가지 있다.

1. **스키마 불일치**: 표 A는 `품명`, 표 B는 `item_name`. 같은 뜻이지만 열 이름이 다르다.
2. **결측값**: 표 A의 바나나 행에 수량이 비어 있다.
3. **중복**: 표 A에 사과 50개가 두 번 나온다. 실제 두 번 입고된 것인지, 입력 실수인지 표만 보고는 알 수 없다.

여기에 단위 문제도 있다. 창고는 `개`, 매장은 `kg`을 쓴다. 사과 50개와 사과 2.5kg을 더하면 52.5라는 숫자가 나오지만, 이 숫자에는 의미가 없다.


![readable-K27-01.png](/images/notion/tech-k27/image-1.png)


그림 1. 불명확한 행을 지우지 않고 확인 사유와 함께 남기는 과정. 직접 작성한 설명용 도식.


## 스키마 맞추기


첫 단계는 같은 뜻의 열에 같은 이름을 붙이는 것이다.


```python
import pandas as pd

df_b = df_b.rename(columns={
    'item_name': '품명',
    'qty': '수량',
    'unit': '단위'
})
```


`rename`은 열 이름만 바꾸고 값은 유지한다. 이름을 맞춘 뒤에도 `단위` 열에 `개`와 `kg`이 섞여 있어 수량을 같은 척도로 취급할 수는 없었다. 이름과 의미의 대응을 나누어 읽은 부분이다.


## 결측값과 중복 행 처리


바나나의 수량이 빈 이유를 알 수 없어 예제에서는 결측을 유지했다. 수량 미확인과 재고 없음은 다른 상태다. `fillna(0)`으로 채우려면 원천 시스템에서 빈칸을 0으로 정의하는지 확인할 근거가 더 필요하다.


원본 표를 수정하지 않고 결측과 동일 값 후보를 따로 표시하면, 규칙을 바꿀 때 어떤 행을 다시 살펴볼지 알 수 있다.


```python
missing_quantity = df_a['수량'].isna()
# [False, True, False]

same_values = df_a.duplicated(
    subset=['품명', '수량', '단위'], keep=False
)
# [True, False, True]
```


여기서 True는 선택한 열의 값이 같다는 뜻이다. 실제 삭제 여부는 원본의 의미를 대조한 뒤 결정한다. A의 사과 두 행이 실제 두 번 입고된 기록이라면 하나를 지울 때 수량을 잃는다. 거래 ID나 관측 시각, 재수집 기록으로 같은 사건의 중복 수집임을 확인한 뒤에 제거 기준을 정할 수 있다. 이 글에서는 그 정보가 없으므로 세 행을 그대로 둔다.


결측을 제외한 합계는 알려진 수량의 합이다. 전체 재고로 읽을 수 있는지 판단하려면 확인된 행과 미확인 행의 수도 함께 필요하다.


## 조인과 행 연결의 결과 비교


원본 A의 세 행과 B의 두 행을 그대로 사용하자. `concat`은 행을 이어 붙이므로 다섯 행이 된다. `merge`는 키가 같은 행끼리 연결한다. 품명을 키로 삼으면 창고의 사과 두 행이 매장의 사과 한 행에 각각 연결된다.


```python
joined = pd.merge(
    df_a, df_b, on='품명', how='outer',
    suffixes=('_창고', '_매장'),
    validate='many_to_one', indicator=True
)
# 사과 2행, 바나나 1행, 포도 1행: 총 4행
```


`many_to_one`은 오른쪽 표에서 품명이 유일한지 검사한다. 매장에도 사과가 두 행 있다면 검사가 실패한다. 검사를 생략한 다대다 조인에서는 사과만 2×2=4행으로 늘어난다. 연결된 수량을 그대로 합하면 같은 관측을 여러 번 셀 수 있다.


이 조인은 두 출처의 값을 나란히 보는 용도다. 단위가 다르므로 조인에 성공해도 수량을 더할 수는 없다. `개`를 `kg`으로 바꾸려면 해당 과일의 무게 정보가 필요하다. kg을 g으로 바꾸는 단위 환산과는 다른 문제여서, 여기서는 서로 다른 단위로 유지한다.


열 접미사는 값이 어느 표에서 왔는지만 알려 준다. 정확한 원본 행으로 돌아가려면 출처와 행 식별자를 함께 남겨야 한다.


```python
# 원본 df_a, df_b를 바꾸지 않고 추적 정보를 추가한다.
a_traced = df_a.assign(출처='창고', 원본_행=['A1', 'A2', 'A3'])
b_traced = df_b.assign(출처='매장', 원본_행=['B1', 'B2'])
combined = pd.concat([a_traced, b_traced], ignore_index=True)
# 원본의 5행을 모두 보존한다.
```


원본 행 번호는 위치를 나타내며 거래의 고유성은 별도 식별자로 확인한다. 실제 수집에서는 파일 이름이나 수집 회차 식별자도 함께 필요할 수 있다. 같은 파일이 갱신되면서 세 번째 행의 내용이 바뀔 수 있기 때문이다.


![readable-K27-02.png](/images/notion/tech-k27/image-2.png)


그림 2. 같은 입력에서 행을 이어 붙인 결과와 키로 연결한 결과의 차이. 직접 작성한 설명용 도식.


## 추가 확인 항목


이번 예제에서는 행 수를 줄이는 대신 의미가 불확실한 부분을 남겨 두었다. 빈 수량, 같은 값의 반복, 서로 다른 단위가 각각 다른 질문을 요구했기 때문이다. 원본과 연결되는 식별자가 있으면 정리 규칙이 바뀌더라도 영향을 받는 행을 다시 확인할 수 있다.


정리 규칙의 검증과 규칙 변경 후 과거 자료의 재처리는 다음 내용으로 남겼다. 원본 행, 규칙 버전, 변환 결과를 연결하면 다시 처리할 범위를 비교할 수 있다.


**참고**

- [Working with missing data — pandas](https://pandas.pydata.org/docs/user_guide/missing_data.html)
- [Merge, join, concatenate and compare — pandas](https://pandas.pydata.org/docs/user_guide/merging.html)
- [pandas.DataFrame.drop_duplicates — pandas](https://pandas.pydata.org/docs/reference/api/pandas.DataFrame.drop_duplicates.html)

## 함께 읽기


이어 읽을 글: [문서, 청크, 원문 위치의 연결](https://blog.namuori.net/posts/tech-s06/), [CSV, JSON 변환의 식별자와 값 처리](https://blog.namuori.net/posts/tech-s22/), [aerospace-rag의 검색 구조와 출처 관리](https://blog.namuori.net/posts/aerospace-rag-hybrid-retrieval/), [농업 자료 수집과 검색 데이터 준비 과정](https://blog.namuori.net/posts/tech-02-04/)
