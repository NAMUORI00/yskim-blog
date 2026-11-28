---
title: "Structly 이름 변경과 파일, 플러그인 호환성 정리"
date: 2026-08-15
draft: false
slug: "structly-api-abi-compatibility"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "ReClass.NET을 포크해 이름을 바꾼 Structly가 기존 프로젝트 파일과 플러그인을 그대로 쓰는 방법을 다룬다. 화면에 보이는 이름과 내부 연결용 식별자를 나누어 호환성을 지키는 세 가지 계층을 문서와 코드로 확인한다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8170-9fb4-c56d915133df"
generated_by: "notion"
---
오픈소스 코드를 복제해 새 프로그램을 만드는 **포크**(fork) 과정에서 이름을 일괄 치환하면 기존 파일이나 확장 기능이 끊어지기 쉽다. 앞 글에서 다룬 `Structly`는 메모리 구조 분석 도구인 `ReClass.NET`을 포크해 만든 프로젝트다. 실행 파일 이름과 아이콘을 `Structly`로 바꾸더라도 예전에 저장한 프로젝트 파일은 그대로 열려야 한다. 외부에서 만든 확장 기능인 플러그인과 저수준 작업을 맡는 네이티브 모듈도 다시 빌드하지 않고 맞물려야 한다.


이를 위해 `Structly`는 사용자에게 보이는 표시 이름과 프로그램이 서로 연결될 때 찾는 식별자를 분리해 두었다. 저장소의 변경 문서(`FORK.md`)와 소스코드를 따라가며 플러그인, 네이티브 모듈, 저장 파일의 호환성을 어떻게 유지했는지 확인했다.


![Structly의 런타임 연결(기존 플러그인, IPluginHost, Structly 호스트, NativeCore.dll)과 저장 및 데이터 계약(프로젝트 파일, 사용자 설정, 클립보드 형식)을 나타낸 구조도](/images/notion/structly-api-abi-compatibility/image-1.png)


그림 1. Structly의 호환 경계 개념도. 실행 중에 맞물리는 관리 API와 네이티브 ABI 경로, 디스크와 메모리에 남는 프로젝트 파일과 설정, 클립보드 계약을 나누어 보여 준다.


## 표시 이름과 외부 식별자의 구분


이름을 바꾸면서도 기존 기능을 그대로 쓰려면 화면에 보이는 이름과 외부 연결에 쓰이는 식별자를 나누어야 한다. [포크의 변경과 보존 범위 문서](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/FORK.md)에는 새 이름으로 바꾼 항목과 기존 이름을 남긴 항목이 나란히 정리되어 있다. 실행 파일명(`Structly.exe`, `Structly_Launcher.exe`)과 버전(`4.0.0`), 작성자, 제품 메타데이터는 새 이름으로 바꿨다. 화면 제목인 UI 캡션과 아이콘(`Structly.ico`), 로컬 설정 폴더(`%LocalAppData%\Structly`)도 함께 바꿨다.


반면 프로젝트 파일 확장자와 내부 형식(`.rcnet`), 플러그인 폴더명(`Plugins`), 네이티브 코어 모듈명(`NativeCore.dll`)은 그대로 남겼다. .NET에서 컴파일된 결과물 단위인 **어셈블리**(assembly) 식별자(`ReClass.NET, 1.2.0.0`)도 기존 `ReClass.NET` 이름을 유지했다. 코드 안에서 기능을 묶어 분류하는 이름 공간인 호환성 네임스페이스(`ReClassNET.*`) 역시 바꾸지 않았다.


![변경한 표시 요소(Structly.exe, UI 캡션과 아이콘, 설정 폴더)와 유지한 호환 식별자(어셈블리, 네임스페이스, NativeCore.dll, .rcnet 확장자)를 좌우로 비교한 도식](/images/notion/structly-api-abi-compatibility/image-2.png)


그림 2. 포크 문서(`FORK.md`)에 정의된 변경 대상과 보존 대상 비교. 사용자에게 보이는 제품 표시는 Structly로 바꾸고, 외부 코드와 파일이 참조하는 식별자는 기존 이름을 유지했다.


