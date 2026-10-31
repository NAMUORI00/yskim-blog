---
title: "프로세스의 주소 공간과 접근 권한"
date: 2025-01-20
draft: false
slug: "tech-k02"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "앞 글의 바이트 해석에 이어 프로세스별 주소 공간을 정리했다. 두 프로그램이 모두 0x00401000을 읽어도 가상주소를 연결하는 표가 다르면 서로 다른 메모리를 읽을 수 있다. 주소의 숫자와 그 주소가 속한 프로세스를 함께 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-818a-87b3-e0ba24f4e54c"
generated_by: "notion"
---
## 같은 주소인데 다른 값이 보이는 상황


앞 글의 바이트 해석에 이어 프로세스별 주소 공간을 정리했다. 두 프로그램이 모두 `0x00401000`을 읽어도 가상주소를 연결하는 표가 다르면 서로 다른 메모리를 읽을 수 있다. 주소의 숫자와 그 주소가 속한 프로세스를 함께 살펴봤다.


자료형을 정한 뒤에도 읽을 대상과 접근 조건이 남는다. 이번에는 주소 변환이 정하는 위치와 운영체제가 검사하는 권한을 나누어 예제를 따라갔다.


## 가상 주소 공간의 구조


Windows의 주소 공간 설명을 읽을 때는 주소로 표현할 수 있는 범위와 실제로 확보된 RAM을 분리하는 편이 도움이 됐다. 다음 표는 32비트 Windows에서 흔히 설명하는 기본 2GB/2GB 분할 예시다. 분할은 설정과 운영체제 조건에 따라 달라지며, 실제 RAM 상주량은 별도로 관리된다.


| 영역     | 주소 범위                       | 용도                   |
| ------ | --------------------------- | -------------------- |
| 사용자 영역 | `0x00000000` ~ `0x7FFFFFFF` | 프로세스의 코드, 데이터, 힙, 스택 |
| 커널 영역  | `0x80000000` ~ `0xFFFFFFFF` | 운영체제 커널이 사용          |


64비트 환경에서는 주소 범위가 더 넓어지지만 정확한 한계는 Windows 버전과 프로세스 조건에 따라 확인해야 했다. 여기서 필요한 것은 특정 상한을 외우는 일보다 사용자 주소와 커널 주소를 구별하는 일이었다.


