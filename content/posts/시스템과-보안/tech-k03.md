---
title: "API, ABI와 호환성 정리"
date: 2025-01-23
draft: false
slug: "tech-k03"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "라이브러리의 호환성을 정리하며 API와 ABI를 나누어 살펴봤다. getData를 fetchData로 바꾸는 이름 변경뿐 아니라 인자 전달과 데이터 배치도 호출 양쪽의 약속에 포함된다. 소스와 이미 빌드된 프로그램이 각각 의존하는 조건을 작은 예제로 비교했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-812e-b00c-c0f0065e3611"
generated_by: "notion"
---
## 이름만 바꿨는데 깨지는 상황


라이브러리의 호환성을 정리하며 API와 ABI를 나누어 살펴봤다. getData를 fetchData로 바꾸는 이름 변경뿐 아니라 인자 전달과 데이터 배치도 호출 양쪽의 약속에 포함된다. 소스와 이미 빌드된 프로그램이 각각 의존하는 조건을 작은 예제로 비교했다.


## 소스 수준의 약속: API


API(Application Programming Interface)는 소스 코드 사이의 계약에 해당한다. 함수 이름, 매개변수 타입, 반환 타입, 호출 순서가 여기에 속한다.


```c
int add(int a, int b);
```


이 선언을 사용하는 코드는 `add`라는 이름과 `int` 두 개를 받는 형식에 의존한다. 이름이 `sum`으로 바뀌면 호출 소스를 수정할 수 있다. 매개변수 타입이 달라져도 암시적 변환으로 컴파일을 통과할 수 있어, 결과값의 의미와 예외 처리 같은 동작 계약도 함께 비교할 대상이다.


## 바이너리 수준의 약속: ABI


ABI(Application Binary Interface)는 컴파일이 끝난 뒤에도 유지되어야 하는 약속이다. 인자가 어떤 레지스터에 놓이는지, 구조체 필드가 메모리 몇 바이트 오프셋에 위치하는지, 반환값이 어디에 저장되는지가 ABI의 영역에 들어간다.


