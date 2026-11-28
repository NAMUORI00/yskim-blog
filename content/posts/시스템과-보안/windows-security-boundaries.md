---
title: "Windows 메모리 접근과 보호 기능 정리"
date: 2026-09-06
draft: false
slug: "windows-security-boundaries"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "Windows 메모리 접근을 다루며 사용자 프로세스, 커널, 장치의 접근 경로를 구분했다. 각 경로가 어떤 보호 기능과 권한 검사를 거치는지 정리하고 환경별로 확인할 조건을 연결했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-81b8-8d6c-d61d04428f79"
generated_by: "notion"
---
Windows 메모리 접근을 다루며 사용자 프로세스, 커널, 장치의 접근 경로를 구분했다. 각 경로가 어떤 보호 기능과 권한 검사를 거치는지 정리하고 환경별로 확인할 조건을 연결했다.


## 구현과 확인 과정


Structly 글에 이어, 메모리 분석 도구가 실제로 대상 프로세스의 메모리를 읽으려면 운영체제 수준에서 어떤 접근 허가가 필요한지 정리해 봤다. 도구가 빌드되어 타입 해석 로직이 준비되어 있더라도, 운영체제가 접근을 허용하지 않으면 읽기 자체가 성립하지 않는다. 프로세스의 읽기 요청과 장치의 DMA 요청이 각각 어느 경계에서 검사되는지를 중심으로 살펴봤다.


![03-security-boundaries.png](/images/notion/windows-security-boundaries/image-1.png)


그림 1. Windows의 개념적 보호 경계. VBS, HVCI가 담당하는 격리된 코드 무결성과 IOMMU 기반 DMA 접근 제한은 서로 다른 보호 영역이다.


## 접근 경로별 보호 기능


프로세스는 운영체제 API와 핸들 권한을 거쳐 다른 프로세스의 메모리를 읽고, 장치는 DMA 경로로 호스트 메모리에 접근한다. 같은 물리 메모리를 향하더라도 검사 지점이 다르기 때문에, 접근 주체와 경로를 먼저 나누어 각 보호 기능이 어디에 해당하는지 대응시켜 봤다.


## 접근 주체와 검사 지점


관련 저장소에는 사용자 모드 분석 도구, 커널 실험 코드, PCIe DMA 자료가 나뉘어 있었다. 이 구분을 아래 보호 경계에 대응시켜 읽었다.


이 글에서 다루는 범위는 보호 기술의 역할 비교까지다. 각 보호 조합의 동작은 환경 설정과 실험 기록을 바탕으로 판단해야 한다. 구성 정보와 관측 로그가 없는 상태이므로, 특정 환경에서의 동작 결과를 확정하지는 않았다.


## 프로세스 권한과 커널 코드 무결성


사용자 모드에서 다른 프로세스의 메모리를 읽을 때는 보통 운영체제 서비스를 거친다. Windows의 `ReadProcessMemory` 경로에서는 프로세스 핸들에 필요한 접근 권한이 있어야 하고, 주소가 유효한지, 페이지를 읽을 수 있는지도 별개의 조건이다. 관리자 권한을 가지고 있다는 것만으로 모든 대상의 접근 조건이 충족되지는 않는다.


Structly의 `NativeCoreWrapper`는 `ReadRemoteMemory`라는 export에 호출을 연결하고 있었다. 래퍼 코드만으로는 그 뒤의 네이티브 구현이 동일한 시스템 호출을 사용하는지 알 수 없었다. 도구가 요청하는 기능과 운영체제가 실제로 처리하는 경로는 별도로 확인이 필요한 부분이다.


커널 드라이버는 일반 사용자 프로세스보다 강한 권한을 갖지만, 드라이버 하나가 로드된다고 모든 보호가 사라지지는 않는다. VBS와 HVCI는 커널 자체가 손상될 수 있다는 전제 아래 별도의 보호 경계를 두고 있다.


## VBS 기반과 HVCI의 구분