[Microsoft의 주소 공간 설명](https://learn.microsoft.com/en-us/windows/win32/memory/virtual-address-space)을 기준으로 아래 예제도 사용자 공간의 서로 다른 매핑만 그렸다.


핵심은 각 프로세스의 주소 공간이 **사적(private)** 이라는 점이다. 프로세스 A의 `0x00401000`과 프로세스 B의 `0x00401000`은 이름만 같을 뿐, 물리 메모리에서는 서로 다른 영역에 매핑된다.


아래 예제처럼 서로 다른 물리 페이지에 매핑된 사적 메모리는 다른 프로세스의 저장 내용을 직접 덮어쓰지 않는다. 다만 운영체제가 허용한 공유 메모리는 같은 물리 페이지를 함께 매핑할 수 있으므로, 모든 페이지가 반드시 서로 다른 곳을 가리킨다고 일반화할 수는 없었다.


![k02-01.png](/images/notion/tech-k02/image-1.png)


그림 1. 같은 가상 주소가 프로세스별 페이지 테이블을 거쳐 서로 다른 물리 주소에 매핑되는 구조 (설명용 예제)


## 가상 주소에서 물리 주소로


가상 주소가 실제 물리 주소로 바뀌는 과정을 중개하는 것이 **페이지 테이블(page table)** 이다. 운영체제는 프로세스마다 별도의 페이지 테이블을 유지한다. CPU의 주소 변환은 페이지 테이블에 정해 둔 매핑을 따른다. 변환 결과가 TLB 캐시에 있으면 페이지 테이블을 다시 읽는 비용을 줄일 수 있다.


예를 들어 프로세스 A의 페이지 테이블에 `0x00401000 → 0x1A3000`이라는 매핑이 있다면, CPU는 물리 메모리 `0x1A3000`에서 데이터를 가져온다. 프로세스 B에서 같은 가상 주소 `0x00401000`을 참조하면, B의 페이지 테이블은 `0x5B7000` 같은 전혀 다른 물리 주소를 가리킨다.


프로세스별 변환 테이블은 주소 공간 격리의 기반이다. 테이블을 여러 단계로 나누는 이유와 TLB의 비용 절감 효과는 주소 변환을 더 자세히 다룰 후속 주제로 남겼다.


## 핸들: 다른 프로세스에 접근하는 통로


가상 주소 공간이 분리되어 있으므로, 한 프로세스가 다른 프로세스의 메모리를 읽으려면 운영체제를 거쳐야 한다. Windows에서 이 경로의 시작점이 **핸들(handle)** 이다.


`OpenProcess` 함수를 호출하면 대상 프로세스에 대한 핸들을 얻는다. 이때 어떤 작업을 할 것인지 접근 권한을 함께 요청해야 한다.


```c
HANDLE hProc = OpenProcess(
    PROCESS_VM_READ,   // 메모리 읽기 권한 요청
    FALSE,             // 핸들 상속 여부
    targetPid          // 대상 프로세스 ID
);
```


운영체제는 요청된 권한을 대상 프로세스의 보안 서술자(security descriptor)에 포함된 DACL(Discretionary Access Control List)과 대조한다. 일반적인 접근 검사는 호출자의 토큰과 요청한 권한을 함께 본다.


접근 거부는 `NULL`과 `ERROR_ACCESS_DENIED`로 확인하고, 다른 실패 원인도 오류 코드로 구분한다. 유효하지 않은 대상 등 다른 실패도 있으므로 반환값과 오류 코드를 함께 확인해야 했다.


핸들을 얻은 뒤에는 `ReadProcessMemory`를 사용해 대상 프로세스의 가상 주소를 지정하여 데이터를 읽을 수 있다.


```c
uint8_t buffer[4];
SIZE_T bytesRead = 0;
BOOL ok = ReadProcessMemory(hProc, (LPCVOID)0x00401000,
                            buffer, sizeof(buffer), &bytesRead);
// hProc의 유효성, ok와 bytesRead를 확인한 뒤에만 buffer를 해석한다.
// 사용을 마친 유효한 핸들은 CloseHandle(hProc)로 해제한다.
```


이 호출은 대상 프로세스의 가상 주소 `0x00401000`에서 4바이트를 읽어 `buffer`에 복사한다. 읽기 권한이 필요하고, 요청 범위의 페이지도 읽을 수 있어야 했다. 핸들 발급 성공과 실제 읽기 성공은 별개의 확인 지점이었다. 위 코드는 자신이 만든 테스트 프로세스의 읽기 흐름을 설명하는 발췌 예제다.


## 접근 권한 비트의 의미


`OpenProcess`에 전달하는 접근 권한은 비트 플래그다. 자주 쓰이는 프로세스 접근 권한을 정리하면 다음과 같다.


| 플래그                         | 값      | 의미                              |
| --------------------------- | ------ | ------------------------------- |
| `PROCESS_VM_READ`           | 0x0010 | `ReadProcessMemory`로 메모리 읽기     |
| `PROCESS_VM_WRITE`          | 0x0020 | `WriteProcessMemory`로 메모리 쓰기    |
| `PROCESS_VM_OPERATION`      | 0x0008 | 주소 공간 조작 (`VirtualProtectEx` 등) |
| `PROCESS_QUERY_INFORMATION` | 0x0400 | 토큰, 종료 코드, 우선순위 등 조회            |
| `PROCESS_TERMINATE`         | 0x0001 | `TerminateProcess`로 종료          |


비트 OR 연산으로 여러 권한을 조합한다. `PROCESS_VM_READ | PROCESS_VM_OPERATION`을 지정하면 `0x0018`이 되어, 메모리 읽기와 주소 공간 조작을 동시에 요청하는 셈이다. 이 값을 손으로 확인해 보면: `0x0010 | 0x0008`에서 겹치는 비트가 없으므로 단순히 더한 것과 같다.


`PROCESS_ALL_ACCESS`는 모든 접근 권한을 요청한다. 읽기만 필요한 도구에서는 쓰기나 종료 권한을 제외한 최소 권한으로 요청 범위를 줄일 수 있다. 수행할 작업과 권한을 대응시키면 거부된 작업의 조건도 좁혀 살펴볼 수 있다.


![readable-K02-02.png](/images/notion/tech-k02/image-2.png)


그림 2. 핸들 접근 검사와 실제 메모리 읽기를 나눈 개념도. 핸들을 얻어도 페이지 상태에 따라 읽기가 실패할 수 있다. 공식 API 계약을 바탕으로 직접 구성했다.


## 보호 프로세스와 접근 경계


일반 프로세스의 접근 검사만으로 모든 결과를 설명할 수는 없었다. Windows의 보호 프로세스는 메모리 읽기와 쓰기 같은 권한에 추가 제한을 둔다. 따라서 관리자 권한이나 디버깅 권한이 있다는 사실만으로 모든 프로세스에 대한 접근을 예상하면 어긋날 수 있다.


허용되는 작업은 [프로세스 보안과 접근 권한 문서](https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights)의 대상별 조건을 따로 확인하는 편이 맞았다.


## 확인 범위와 추가 검토


페이지 테이블은 주소가 연결되는 위치를, 핸들의 접근 권한과 페이지 상태는 읽기의 허용 조건을 정한다. 주소 해석과 접근 검사를 나누니 도구에서 기록할 대상 프로세스, 요청 범위, 반환값도 구분할 수 있었다.


주소 변환에서 매핑이 없거나 권한이 맞지 않을 때 운영체제가 처리하는 과정은 다음에 살펴볼 내용으로 남겼다. 페이지 테이블을 단계별로 나누는 구조와 각 단계에서 주소의 어떤 비트를 사용하는지도 이어서 정리할 주제다.


---


## 참고

- [Virtual Address Space - Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/memory/virtual-address-space)
- [Process Security and Access Rights - Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights)
- [OpenProcess function - Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocess)
- [Virtual Address Spaces (Windows drivers) - Microsoft Learn](https://learn.microsoft.com/en-us/windows-hardware/drivers/gettingstarted/virtual-address-spaces)

## 함께 읽기


먼저 읽을 글: [바이트, 자료형, 메모리 정렬 정리](https://blog.namuori.net/posts/tech-k01/)


이어 읽을 글: [CPU와 장치의 메모리 접근 경로](https://blog.namuori.net/posts/tech-k04/), [포인터를 이용한 메모리 구조 탐색](https://blog.namuori.net/posts/tech-s01/), [Windows 보호 기능의 역할과 확인 항목](https://blog.namuori.net/posts/tech-s03/), [Structly의 메모리 읽기와 구조체 구성](https://blog.namuori.net/posts/structly-memory-layout/)
