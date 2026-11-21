---
title: "CPU와 장치의 메모리 접근 경로"
date: 2025-01-29
draft: false
slug: "tech-k04"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "CPU와 장치가 메모리에 접근하는 경로를 나누어 읽었다. CPU의 가상주소와 장치의 접근 주소는 변환 체계가 다를 수 있다. MMU, DMA, IOMMU의 역할을 따라가며 같은 숫자의 주소를 그대로 전달할 수 있는 조건을 정리했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8107-a56c-e7570e451575"
generated_by: "notion"
---
## 같은 메모리를 서로 다른 경로로 읽는다


CPU와 장치가 메모리에 접근하는 경로를 나누어 읽었다. CPU의 가상주소와 장치의 접근 주소는 변환 체계가 다를 수 있다. MMU, DMA, IOMMU의 역할을 따라가며 같은 숫자의 주소를 그대로 전달할 수 있는 조건을 정리했다.


## CPU의 경로: 가상 주소와 MMU


CPU가 메모리에 접근할 때 사용하는 주소는 가상 주소(VA)다. 프로세스마다 독립된 가상 주소 공간을 갖고, MMU(Memory Management Unit)가 페이지 테이블을 참조해 물리 주소(PA)로 변환한다.


손계산으로 따라가 보자. 페이지 크기가 4KB(0x1000)이고 가상 주소 `0x0040_1A3C`가 들어오면, 페이지 번호는 `0x00401`이고 페이지 내 오프셋은 `0xA3C`다.


페이지 테이블에서 `0x00401` → 물리 프레임 `0x00123`이라는 매핑을 찾으면, 최종 물리 주소는 `0x00123A3C`가 된다. 페이지 테이블에 해당 항목이 없으면 페이지 폴트가 발생하고, 운영체제가 개입해 매핑을 만들거나 접근을 차단한다.


이 구조 덕분에 프로세스 A의 가상 주소 `0x0040_1000`과 프로세스 B의 같은 가상 주소가 서로 다른 물리 프레임을 가리킬 수 있다. 프로세스 격리의 기반이 여기에 있다.


## 장치의 직접 접근: DMA


DMA는 CPU가 데이터의 매 바이트를 직접 복사하는 부담을 줄이는 방식이다. 장치가 전송을 맡아도 CPU와 드라이버는 버퍼 준비, 매핑, 완료 처리에 관여한다. 데이터 복사와 전송 관리의 역할을 나누어 읽었다.


드라이버가 받은 DMA 주소를 장치에 전달하면 장치는 그 주소 체계로 전송한다. CPU 물리 주소와 같은 환경도 있지만 IOMMU나 호스트 브리지를 거치면 달라질 수 있다. 주소의 숫자보다 플랫폼의 매핑 조건이 기준이 된다.


여기서 문제가 드러난다. 장치가 내보내는 주소에 아무 제한이 없으면, 장치(또는 장치를 제어하는 펌웨어)가 임의의 물리 메모리 영역에 접근할 수 있게 된다. CPU 쪽은 MMU가 프로세스 격리를 보장하지만, 장치 쪽 경로에는 그에 대응하는 검사가 빠져 있는 셈이다.


## IOMMU: 장치를 위한 주소 변환과 격리


IOMMU(Input/Output Memory Management Unit)는 장치의 DMA 요청에 대해 CPU의 MMU와 비슷한 역할을 수행한다. 장치가 버스 주소를 요청하면 IOMMU가 자체 변환 테이블을 참조해 허용된 물리 주소로 바꿔준다. 테이블에 없는 주소를 요청하면 접근이 차단된다.


Intel 플랫폼에서는 이를 VT-d(Virtualization Technology for Directed I/O)라 부른다. [리눅스 커널 DMA 매핑 문서](https://docs.kernel.org/core-api/dma-api-howto.html)에 따르면, DMA API는 장치가 사용할 주소를 반환하며, 플랫폼에 따라 IOMMU 매핑이나 다른 처리가 필요할 수 있다.


IOMMU 하드웨어가 직접 주소를 할당하는 API라고 이해하기보다는 드라이버가 플랫폼별 주소 변환을 맡기는 인터페이스로 읽는 편이 정확했다. 이 과정을 통해 장치별로 접근 가능한 메모리 영역을 분리할 수 있다. 네트워크 카드는 수신 버퍼만, GPU는 프레임 버퍼만 접근하도록 제한하는 식이다.


![k04-01.png](/images/notion/tech-k04/image-1.png)


_그림 1. CPU 경로(MMU)와 장치 경로(IOMMU)의 주소 변환, 검사 지점 비교 (설명용 구조도)_


## 주소와 버퍼의 수명을 같이 읽기


수신 버퍼 하나의 준비 → 장치 전송 → 완료 확인 → CPU 처리 순서를 예제로 정리했다. 주소가 맞아도 전송이 끝나기 전에 버퍼를 재사용하면 데이터가 섞일 수 있다. 이 경로에서는 주소 변환 외에 동기화 조건이 필요하다.


![readable-K04-02.png](/images/notion/tech-k04/image-2.png)


그림 2. 수신 버퍼의 소유권과 수명을 따라간 설명용 예제. 실제 동기화, 해제 순서는 플랫폼과 DMA API의 계약을 따른다.


CPU의 캐시와 장치가 보는 데이터의 일치 여부도 별도로 남았다. 어떤 플랫폼은 캐시 일관성을 제공하지만, 다른 플랫폼에서는 명시적 동기화가 필요할 수 있다. 그래서 주소 하나를 얻었다는 사실만으로 전송 준비가 끝났다고 해석하지 않았다.


## 정리와 후속 검토


CPU는 MMU를 통해 가상 주소 → 물리 주소 변환과 프로세스 격리를 얻는다. 장치는 DMA 주소를 사용하고, 활성화된 변환, 격리 구성에 따라 IOMMU가 접근 경로를 제한할 수 있다.


`dma_map` 계열 호출은 드라이버가 플랫폼별 매핑 조건을 다루는 지점으로 읽었다. IOMMU도 하드웨어 기능의 존재와 운영체제가 해당 장치에 적용한 보호 상태를 나누어 확인할 항목이다.


가상 머신에 장치를 직접 할당(passthrough)할 때 게스트 물리 주소와 호스트 물리 주소 사이의 IOMMU 매핑은 다음 주제로 남겼다.


---


**참고**

- [Dynamic DMA mapping Guide — Linux Kernel Documentation](https://docs.kernel.org/core-api/dma-api-howto.html)
- [Using IOMMU for DMA Protection in UEFI Firmware — Intel White Paper](https://www.intel.com/content/dam/develop/external/us/en/documents/intel-whitepaper-using-iommu-for-dma-protection-in-uefi-820238.pdf)
- [AArch64 Memory Management Guide — ARM Developer](https://developer.arm.com/documentation/101811/latest/)

## 함께 읽기


먼저 읽을 글: [프로세스의 주소 공간과 접근 권한](https://blog.namuori.net/posts/tech-k02/), [파일 읽기로 살펴본 사용자 영역과 커널 영역](https://blog.namuori.net/posts/tech-k31/)


이어 읽을 글: [Windows 보호 기능의 역할과 확인 항목](https://blog.namuori.net/posts/tech-s03/), [FPGA NVMe 구현의 요청 처리와 저장 구조](https://blog.namuori.net/posts/tech-01-06/)
