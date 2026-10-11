---
title: "Structly의 메모리 읽기와 구조체 구성"
date: 2026-08-15
draft: false
slug: "structly-memory-layout"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "Structly에서는 포크한 메모리 분석 도구의 메모리 읽기와 구조체 표시를 정리했다. 원시 바이트를 가져오는 경로와 타입을 해석하는 노드가 분리돼 있어, 읽기 오류와 해석 차이를 각 계층에서 확인하는 데 초점을 맞췄다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8154-950e-dafb2abf4132"
generated_by: "notion"
---
Structly에서는 포크한 메모리 분석 도구의 메모리 읽기와 구조체 표시를 정리했다. 원시 바이트를 가져오는 경로와 타입을 해석하는 노드가 분리돼 있어, 읽기 오류와 해석 차이를 각 계층에서 확인하는 데 초점을 맞췄다.


## 구현과 확인 과정


`ReClass.NET` 포크인 Structly의 코드를 읽으며, 원시 바이트를 읽는 버퍼와 타입을 해석하는 노드가 분리된 구조를 따라가 봤다. 같은 메모리 바이트라도 정수로 읽을 때와 포인터로 읽을 때 의미가 달라지는데, 이 도구는 바이트 취득과 타입 해석을 별도 계층으로 나눠서 오류 원인을 좁힐 수 있게 해 두고 있었다.


![01-memory-roles.png](/images/notion/structly-memory-layout/image-1.png)


그림 1. 바이트 관측, 타입 해석, 구조 모델과 검증의 관계. 관측한 바이트와 사용자가 지정, 추정한 타입을 구분한 그림이다.


## 바이트 읽기와 타입 해석의 분리


메모리 읽기 오류는 두 단계에서 생길 수 있다. 대상 프로세스에서 바이트를 가져오지 못한 경우와, 가져온 바이트를 다른 자료형으로 해석한 경우다. 버퍼와 타입 노드가 분리된 현재 구조에서는 두 단계를 따로 확인할 수 있었고, 이 구분을 기준으로 아래 코드를 읽었다.


## 읽어 온 바이트와 이전 값을 보관하기


[`MemoryBuffer`](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Memory/MemoryBuffer.cs)에는 `byte[] data`와 `byte[] historyData` 두 배열이 들어 있었다.


`UpdateFrom(IRemoteMemoryReader, IntPtr)` 호출 시 현재 데이터를 `historyData`로 복사한 뒤 대상 프로세스에서 새 바이트를 읽어 온다. 읽기에 실패하면 배열을 0으로 채우고 이력 플래그를 내린다.


```c#
Array.Copy(data, historyData, data.Length);
ContainsValidData = reader.ReadRemoteMemoryIntoBuffer(address, ref data);
```


`Offset` 속성이 현재 읽기 시작 위치를 제어하고, `HasChanged(offset, length)`는 `data`와 `historyData`를 바이트 단위로 비교해서 값 변경 여부를 돌려준다. UI에서 변경된 셀을 강조 표시할 때 이 반환값을 사용하는 구조였다.


## 타입 읽기와 포인터 분기


`ReadInt8`부터 `ReadDouble`까지 프리미티브별 메서드가 있었고, 바이트 순서 변환은 `EndianBitConverter`가 담당하고 있었다. 읽을 값의 끝 위치가 배열 상한을 넘으면 기본값(0)을 반환한다.


`Contract.Requires(offset >= 0)` 선언이 있었는데, 이것이 실행 중 검사로 이어지는지는 Code Contracts 빌드 설정에 달려 있다. 코드의 상한 검사와 계약 선언을 함께 봐야 실제 방어 범위를 알 수 있었다.


포인터 크기가 플랫폼에 따라 달라지는 부분은 조건부 컴파일로 분리되어 있다.


```c#
public IntPtr ReadIntPtr(int offset)
{
#if RECLASSNET64
    return (IntPtr)ReadInt64(offset);
#else
    return (IntPtr)ReadInt32(offset);
#endif
}
```


`ReadIntPtr`, `ReadUIntPtr`에는 같은 분기가 적용되고, 포인터 폭은 빌드 시점에 결정되고 있었다. 포인터 폭은 분석 도구를 빌드한 아키텍처에 맞춰 정해진다. 따라서 값을 해석할 때는 분석 도구의 빌드 아키텍처와 대상 아키텍처가 맞는지도 확인 항목에 들어간다.


## 타입 노드를 묶어 구조체 크기 계산하기


[`ClassNode`](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Nodes/ClassNode.cs)는 타입 노드를 담는 최상위 컨테이너였다. 구조체 전체 크기는 자식 노드의 크기 합으로 계산된다.


```c#
public override int MemorySize => Nodes.Sum(n => n.MemorySize);
```


각 `ClassNode`에는 `Guid` 형식의 `Uuid`가 부여되어 있었고, `AddressFormula`로 분석 시작 주소를 지정한다. x64 빌드 기본값은 `0x140000000`, x86은 `0x400000`이었다.


편집기의 초기 주소 수식이며, 실제 이미지 베이스는 대상 프로세스에서 확인해야 한다. ASLR과 로딩 상태에 따라 실제 주소는 달라질 수 있다. `Initialize()`는 `IntPtr.Size` 바이트만큼 초기 공간을 할당하고 있어서, 빈 클래스도 포인터 하나 크기를 차지했다.


## 버퍼, 타입, 구조 노드의 역할