VBS는 하드웨어 가상화를 이용해 일반 운영체제와 격리된 보안 환경을 만드는 기반이다. HVCI(메모리 무결성)는 그 환경에서 커널 코드 무결성 검사를 보호하는 기능으로, 같은 페이지를 임의로 쓰고 실행할 수 있게 두지 않는 등 실행 코드에 대한 제약을 강화한다. VBS가 기반이고 HVCI는 그 기반 위에서 동작하는 보호 기능이라는 관계로 읽었다.


보호 범위는 해당 기능이 검사하는 커널 코드와 실행 조건을 기준으로 읽는다. 코드 실행 정책과 데이터의 의미적 올바름은 다른 문제이고, 정상적으로 허용된 드라이버의 논리 오류나 잘못된 데이터 처리까지 HVCI가 막지는 않는다. 기능이 설정되어 있는 것과 실제로 실행 중인 것 사이에도 차이가 있다.


[Microsoft 메모리 무결성 문서](https://learn.microsoft.com/en-us/windows/security/hardware-security/enable-virtualization-based-protection-of-code-integrity)


## Secure Boot와 취약 드라이버 차단 목록


Secure Boot는 부팅할 소프트웨어의 신뢰를 펌웨어 단계부터 확인하는 기술이다. 이후 Windows의 코드 무결성 정책이 드라이버 로드와 실행을 다룬다. 두 기능을 합쳐 "Secure Boot가 실행 중인 모든 메모리를 계속 검사한다"고 보면 각각의 역할이 섞이게 된다.


서명은 코드의 출처와 변조 여부를 확인하는 수단이다. 코드의 버그는 별도 검토와 테스트로 확인한다. 유효하게 서명된 드라이버에도 취약점은 있을 수 있다. 취약 드라이버 차단 목록은 이렇게 알려진 대상을 정책에 따라 차단하는 층이다. 목록에 없다는 것이 곧 안전하다는 판정은 아니며, 다른 코드 무결성 정책이 별도로 작동할 수 있다.


2026년 9월 1일 Microsoft는 적격 Windows 기기로 **메모리 무결성 보호를 확대**하는 계획을 발표했다. 실제 적용은 2026년 10월부터 예정되어 있고, 사용자가 명시적으로 끈 설정이나 관리 정책 등의 조건이 고려된다. 발표 시점과 적용 시점은 다르다.


이 발표는 블록리스트 확대 발표와는 범위가 다르다. 또한 발표 내용만으로 9월 현재 모든 PC에서 활성화되었다고 볼 수는 없다. [공식 발표](https://techcommunity.microsoft.com/blog/windows-itpro-blog/expanding-memory-integrity-protection-across-windows-devices/4551984)


## DMA와 IOMMU: 장치에서 들어오는 접근


DMA는 장치가 CPU의 일반적인 데이터 복사 경로를 매번 거치지 않고 메모리를 읽고 쓰는 기능이다. 저장장치와 네트워크 장치의 성능에 필요한 기능인 만큼, 여기서는 장치의 접근 범위를 어느 지점에서 제한하는지 함께 살펴봤다.


IOMMU는 장치의 메모리 접근에 주소 변환과 접근 제한을 적용한다. 프로세스별 가상 메모리가 CPU의 접근을 구분하듯, DMA remapping은 장치의 접근 범위를 구분한다. Windows Kernel DMA Protection이 동작하려면 지원 하드웨어, 펌웨어, 드라이버 조건이 갖추어져야 한다.


Kernel DMA Protection은 VBS와 동일한 기능이 아니며, Microsoft 문서에서도 VBS를 요구하지 않는다고 설명하고 있다. [Kernel DMA Protection 문서](https://learn.microsoft.com/en-us/windows/security/hardware-security/kernel-dma-protection-for-thunderbolt)


## 보호 기능의 적용 범위


| 보호 영역                        | 주된 판단                 | 그 자체로 보장하지 않는 것         |
| ---------------------------- | --------------------- | ----------------------- |
| 프로세스 접근 권한                   | 요청한 핸들 권한과 메모리 접근 조건  | 커널 내부의 모든 동작            |
| Secure Boot                  | 부팅 구성요소의 신뢰           | 실행 중인 데이터 전체의 무결성       |
| HVCI                         | 격리된 코드 무결성 검사와 실행 제약  | 허용된 코드의 모든 논리 오류 방지     |
| 취약 드라이버 차단 목록                | 알려진 위험 드라이버에 대한 정책 적용 | 목록에 없는 드라이버의 안전성        |
| IOMMU와 Kernel DMA Protection | 지원되는 장치 DMA 접근의 제한    | 모든 펌웨어와 장치 조합에 대한 자동 보호 |


## 비교 실험의 환경 기록


보호 기술을 비교하려면 운영체제 빌드, 펌웨어 상태, 관련 기능의 실행 상태, 드라이버 버전과 서명, 접근 요청과 오류 로그를 함께 기록해 둘 필요가 있다. "접근 실패"라는 결과만으로는 핸들 권한 부족인지, 잘못된 주소인지, 정책 차단인지 구분이 안 된다. 읽기 성공은 해당 접근 경로의 결과로 기록하며 다른 보안 경계는 각각 검증한다.


세 글을 이어 읽으면서, 바이트의 의미, 프로그램 사이의 계약, 운영체제의 접근 권한이 각각 별도로 확인이 필요한 영역이라는 점이 드러났다. 어느 하나를 확인한 것이 나머지를 설명하지는 않는다. 같은 환경을 다시 구성할 수 있는 기록 형식, 설정 상태를 실제 차단 로그에 연결하는 방법은 이후 살펴볼 항목으로 남아 있다.


![windows-memory-integrity-news.png](/images/notion/windows-security-boundaries/image-2.png)


그림 2. Peter Waxman, Windows IT Pro Blog, 2026-09-01. [메모리 무결성 보호 확대 발표](https://techcommunity.microsoft.com/blog/windows-itpro-blog/expanding-memory-integrity-protection-across-windows-devices/4551984)의 제목, 날짜 영역. 2026년 10월부터 적격 기기로 확대한다는 계획이다.


## 함께 읽을 내용


사용자 영역, 커널 영역과 프로세스 권한을 구분하는 정도에서 출발한다.


먼저 읽을 글: [파일 읽기로 살펴본 사용자 영역과 커널 영역](https://blog.namuori.net/posts/tech-k31/), [프로세스의 주소 공간과 접근 권한](https://blog.namuori.net/posts/tech-k02/), [Windows 보호 기능의 역할과 확인 항목](https://blog.namuori.net/posts/tech-s03/)


이어 읽을 글: [Structly 이름 변경과 파일, 플러그인 호환성 정리](https://blog.namuori.net/posts/structly-api-abi-compatibility/), [Windows 훅의 등록과 종료 흐름 정리](https://blog.namuori.net/posts/tech-01-04/)


## 참고

- [Structly 네이티브 호출 경계](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Core/NativeCoreWrapper.cs), 저장소 접근 권한 필요
- [memdriver-lab 저장소 개요](https://github.com/NAMUORI00/memdriver-lab/tree/92e80b0449b4aed70f00ff47e8c4203bd696cc10), 커널 실험 코드의 맥락 자료, 보호 조합별 검증 결과와는 구분

---


이전 글, [Structly 이름 변경과 파일, 플러그인 호환성 정리](https://blog.namuori.net/posts/structly-api-abi-compatibility/)


## 작업을 정리하며


접근 결과를 해석할 때는 성공과 실패를 관찰한 경로와 설정이 먼저 필요하다. Secure Boot, 코드 무결성, DMA 보호를 역할별로 나누면 점검할 위치가 명확해진다. 환경과 결과를 같은 기록에 남기는 기준으로 삼고 싶다.
