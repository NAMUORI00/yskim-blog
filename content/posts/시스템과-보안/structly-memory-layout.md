---
title: "Structly의 메모리 읽기와 구조체 구성"
date: 2026-08-15
draft: false
slug: "structly-memory-layout"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "메모리 분석 도구 Structly의 코드를 따라가며 바이트를 읽는 MemoryBuffer와 구조체를 묶는 ClassNode의 동작을 확인한다. 읽기 실패와 자료형 해석 오류, 컴파일러 패딩이 각 단계에서 어떻게 구분되는지 다룬다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8154-950e-dafb2abf4132"
generated_by: "notion"
---
메모리에 들어 있는 네 바이트 `00 00 80 3F`는 정수로 읽을 때와 소수점이 있는 실수로 읽을 때 전혀 다른 숫자가 된다. 다른 메모리 주소를 가리키는 값인 포인터의 일부로 볼 때도 의미가 달라진다. 반대로 분석 화면에 `0`이나 예상과 다른 값이 표시될 때도 원인은 두 가지로 나뉜다. 실행 중인 분석 대상 프로그램인 프로세스에서 바이트를 가져오지 못했거나, 가져온 바이트를 어긋난 자료형과 크기로 해석한 경우다.


`ReClass.NET`의 코드를 복제해 갈라져 나온(포크한) 메모리 분석 도구 Structly의 코드를 읽으며 이 두 오류를 각 계층에서 구분하는 과정을 따라가 봤다. Structly는 대상 프로세스에서 원시 바이트를 읽어 값의 변화를 비교하는 일을 `MemoryBuffer`에 맡긴다. 읽어 온 바이트는 `EndianBitConverter`로 자료형에 맞게 해석하고, `ClassNode`에서 여러 값을 묶어 구조체 모델을 구성한다.


![대상 프로세스에서 MemoryBuffer로 바이트를 읽고 EndianBitConverter로 타입을 해석해 ClassNode 구조체 모델을 구성하며 HasChanged로 변화를 비교하는 흐름도](/images/notion/structly-memory-layout/image-1.png)


그림 1. Structly의 바이트 버퍼, 자료형 해석, 구조체 모델과 변경 이력 검증의 관계.


## 원시 바이트 읽기와 변경 이력


첫 단계인 원시 바이트 읽기와 변경 이력 관리는 [`MemoryBuffer`](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Memory/MemoryBuffer.cs) 클래스가 맡는다. 이 클래스 안에는 현재 관측값을 담는 `byte[] data`와 직전 관측값을 담는 `byte[] historyData` 두 배열이 들어 있다.


`UpdateFrom(IRemoteMemoryReader, IntPtr)` 메서드가 호출되면 현재 `data`를 먼저 `historyData`로 복사한다. 이어서 대상 프로세스의 메모리를 읽어 새 바이트로 `data`를 채운다.


```c#
Array.Copy(data, historyData, data.Length);
ContainsValidData = reader.ReadRemoteMemoryIntoBuffer(address, ref data);
```


메모리 읽기에 실패하면 배열 전체를 `0`으로 채우고 유효성 표시인 `ContainsValidData` 플래그와 이력 플래그를 내린다. 이 동작 때문에 화면에 `0`이 표시될 때는 두 가지 경로를 구분해야 한다. 대상 프로세스의 메모리에 실제로 `0`이 들어 있는 경우와, 읽기에 실패해 버퍼가 `0`으로 초기화된 경우다. 화면에 보이는 숫자만으로는 둘을 구별할 수 없어서, `ContainsValidData` 플래그와 변경 이력의 유효성을 함께 확인해야 실제 값인지 읽기 실패인지 알 수 있다.


`Offset` 속성은 버퍼 안에서 현재 바이트 읽기를 시작할 위치를 제어한다. `HasChanged(offset, length)` 메서드는 `data`와 `historyData`를 바이트 단위로 비교해 값이 바뀌었는지 돌려준다. 사용자 인터페이스(UI)는 이 반환값을 받아 값이 바뀐 셀을 강조해 보여 준다. 다만 `HasChanged`는 두 시점의 관측값 사이에 차이가 있다는 사실만 알려 줄 뿐, 어떤 연산이 그 값을 바꿨는지까지는 나타내지 않는다.


![UpdateFrom 호출 시 data를 historyData로 복사한 뒤 읽기 성공 시 ContainsValidData를 켜고 HasChanged를 비교하며 실패 시 버퍼를 0으로 초기화하는 과정](/images/notion/structly-memory-layout/image-2.png)


그림 2. MemoryBuffer의 바이트 갱신과 읽기 성공 여부에 따른 값 해석 경로.


## 자료형 해석과 빌드별 포인터 폭