두 대상을 나눈 기준은 외부 코드와 저장된 데이터가 무엇을 이름으로 찾아오는가에 있다. 화면 제목 줄에 적히는 제품명과 프로그램 내부의 어셈블리 식별자는 겉보기에 비슷해도 역할이 다르다. 어셈블리 이름을 바꾸면 기존 플러그인이 참조할 대상을 찾지 못하고, 네이티브 모듈의 파일명을 바꾸면 실행 중에 모듈을 읽는 동적 로더가 라이브러리를 불러오지 못한다.


파일 확장자 역시 운영체제에서 기본 연결 프로그램을 찾거나 파일 열기 창의 선택 필터를 걸 때만 쓰인다. 실제로 데이터를 읽어 들이는 일은 파일 안에 정보를 기록하는 구조인 스키마와 데이터를 저장 형태로 바꾸는 직렬화 규칙에 달려 있다. 심지어 실행 파일 이름도 외부 자동화 스크립트가 직접 호출하고 있을 수 있다. 따라서 화면에 보이는 이름이라고 해서 무조건 바꾸기보다, 어떤 외부 요소가 어느 식별자에 의존하는지 따져 보존 범위를 정해야 한다.


## 플러그인 연결과 어셈블리 식별자


앞에서 남긴 식별자 가운데 어셈블리 이름과 네임스페이스는 외부 플러그인이 호스트 프로그램과 연결할 때 쓰인다. 플러그인이 본체 역할을 하는 호스트 프로그램의 기능을 호출할 때는 [`IPluginHost`](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Plugins/IPluginHost.cs) 인터페이스를 거친다. 이처럼 .NET 실행 환경인 런타임이 관리하는 코드 사이에서 기능을 주고받도록 정해 둔 규칙을 **관리 API**라고 한다. `IPluginHost`는 `MainWindow`, `Resources`, `Process`, `Logger`, `Settings` 다섯 속성을 외부에 노출한다. 함께 작성된 별도의 계약 클래스에는 각 속성이 빈 값(`null`)이 아니라는 전제가 명시되어 있다.


```c#
Contract.Ensures(Logger != null);
```


`IPluginHost`가 속한 네임스페이스는 `ReClassNET.Plugins`다. 포크 과정에서 이 타입 이름과 `ReClass.NET` 어셈블리 식별자를 그대로 두어, 기존에 배포된 플러그인 바이너리가 다시 컴파일하지 않고도 호스트 타입을 찾도록 했다.


다만 어셈블리와 타입 이름이 맞아 참조가 연결된다고 해서 모든 플러그인의 동작이 보장되지는 않는다. 함수의 매개변수와 반환 타입 구성을 뜻하는 멤버 시그니처가 같아야 하고, .NET 런타임 버전과 함께 묶인 종속 라이브러리도 맞아야 한다. 호스트 프로그램이 실제로 기능을 실행하는 순서까지 일치해야 플러그인 호출이 온전히 성립한다. 위 코드의 `Contract.Ensures`처럼 코드에 적힌 계약 선언과 실제로 실행 중에 해당 검사가 켜져 있는지도 구분해서 봐야 한다.


## 네이티브 모듈 연결과 함수 규약


플러그인이 .NET 환경 안에서 연결되는 것과 달리, 다른 프로세스의 메모리를 읽고 쓰는 저수준 작업은 `NativeCore.dll` 모듈이 맡는다. 실행 중인 프로세스 목록을 열거하거나 메모리에 직접 접근하는 기능은 운영체제와 맞닿는 네이티브 코드로 작성되어 있다. C# 관리 코드의 [`NativeCoreWrapper`](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Core/NativeCoreWrapper.cs) 클래스는 `NativeCore.dll`이 외부에 공개한 export 함수를 실행 중에 동적으로 찾아 연결한다. 먼저 생성자에서 운영체제 API인 `GetProcAddress`를 호출해 네이티브 함수의 메모리 포인터 주소를 얻는다. 그다음 `Marshal.GetDelegateForFunctionPointer`로 그 주소를 C#의 함수 참조 객체인 델리게이트로 변환한다.