x86-64 리눅스에서 쓰는 [System V AMD64 호출 규약](https://refspecs.linuxbase.org/elf/x86_64-abi-0.99.pdf)을 예로 들면, 정수 인자 첫 여섯 개는 RDI → RSI → RDX → RCX → R8 → R9 순서로 레지스터에 들어가고, 반환값은 RAX에 놓인다.


`add(3, 5)`를 호출하면 컴파일러가 RDI에 3, RSI에 5를 넣는 코드를 생성하고, 호출된 쪽은 RAX에 8을 넣어 돌려준다.


한쪽이 이 규약을 따르고 다른 쪽이 Windows x64 규약(RCX, RDX 순서)을 따른다면, 같은 소스를 컴파일했더라도 인자가 엉뚱한 레지스터에서 읽히면서 값이 꼬인다. 소스는 멀쩡한데 바이너리끼리 규약이 달라서 생기는 문제다.


![readable-K03-01.png](/images/notion/tech-k03/image-1.png)


_그림 1. System V AMD64 규약에서_ _`add(3, 5)`_ _호출 시 레지스터 흐름 (설명용 예제)_


## 같은 필드인데 다른 배치


구조체도 소스가 동일해도 바이너리 배치가 달라질 수 있다. 아래 C 구조체를 보자.


```c
struct Sensor {
    char  id;     // 1바이트
    int   value;  // 4바이트
    char  flag;   // 1바이트
};
```


이 예제에서는 `char`가 1바이트, `int`가 4바이트이고 `int`의 정렬 요구가 4바이트인 기본 ABI를 가정했다. 이 조건에서 컴파일러는 `int` 필드를 4바이트 경계에 맞추려고 `id` 뒤에 3바이트 패딩을 삽입한다.


`flag` 뒤에도 구조체 전체 정렬을 위해 3바이트가 붙어, `sizeof(Sensor)`는 12가 된다. 필드 순서를 `int value; char id; char flag;`로 바꾸면 패딩이 줄어 8바이트로 줄어든다.


소스에서는 `s.value`로 접근하니 어느 쪽이든 동작한다. 하지만 한 라이브러리가 오프셋 4에서 `value`를 읽고, 다른 라이브러리가 오프셋 0에서 읽는다면 같은 메모리를 놓고 서로 다른 값을 가져가게 된다. 재컴파일 없이 공유 라이브러리만 교체하면 이런 일이 벌어진다.


| 배치                   | id 오프셋 | value 오프셋 | flag 오프셋 | 패딩 위치     | 전체 크기 |
| -------------------- | ------ | --------- | -------- | --------- | ----- |
| A: id → value → flag | 0      | 4         | 8        | 1–3, 9–11 | 12바이트 |
| B: value → id → flag | 4      | 0         | 5        | 6–7       | 8바이트  |


## 이름 변경과 시그니처 변경의 차이


라이브러리를 배포한 뒤, 사용자가 이미 컴파일해서 쓰고 있는 상황을 가정해 보자.


**내보내는 함수 이름 변경**: 헤더에서 `getData`를 `fetchData`로 고치면 소스를 쓰는 쪽이 재컴파일해야 한다(API 변경). 동시에 바이너리의 심볼 테이블에서도 이름이 바뀌므로, 재컴파일 없이 기존 바이너리를 새 라이브러리에 링크하면 심볼을 찾지 못한다(ABI 변경도 동시에 발생).


**매개변수 타입 변경**: `int`를 `long`으로 바꾸면 소스상 캐스팅이 필요할 수 있고(API 변경), 레지스터 사용이나 스택 배치가 달라질 수 있다(ABI 변경). 이때 64비트라는 표현만으로 크기를 정하면 안 됐다. 대표적인 LP64 환경에서는 `long`이 8바이트지만 Windows의 LLP64에서는 `int`와 `long` 모두 4바이트다.


[Windows x64 ABI 문서](https://learn.microsoft.com/en-us/cpp/build/x64-software-conventions?view=msvc-170)처럼 대상 ABI의 자료형 표를 확인해야 했다.


![readable-K03-02.png](/images/notion/tech-k03/image-2.png)


_그림 2. 컴파일, 링크 과정에서 API 계약과 ABI 계약을 구분한 경계 (직접 구성한 설명용 구조도; ABI 호환성은 링크 성공 후에도 별도 확인이 필요하다)_


## 경계를 의식해야 하는 시점


컴파일 오류로 API 변화의 일부를 찾을 수 있지만 의미상의 변화까지 모두 드러나지는 않는다. ABI 역시 심볼 검색에 성공한 뒤 구조체 크기나 호출 규약 때문에 실행 중 문제가 생길 수 있다. 이 차이를 기준으로 검사 대상을 두 갈래로 정리했다.

1. **소스를 다시 컴파일하는 쪽**: 함수 이름, 타입, 매개변수가 맞는지 (API)
2. **이미 컴파일된 채 연결하는 쪽**: 심볼 이름, 호출 규약, 구조체 오프셋이 맞는지 (ABI)

두 경계가 맞는지 확인하면 검사 범위를 좁힐 수 있었다. 다만 함수의 동작 의미까지 유지되는지는 별도의 호환성 예제로 확인해야 했다. 공유 라이브러리(.so, .dll)를 버전만 올려 교체하는 상황이 이 구분이 실제로 드러나는 전형적인 장면이다.


동적, 정적 링크에서 ABI 경계가 확인되는 시점과 C++ 이름 장식(name mangling)의 역할은 후속 내용으로 남겼다.


---


**참고**

- [System V Application Binary Interface — AMD64 Architecture Processor Supplement](https://refspecs.linuxbase.org/elf/x86_64-abi-0.99.pdf)
- [x64 ABI conventions — Microsoft Learn](https://learn.microsoft.com/en-us/cpp/build/x64-software-conventions?view=msvc-170)

## 함께 읽기


먼저 읽을 글: [바이트, 자료형, 메모리 정렬 정리](https://blog.namuori.net/posts/tech-k01/)


이어 읽을 글: [표시 이름과 저장 형식의 호환성](https://blog.namuori.net/posts/tech-s02/), [포크의 기준 버전과 수정 범위 정리](https://blog.namuori.net/posts/tech-s05/), [Structly 이름 변경과 파일, 플러그인 호환성 정리](https://blog.namuori.net/posts/structly-api-abi-compatibility/)