바이트를 읽는 부분과 해석하는 부분이 나뉘어 있어, 오류를 확인할 위치도 두 단계로 나누어 볼 수 있었다. 엔디언을 바꾸면 표시되는 값이 달라지고, 노드의 타입과 크기를 바꾸면 이후 필드의 위치도 달라질 수 있다. 계층 분리는 이런 영향을 없애기보다 전달 경로를 드러내는 설계로 읽혔다.


`MemoryBuffer`는 원시 바이트와 이력만 관리하고, 타입 메서드는 `EndianBitConverter`를 통해 바이트 순서를 처리하며, `ClassNode`는 노드 트리의 크기 합산과 주소 수식을 담당하고 있었다.


`#if RECLASSNET64` 조건부 컴파일은 포인터 읽기뿐 아니라 기본 주소에도 적용되어 있었다. 같은 소스에서 32비트와 64비트 분석 도구를 각각 빌드할 수 있고, 두 빌드 모두 `.rcnet` 형식을 사용한다. 다만 파일을 읽을 수 있다는 것과 포인터를 같은 의미로 해석한다는 것은 별개 문제다.


## 자료형별 바이트 해석


`00 00 80 3F`라는 네 바이트를 little-endian으로 읽으면 32비트 정수로는 1,065,353,216, IEEE 754 단정도 실수로는 1.0이다. 바이트 자체에는 타입 이름이 없어서, 해석의 단서는 프로그램 동작, 인접 필드, 반복 관측에서 찾게 된다. 디버그 심벌과 소스가 있다면 그 해석을 대조할 기준도 함께 생긴다.


코드상 0으로 표시될 수 있는 경로도 나누어 읽어 봤다. 대상 메모리에 실제 0이 있는 경우와, 읽기 실패로 버퍼가 0으로 초기화된 경우다. 화면에 보이는 숫자만으로는 둘을 구분할 수 없고, `ContainsValidData` 플래그와 변경 이력 유효성을 함께 확인해야 구분된다. `HasChanged` 역시 두 관측 사이에 차이가 있다는 뜻이지, 어떤 연산이 값을 바꿨는지까지 알려 주지는 않는다.


## 패딩과 실제 구조체 크기


구조체 크기를 볼 때는 필드 크기 합과 컴파일러가 배치한 실제 크기를 구분할 필요가 있었다. 다음은 전형적인 64비트 기본 정렬을 가정한 설명용 예시다.


| 필드              | 크기   | 예시 오프셋 |
| --------------- | ---- | ------ |
| `flag: uint8`   | 1바이트 | 0      |
| 패딩              | 3바이트 | 1      |
| `count: uint32` | 4바이트 | 4      |
| `next: pointer` | 8바이트 | 8      |


필드 자체의 크기 합은 13바이트지만 이 배치에서는 전체 16바이트가 된다. packing 옵션과 ABI에 따라 결과가 달라진다. `ClassNode.MemorySize`의 합산식은 컴파일러 패딩을 자동 추론하지 않으므로, 분석자가 패딩을 포함한 노드 구성을 직접 맞춰야 대상의 실제 레이아웃과 일치한다.


## 추가로 확인할 메모리 조건


Structly의 핵심은 관측한 바이트와 사람이 구성한 구조 모델을 연결하는 데 있었다. 메모리 보호가 강화되어 읽을 수 있는 범위가 달라지더라도, 읽어 온 바이트의 의미를 검증하는 과정 자체는 그대로 남는다.


패딩이 달라지는 빌드 간 비교, 잘못된 주소의 표시 방식, 포인터 폭이 다른 프로젝트를 열었을 때의 동작은 아직 확인하지 못한 부분이다. 다음 글에서는 이 구조와 도구 확장 기능을 포크 이후에도 유지하기 위한 호환 계약을 살펴본다.


![structly-main.png](/images/notion/structly-memory-layout/image-2.png)


그림 2. Structly 저장소의 작업대 화면. 대상 프로세스가 연결되지 않은 초기 화면이며, 오른쪽 구조 탐색기와 왼쪽 편집 영역을 보여 준다. [원본](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/docs/images/structly-main.png), 저장소 접근 권한 필요.


## 함께 읽을 내용


바이트, 엔디언, 정렬과 주소, 포인터를 구분하는 정도를 전제로 구조 노드를 따라간다.


먼저 읽을 글: [바이트, 자료형, 메모리 정렬 정리](https://blog.namuori.net/posts/tech-k01/), [프로세스의 주소 공간과 접근 권한](https://blog.namuori.net/posts/tech-k02/), [포인터를 이용한 메모리 구조 탐색](https://blog.namuori.net/posts/tech-s01/)


이어 읽을 글: [Structly 이름 변경과 파일, 플러그인 호환성 정리](https://blog.namuori.net/posts/structly-api-abi-compatibility/)


## 참고

- [메모리 값 읽기](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Memory/MemoryBuffer.cs): 바이트 배열, 이력, 타입 읽기 (저장소 접근 권한 필요)
- [구조체 크기와 주소 계산](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Nodes/ClassNode.cs): 구조체 노드, 크기 합산, 주소 수식 (저장소 접근 권한 필요)

---


다음 글, [Structly 이름 변경과 파일, 플러그인 호환성 정리](https://blog.namuori.net/posts/structly-api-abi-compatibility/)


## 작업을 정리하며


메모리 도구에서는 관측한 바이트와 부여한 타입을 함께 보여 주어야 해석 과정을 따라갈 수 있다. 주소 공간과 포인터 크기를 명시하면 같은 파일을 다른 빌드에서 열 때의 차이도 설명하기 쉽다. 호환성 검토에서도 이 구분을 유지하려 한다.