`MemoryBuffer`가 보관한 원시 바이트는 `ReadInt8`부터 `ReadDouble`까지의 기본 자료형(프리미티브) 읽기 메서드가 구체적인 숫자로 바꾼다. 여러 바이트를 나열하는 순서인 **엔디언**(endian) 변환은 내부의 `EndianBitConverter`가 담당한다.


메모리에 저장된 바이트 자체에는 어떤 자료형인지 이름이 적혀 있지 않다. 네 바이트 `00 00 80 3F`를 낮은 자릿수 바이트부터 앞에 저장하는 **리틀 엔디언**(little-endian) 방식으로 읽는 경우를 예로 들 수 있다. 같은 바이트를 32비트 정수로 해석하면 `1,065,353,216`이 되고, IEEE 754 단정도 실수로 해석하면 `1.0`이 된다. 이처럼 엔디언 설정이나 자료형에 따라 숫자가 달라지므로, 어떤 자료형이 맞는지 판단하려면 프로그램의 동작이나 인접한 필드, 반복 관측 결과를 단서로 삼아야 한다. 변수나 함수 이름이 담긴 디버그 심벌이나 소스 코드가 있다면 추정한 해석을 대조할 기준도 함께 생긴다.


읽기 메서드는 요청한 값의 끝 위치가 버퍼 배열의 상한을 넘으면 기본값(`0`)을 반환한다. 코드에는 읽기 시작 위치인 오프셋이 음수가 아니어야 한다는 `Contract.Requires(offset >= 0)` 선언도 들어 있다. 이 선언이 실행 중 실제 검사로 이어지는지는 Code Contracts 빌드 설정에 달려 있다. 실제 방어 범위를 파악하려면 코드의 배열 상한 검사와 계약 선언을 함께 봐야 한다.


운영체제와 환경에 따라 바이트 크기(폭)가 달라지는 포인터는 조건부 컴파일 지시문(`#if RECLASSNET64`)으로 분기한다.


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


`ReadIntPtr`과 `ReadUIntPtr` 모두 같은 분기를 거쳐 64비트 빌드에서는 8바이트, 32비트 빌드에서는 4바이트를 읽는다. 포인터 폭이 대상 프로세스가 아니라 분석 도구를 빌드한 아키텍처에 맞춰 컴파일 시점에 정해진다. 같은 소스 코드에서 32비트와 64비트 분석 도구를 각각 빌드할 수 있고, 두 빌드 모두 `.rcnet` 프로젝트 파일 형식을 쓴다. 하지만 파일을 열 수 있다는 것과 포인터를 같은 의미로 해석한다는 것은 별개의 문제다. 따라서 값을 해석할 때는 분석 도구의 빌드 아키텍처와 대상 프로세스의 아키텍처가 맞는지부터 확인해야 한다.


![00 00 80 3F 바이트를 ReadInt32로는 1,065,353,216, ReadFloat로는 1.0으로 읽고 ReadIntPtr은 RECLASSNET64 여부에 따라 8바이트와 4바이트로 분기하는 그림](/images/notion/structly-memory-layout/image-3.png)


그림 3. 리틀 엔디언 원시 바이트의 자료형별 해석 차이와 빌드 조건에 따른 포인터 폭 분기.


## 구조체 크기 계산과 컴파일러 패딩


개별 바이트를 자료형에 맞게 읽은 뒤에는 [`ClassNode`](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Nodes/ClassNode.cs)가 여러 자료형 노드를 묶어 하나의 구조체로 다룬다. 각 `ClassNode`에는 고유 식별자인 `Guid` 형식의 `Uuid`가 부여되며, `AddressFormula` 속성으로 분석을 시작할 메모리 주소 수식을 지정한다. 초기 주소 수식의 기본값에도 `#if RECLASSNET64` 분기가 적용되어 x64 빌드에서는 `0x140000000`, x86 빌드에서는 `0x400000`이 들어간다. 이 값은 편집기의 초기 주소 수식일 뿐이며, 실제 시작 주소인 이미지 베이스 주소는 대상 프로세스에서 확인해야 한다. 실행할 때마다 주소를 무작위로 배치하는 **ASLR**(Address Space Layout Randomization)과 모듈 로딩 상태에 따라 주소가 달라지기 때문이다. 또한 `Initialize()` 메서드가 초기에 `IntPtr.Size` 바이트만큼 공간을 할당하므로, 빈 클래스도 포인터 하나 크기를 차지한다.


구조체 전체 크기는 안에 포함된 자식 노드들의 크기를 모두 더해서 계산한다.


```c#
public override int MemorySize => Nodes.Sum(n => n.MemorySize);
```