```c#
enumerateProcessesDelegate = GetFunctionDelegate<EnumerateProcessesDelegate>(handle, "EnumerateProcesses");
readRemoteMemoryDelegate = GetFunctionDelegate<ReadRemoteMemoryDelegate>(handle, "ReadRemoteMemory");
```


이 래퍼에는 프로세스 목록을 찾고 여는 `EnumerateProcesses`, `OpenRemoteProcess` 함수가 정의되어 있다. 다른 프로세스의 메모리를 읽고 쓰는 `ReadRemoteMemory`, `WriteRemoteMemory`까지 합쳐 모두 13개 함수의 시그니처가 고정되어 있다. 여기에는 함수 이름과 매개변수 타입, 호출 규약, 그리고 두 코드 사이에서 데이터 표현을 변환하는 **마샬링**(marshaling) 속성이 포함된다.


이처럼 컴파일된 바이너리끼리 메모리에서 함수와 데이터를 주고받는 저수준 규약을 **ABI**(Application Binary Interface)라고 부른다. `NativeCore.dll`이라는 파일 이름을 유지하는 것은 모듈을 불러오기 위한 첫 조건일 뿐이다. 실제 호환성이 성립하려면 13개 export 함수의 이름과 인자 배치, 반환값의 바이트 표현, CPU 아키텍처까지 모두 일치해야 한다.


