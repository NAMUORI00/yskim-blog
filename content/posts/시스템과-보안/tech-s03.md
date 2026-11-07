---
title: "Windows 보호 기능의 역할과 확인 항목"
date: 2025-02-13
draft: false
slug: "tech-s03"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "Windows의 메모리 보호 기능을 사용자, 커널, DMA 접근 경로에 놓고 정리했다. 프로세스 권한, 커널 코드의 실행 조건, 장치의 접근 범위는 검사 위치가 다르다. 접근 실패를 해석할 때도 어느 경로에서 관찰한 결과인지 먼저 구분할 필요가 있었다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-812f-ab74-fcf44ef8c0b2"
generated_by: "notion"
---
## 메모리 접근 실패의 분류


Windows의 메모리 보호 기능을 사용자, 커널, DMA 접근 경로에 놓고 정리했다. 프로세스 권한, 커널 코드의 실행 조건, 장치의 접근 범위는 검사 위치가 다르다. 접근 실패를 해석할 때도 어느 경로에서 관찰한 결과인지 먼저 구분할 필요가 있었다.


Secure Boot, VBS, 메모리 무결성(HVCI), Kernel DMA Protection을 검사 대상과 시점으로 비교했다. 여기서 다룬 범위는 각 기능의 역할이며, 특정 장비에서의 우회나 비활성화 실험 결과는 포함하지 않았다.


## 부팅할 코드와 실행 중인 코드를 나누기


Secure Boot는 부팅 단계에서 실행할 구성요소를 신뢰 정책에 따라 검사하는 데 관계된다. 이를 프로세스의 모든 메모리 읽기 요청을 심사하는 기능으로 이해하면 역할이 뒤섞인다.


[Windows 부팅 보호 설명](https://learn.microsoft.com/en-us/windows/security/operating-system-security/system-security/secure-the-windows-10-boot-process)을 보며, 부팅의 신뢰 사슬과 운영체제가 올라온 뒤의 접근 검사를 구분했다.


VBS는 하드웨어 가상화를 이용해 보안 기능을 위한 격리 영역을 만드는 기반으로 읽었다. 메모리 무결성, 즉 HVCI는 그 기반 위에서 커널 코드 무결성 검사를 격리하는 기능이다. VBS라는 기반이 있다는 사실과 개별 보안 기능이 실제로 실행 중이라는 사실은 따로 확인해야 했다.


[Microsoft의 메모리 무결성 문서](https://learn.microsoft.com/en-us/windows/security/hardware-security/enable-virtualization-based-protection-of-code-integrity)는 이 관계와 호환성 조건을 확인하는 기준이 됐다.


![readable-S03-01.png](/images/notion/tech-s03/image-1.png)


그림 1. 부팅 신뢰 검사와 가상화 기반 코드 무결성의 역할을 구분한 개념도. 보호 기능의 역할에 초점을 맞춰 부팅 흐름을 단순화했다. 출처: Microsoft의 부팅 보호, 메모리 무결성 문서를 바탕으로 재구성.


드라이버 파일의 서명과 특정 환경에서의 로딩 성공은 나누어 읽었다. 서명 정책 외에도 차단 목록, 코드 호환성, 운영체제 설정이 관련된다. 로딩 실패 원인을 HVCI로 좁히려면 실패 기록에서 해당 검사 단계가 확인되어야 한다.


## CPU의 주소 변환과 장치의 주소 변환


사용자 프로그램이 CPU로 메모리를 읽는 경우에는 해당 프로세스의 주소 공간과 페이지 권한이 관계된다. 장치는 DMA를 통해 데이터를 옮길 수 있으므로, 사용자 프로그램의 페이지 접근 검사만으로 장치 경로까지 설명하기 어렵다. IOMMU는 장치가 접근할 수 있는 메모리를 매핑하고 제한하는 하드웨어 기반을 제공한다.


Kernel DMA Protection은 지원되는 시스템에서 장치의 DMA 접근을 제한하는 Windows 보호 기능이다.


[공식 문서](https://learn.microsoft.com/en-us/windows/security/hardware-security/kernel-dma-protection-for-thunderbolt)를 읽을 때는 IOMMU 지원, 드라이버의 DMA 리매핑 호환성, 연결 시점과 시스템 상태를 함께 보았다. 운영체제가 제어하기 전의 부팅 단계까지 이 기능 하나로 보호한다고 확대하지 않았다.


![S03-02.png](/images/notion/tech-s03/image-2.png)


그림 2. CPU와 장치의 메모리 접근에서 확인하는 경계를 나란히 놓은 설명용 도식. 모든 하드웨어 구성의 세부 동작을 나타내지는 않는다. 출처: Windows 가상주소, Kernel DMA Protection 문서를 바탕으로 재구성.


CPU와 장치가 같은 메모리에 접근해도 검사 주체와 조건은 다르다. CPU 경로의 읽기 성공을 장치 경로의 접근 가능성으로 일반화할 수 없고, 장치 접근 실패 역시 프로세스 권한 검사만으로 설명되지는 않는다.


## 보호 설정과 관측 결과 기록


설정과 관찰 결과를 남기는 형식도 나누어 보았다. 아래 네 칸은 확인한 조건과 아직 확인하지 않은 상태를 구분하기 위한 기록 예제다.


| 관찰 대상     | 남길 정보                 | 그 정보만으로 말하기 어려운 것 |
| --------- | --------------------- | ----------------- |
| 부팅 신뢰     | 기능 상태와 부팅 오류 기록       | 실행 중인 모든 코드의 안전성  |
| VBS와 HVCI | 지원, 설정, 실행 상태, 호환 오류  | 모든 드라이버의 무결점      |
| 프로세스 읽기   | 대상, 권한, 주소, 읽기 길이, 오류 | 장치 DMA의 허용 범위     |
| 장치 DMA    | 장치, 드라이버, 리매핑 조건      | 다른 장치와 부팅 단계의 보호  |


이 표에는 실제 측정 결과를 넣지 않았다. 지원 여부, 사용 설정, 현재 실행 상태를 구분해 기록하는 형식이다. 제품 이름이나 설정 화면의 한 항목으로는 전체 보호 상태가 드러나지 않는다는 점을 반영했다.


## 실패 지점의 후속 확인


실패 원인을 좁히는 자료는 접근 경로에 따라 달라진다. 드라이버 로딩에는 코드 무결성 이벤트와 로더 오류, 프로세스 읽기에는 권한과 주소 범위, 장치 접근에는 매핑 상태를 대응시켰다.


설정을 바꾼 전후의 결과를 비교할 때는 빌드와 드라이버 버전도 함께 남길 항목으로 두었다. 여러 조건이 바뀌면 결과 차이의 원인을 분리하기 어렵다. 프로젝트별 기록에서는 고정한 조건과 변경한 조건을 기준으로 확인 범위를 이어서 살펴볼 수 있다.


## 함께 읽기


먼저 읽을 글: [파일 읽기로 살펴본 사용자 영역과 커널 영역](https://blog.namuori.net/posts/tech-k31/), [프로세스의 주소 공간과 접근 권한](https://blog.namuori.net/posts/tech-k02/), [CPU와 장치의 메모리 접근 경로](https://blog.namuori.net/posts/tech-k04/)


이어 읽을 글: [Windows 메모리 접근과 보호 기능 정리](https://blog.namuori.net/posts/windows-security-boundaries/), [FPGA NVMe 구현의 요청 처리와 저장 구조](https://blog.namuori.net/posts/tech-01-06/)