중간에 있는 노드의 자료형이나 크기를 바꾸면 전체 크기뿐 아니라 그 뒤에 이어지는 필드의 시작 위치(오프셋)도 달라진다. 바이트를 보관하는 버퍼와 구조체 노드 트리가 분리되어 있어, 원시 바이트는 그대로 둔 채 노드 구성을 조정하며 어느 필드에서 위치가 어긋나는지 확인할 수 있다.


이때 필드 크기를 단순 합산한 값과 컴파일러가 메모리에 실제로 배치한 구조체 크기는 구분해서 봐야 한다. 컴파일러는 메모리 접근 기준을 맞추려고 각 필드의 주소를 자료형 크기의 배수에 정렬하며, 그사이에 빈 바이트인 **패딩**(padding)을 넣는다. 다음 표는 전형적인 64비트 기본 정렬을 가정한 설명용 예시다.


| 필드              | 크기   | 예시 오프셋 |
| --------------- | ---- | ------ |
| `flag: uint8`   | 1바이트 | 0      |
| 패딩              | 3바이트 | 1      |
| `count: uint32` | 4바이트 | 4      |
| `next: pointer` | 8바이트 | 8      |


세 필드의 크기만 더하면 13바이트지만, 4바이트 정수인 `count`를 오프셋 4에 맞추기 위해 오프셋 1부터 3바이트의 패딩이 들어가 전체 크기는 16바이트가 된다. 실제 배치 결과는 컴파일러의 정렬 옵션(packing)과 바이너리 수준 호환 규약인 **ABI**(Application Binary Interface)에 따라 달라진다. `ClassNode.MemorySize`의 합산식은 컴파일러 패딩을 자동으로 추론하지 않으므로, 분석자가 패딩까지 포함해 노드를 구성해야 대상의 실제 메모리 배치와 일치한다.


![flag 1바이트, count 4바이트, next 8바이트의 단순 합산 13바이트와 flag 뒤에 패딩 3바이트가 들어가 오프셋 4와 8에 정렬된 16바이트 구조 비교](/images/notion/structly-memory-layout/image-4.png)


그림 4. 필드 크기의 단순 합산(13바이트)과 3바이트 패딩을 포함한 64비트 정렬 배치(16바이트) 비교.


## 결론


지금까지 따라간 바이트 읽기와 자료형 해석, 구조체 구성은 Structly 작업대 화면을 뒷받침한다. 저장소에 있는 [Structly 작업대 화면](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/docs/images/structly-main.png)은 대상 프로세스가 연결되지 않은 초기 화면이다. 오른쪽 구조 탐색기와 왼쪽 편집 영역을 보여 주며, 저장소 접근 권한이 있어야 열람할 수 있다. 이 화면을 뒷받침하는 코드에서 `MemoryBuffer`는 원시 바이트의 유효성과 변경 이력을 맡고, 타입 읽기 메서드는 엔디언 변환과 빌드별 포인터 폭을 처리한다. `ClassNode`는 주소 수식과 자식 노드의 크기 합산을 담당하며, 이 세 계층이 역할을 나누어 읽기 실패와 자료형 해석 오류, 패딩 누락을 각 단계에서 구분한다. 메모리 보호 기능이 강화되어 읽을 수 있는 범위가 달라지더라도, 읽어 온 바이트가 유효한지 확인하고 사람이 구성한 구조 모델을 대조하는 검증 과정 자체는 그대로 남는다.


이번 코드 확인에서는 컴파일러 패딩이 달라지는 빌드 간 비교나 잘못된 주소의 표시 방식, 포인터 폭이 다른 빌드에서 저장한 프로젝트를 열었을 때의 동작까지는 확인하지 못했다. 다음 글에서는 이 구조와 플러그인 확장 기능을 포크 이후에도 그대로 유지하기 위한 호환 조건을 다룬다.


## 함께 읽을 내용


바이트와 엔디언, 메모리 정렬, 주소와 포인터를 구분하는 기본 개념을 전제로 구조 노드의 동작을 따라간다.


먼저 읽을 글: [바이트, 자료형, 메모리 정렬 정리](https://blog.namuori.net/posts/tech-k01/), [프로세스의 주소 공간과 접근 권한](https://blog.namuori.net/posts/tech-k02/), [포인터를 이용한 메모리 구조 탐색](https://blog.namuori.net/posts/tech-s01/)


이어 읽을 글: [Structly 이름 변경과 파일, 플러그인 호환성 정리](https://blog.namuori.net/posts/structly-api-abi-compatibility/)


## 참고

- [메모리 값 읽기](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Memory/MemoryBuffer.cs): 바이트 배열, 이력, 타입 읽기 (저장소 접근 권한 필요)
- [구조체 크기와 주소 계산](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Nodes/ClassNode.cs): 구조체 노드, 크기 합산, 주소 수식 (저장소 접근 권한 필요)