![C# NativeCoreWrapper에서 GetProcAddress 동적 연결과 UnmanagedType.I1 마샬링을 거쳐 C++ NativeCore.dll의 ReadRemoteMemory 함수와 1바이트 반환값을 주고받는 과정](/images/notion/structly-api-abi-compatibility/image-3.png)


그림 3. NativeCoreWrapper와 NativeCore.dll 사이의 ABI 연결 및 반환값 마샬링 흐름.


`ReadRemoteMemoryDelegate`의 반환값에 붙어 있는 `[return: MarshalAs(UnmanagedType.I1)]` 속성이 이 경계를 잘 보여 준다. C# 코드 안에서는 참과 거짓을 나타내는 `bool` 값이지만, 네이티브 함수와 경계를 넘나들 때는 1바이트 정수(`I1`)로 값을 주고받는다는 약속이다. 만약 함수 이름과 인자 개수만 맞추고 반환값 마샬링 속성을 바꾸면, 함수 호출은 연결되더라도 메모리 읽기 성공 여부를 엉뚱하게 해석할 수 있다.


## 프로젝트 파일 형식과 왕복 저장


플러그인과 네이티브 모듈의 연결이 실행 중에 작동하는 약속이라면, 프로그램이 끝난 뒤에도 남는 약속은 프로젝트 파일 형식이다. `Structly`는 `.rcnet` 확장자와 ZIP 압축 파일 안에 XML 문서를 담는 기존 프로젝트 형식을 그대로 유지했다.


파일 호환성을 확인할 때는 기존에 만든 프로젝트 파일을 여는 것만으로는 충분하지 않다. 파일을 열어 편집한 뒤 다시 저장하고 그 파일을 다시 열었을 때 데이터가 보존되는 **왕복**(round-trip) 호환성이 지켜져야 한다. 이 과정에서 메모리 구조체 항목인 노드의 타입과 시작 위치로부터의 거리인 오프셋, 노드 사이의 참조 관계가 손실 없이 남아야 한다. 코드 안의 고유 식별자인 `ClassNode.Uuid`가 개별 노드를 구분하지만, UUID 값이 유지된다고 해서 전체 파일 형식의 호환성이 저절로 지켜지지는 않는다.


예를 들어 포크한 새 버전에서 새로운 노드 타입을 추가하면, 새 도구에서는 문제없이 저장해도 이전 버전 도구에서는 해당 타입을 인식하지 못한다. 알 수 없는 노드를 만났을 때 원본 데이터를 그대로 남겨 둘지, 경고를 띄우고 건너뛸지, 다른 타입으로 변환할지는 별도의 형식 정책으로 정해야 한다. 포크 문서에는 기존 파일 계약을 유지한다는 원칙이 적혀 있으나, 버전 조합에 따른 왕복 호환성은 실제 파일로 따로 검증해야 한다.


## 세 호환 계층과 오류 위치 구분


지금까지 살핀 관리 API, 네이티브 ABI, 파일 형식은 서로 다른 대상과 맞물리는 독립된 호환 계층을 이룬다. 관리 API는 플러그인 개발자가 호출하는 타입과 멤버의 약속이고, 네이티브 ABI는 컴파일된 바이너리가 메모리에서 값을 주고받는 약속이다. 파일 형식은 프로그램이 종료된 뒤 디스크에 기록된 데이터의 구조에 관한 약속이다.


![관리 API, 네이티브 ABI, 파일 포맷 계층별로 유지해야 할 대상과 호환성이 깨졌을 때 발생하는 문제 증상을 3행으로 정리한 도식](/images/notion/structly-api-abi-compatibility/image-4.png)


그림 4. 관리 API, 네이티브 ABI, 파일 포맷 세 호환성 계층의 보존 대상과 불일치 시 나타나는 증상.


사용자 눈에는 세 계층 가운데 어느 하나만 어긋나도 똑같이 프로그램이 동작하지 않는 것처럼 보인다. 하지만 계층을 나누어 두면 문제가 생겼을 때 원인을 찾을 위치가 분명해진다. 플러그인을 불러오지 못한다면 어셈블리 식별자나 `IPluginHost` API를 먼저 확인해야 한다. 모듈은 열리는데 읽어 온 메모리 값이 이상하다면 `NativeCoreWrapper`의 ABI와 마샬링 규칙을 의심할 수 있다. 파일 저장은 되지만 이전 버전 도구에서 열리지 않는다면 `.rcnet` 파일 내부의 XML 스키마 변경을 살펴봐야 한다.


## 결론


오픈소스 프로그램을 포크해 이름을 바꿀 때는 화면의 표시 이름과 외부 연결용 식별자를 분리해야 기존 파일과 확장 기능이 그대로 작동한다. 이번 글에서는 포크 문서(`FORK.md`)와 코드를 따라가며 관리 API, 네이티브 ABI, 파일 형식으로 나뉜 호환 계약과 설계 근거를 확인했다.


다만 대표 플러그인을 실제로 불러와 호출하는 검사와 네이티브 export 함수의 반환값 대조는 후속 과제로 남아 있다. 기존 프로젝트 파일을 열고 저장해 다시 여는 왕복 검증 역시 따로 진행해야 하며, 모든 플러그인을 대상으로 한 실행 검증은 이번 범위에 포함하지 않았다. 다음 글에서는 호환 계층이 준비되어 있어도 운영체제가 메모리 접근을 막는 조건으로 Windows의 사용자 모드 권한, 코드 무결성, DMA 보호를 다룬다.


## 함께 읽을 내용


API와 ABI의 차이, 원본과 포크의 변경 이력 관리 방식을 먼저 알고 있으면 호환 계약을 따라가기 수월하다.


먼저 읽을 글: [API, ABI와 호환성 정리](https://blog.namuori.net/posts/tech-k03/), [Git 포크, 브랜치와 변경 이력 비교](https://blog.namuori.net/posts/tech-k25/), [표시 이름과 저장 형식의 호환성](https://blog.namuori.net/posts/tech-s02/)


이어 읽을 글: [Structly의 메모리 읽기와 구조체 구성](https://blog.namuori.net/posts/structly-memory-layout/), [Windows 메모리 접근과 보호 기능 정리](https://blog.namuori.net/posts/windows-security-boundaries/)


## 참고

- [포크의 변경과 보존 범위 문서](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/FORK.md): 포크 변경 및 보존 범위 (저장소 접근 권한 필요)
- [플러그인 연결 인터페이스](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Plugins/IPluginHost.cs): 플러그인 호스트 인터페이스 (저장소 접근 권한 필요)
- [네이티브 코드 연결](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Core/NativeCoreWrapper.cs): 네이티브 ABI 래퍼 (저장소 접근 권한 필요)
