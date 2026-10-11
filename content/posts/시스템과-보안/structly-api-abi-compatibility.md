---
title: "Structly 이름 변경과 파일, 플러그인 호환성 정리"
date: 2026-08-15
draft: false
slug: "structly-api-abi-compatibility"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "Structly 포크의 이름과 화면을 바꾸는 작업에서 기존 파일과 플러그인의 호환 범위를 정리했다. 관리 API, 네이티브 ABI, 프로젝트 형식이 각각 다른 계약을 가져 표시 이름과 외부 식별자를 나누어 확인했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8170-9fb4-c56d915133df"
generated_by: "notion"
---
Structly 포크의 이름과 화면을 바꾸는 작업에서 기존 파일과 플러그인의 호환 범위를 정리했다. 관리 API, 네이티브 ABI, 프로젝트 형식이 각각 다른 계약을 가져 표시 이름과 외부 식별자를 나누어 확인했다.


## 구현과 확인 과정


Structly 포크의 이름과 아이콘 변경 기록을 읽으며, 기존 프로젝트 파일과 플러그인의 호환성에 영향을 주는 범위를 정리했다. 앞 글에서 살펴본 메모리 구조를 저장하고 다시 불러오는 과정도 외부 프로그램이 기대하는 이름과 형식에 연결되어 있었다. 포크의 변경 문서는 관리 API, 네이티브 ABI, 파일 포맷을 보존 대상으로 나누고 있었다.


`ReClass.NET`


![02-compatibility-roles.png](/images/notion/structly-api-abi-compatibility/image-1.png)


그림 1. Structly의 호환 경계. 실행 중 관리 API와 네이티브 ABI를 유지하는 경로, 프로젝트, 설정, 클립보드의 저장 계약을 구분했다.


## 이름 변경과 호환성 유지 범위


실행 파일의 표시 이름을 바꾸는 것과, 플러그인이 참조하는 어셈블리 이름이나 저장 파일 형식을 바꾸는 것은 영향 범위가 다르다. 포크 문서는 변경한 표시 요소와 유지한 계약을 구분해 두고 있었다. 이 글에서는 문서와 코드에서 확인한 선택 근거를 정리하며, 실제로 파일이 열리고 플러그인이 동작하는지는 별도 실행 검사 영역으로 남아 있다.


## 바꾼 것과 남긴 것의 기준


[포크의 변경과 보존 범위 문서](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/FORK.md)에 변경 범위가 정리되어 있다. 실행 파일명(`Structly.exe`, `Structly_Launcher.exe`), 버전(`4.0.0`), 작성자, 제품 메타데이터, UI 캡션, 아이콘(`Structly.ico`), 설정 폴더(`%LocalAppData%\Structly`)를 바꿨다.


반면 `.rcnet` 프로젝트 파일 확장자와 포맷, 플러그인 폴더명(`Plugins`), 네이티브 코어 모듈명(`NativeCore.dll`), 관리 어셈블리 식별자(`ReClass.NET, 1.2.0.0`), 호환성 네임스페이스(`ReClassNET.*`)는 그대로 유지되어 있었다.


이 구분의 기준은 외부 코드와 저장 데이터가 무엇에 의존하는가였다. UI에 표시되는 제품명과 외부에서 참조하는 어셈블리 식별자는 생김새가 비슷하지만 역할이 다르다. 어셈블리 이름을 바꾸면 기존 참조가 해소되지 않을 수 있고, 네이티브 모듈명을 바꾸면 로더의 탐색 대상이 달라진다.


확장자는 파일 연결과 선택 필터에 영향을 주며, 내부 데이터를 읽는 조건은 파일 형식의 호환성에 달려 있다. 실제 파일 호환성은 내부 스키마와 직렬화 규칙에 달려 있다.


실행 파일 이름도 외부 실행 스크립트가 참조할 수 있다. "화면에 보이는 이름은 자유롭게 바꿔도 된다"는 규칙보다, 보존 대상인 소비자를 구체적으로 열거하는 쪽이 더 정확하다고 보았다.


## API 계약: IPluginHost 인터페이스


[`IPluginHost`](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Plugins/IPluginHost.cs)는 플러그인이 호스트 프로세스에 접근할 때 사용하는 관리 인터페이스다.


`MainWindow`, `Resources`, `Process`, `Logger`, `Settings` 속성을 노출하며, 별도의 계약 클래스에서 속성의 non-null 전제를 표현한다.


```c#
Contract.Ensures(Logger != null);
```


인터페이스의 네임스페이스는 `ReClassNET.Plugins`다. 이 타입 이름과 어셈블리 식별자를 유지한 것은 기존 플러그인의 참조를 그대로 해소하기 위한 선택이었다. 다만 참조 해소만으로 모든 플러그인의 동작이 보장되지는 않는다. 멤버 시그니처, 런타임 버전, 종속 라이브러리, 호스트 동작까지 맞아야 실제 호출이 성립한다. 계약 선언과 런타임 검사 설정도 구분해서 읽었다.


## ABI 계약: NativeCoreWrapper의 13개 export


[`NativeCoreWrapper`](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Core/NativeCoreWrapper.cs)는 `NativeCore.dll`의 네이티브 export를 동적으로 찾아서 관리 델리게이트로 연결하는 래퍼다.


생성자에서 `GetProcAddress`로 함수 포인터를 얻고 `Marshal.GetDelegateForFunctionPointer`로 델리게이트를 만든다.


```c#
enumerateProcessesDelegate = GetFunctionDelegate<EnumerateProcessesDelegate>(handle, "EnumerateProcesses");
readRemoteMemoryDelegate = GetFunctionDelegate<ReadRemoteMemoryDelegate>(handle, "ReadRemoteMemory");
```


`EnumerateProcesses`, `OpenRemoteProcess`, `ReadRemoteMemory`, `WriteRemoteMemory` 등 13개 함수의 시그니처(매개변수 타입, 호출 규약, 마샬링 속성)가 이 래퍼에 고정되어 있다.


파일명 보존은 로딩 경로의 한 조건이고, 실제 호환성은 export 이름, 인자 배치, 반환값 표현과 아키텍처까지 일치해야 성립한다.


`ReadRemoteMemoryDelegate`의 반환값에 붙은 `[return: MarshalAs(UnmanagedType.I1)]`이 이를 잘 보여준다.


관리 코드에서는 단순한 `bool`이지만, 네이티브 경계에서는 몇 바이트를 어떤 표현으로 전달하는지가 계약의 일부가 된다. 함수 이름과 인자 개수만 맞추고 반환값 마샬링을 바꾸면 호출이 연결되어도 결과를 잘못 해석할 수 있다.


## 파일 포맷 계약과 왕복 문제


포크 정책은 `.rcnet` 확장자와 XML/ZIP 기반 프로젝트 형식을 유지하고 있었다. 파일을 여는 것뿐 아니라, 저장 후 다시 열었을 때 노드 타입, 오프셋, 참조 관계가 보존되는지가 확인 대상이다. `ClassNode.Uuid`는 객체 식별에 쓰이는 요소지만, UUID 하나로 전체 포맷의 호환성이 성립하지는 않는다.


새로운 노드 타입을 추가하면 새 도구에서는 저장할 수 있어도 이전 도구에서는 해당 타입을 인식하지 못할 수 있다. 알 수 없는 노드를 보존할지, 경고하고 건너뛸지, 마이그레이션할지는 별도 형식 정책에 해당한다. 포크 문서에는 기존 계약을 유지하는 방향이 기록돼 있다. 버전 조합별 왕복 호환성은 추가 검증이 필요하다.


## API, ABI, 파일 형식의 관계


API(관리 인터페이스), ABI(네이티브 함수 시그니처), 파일 포맷은 각각 독립된 호환성 계층이다. API의 비호환 변경은 호출 코드를 수정하게 만들고, ABI의 비호환 변경은 기존 바이너리 호출을 깨뜨리며, 파일 형식 변경은 변환 경로 유무에 따라 영향이 달라진다.


세 계층 중 하나만 깨져도 사용자 입장에서는 "호환이 안 된다"가 되지만, 포크 시점에서 어떤 계층을 보존할지 명시해 두면 변경이 미치는 범위를 예측할 수 있다.


API는 개발자가 호출하는 타입과 멤버의 약속이고, ABI는 컴파일된 코드가 값을 주고받는 약속이며, 파일 형식은 프로세스가 종료된 뒤에도 남는 약속이다.


세 경계를 나누면 "열리는데 값이 이상하다", "플러그인을 찾지 못한다", "저장은 되지만 이전 버전에서 읽지 못한다"라는 서로 다른 증상을 조사할 위치가 드러난다. Structly의 변경, 보존 범위 문서도 이런 구분을 남기려는 문서로 읽혔다.


## 파일과 플러그인의 호환성 확인


후속 검증으로는 대표 플러그인의 로드와 호출, 네이티브 export, 반환값 대조, 기존 프로젝트의 열기–저장–재열기가 남아 있다. 이 글에서 확인한 범위는 코드와 포크 문서에 기록된 호환 계약의 설계이며, 모든 플러그인을 대상으로 한 실행 검증은 포함되지 않았다.


다음 글에서는 호환되는 도구가 갖춰져 있어도 메모리 접근이 항상 허용되지는 않는 조건을 살펴본다. Windows의 사용자 모드 권한, 코드 무결성, DMA 보호가 각각 다른 경계에서 동작한다.


## 함께 읽을 내용


API와 ABI, 원본과 포크의 변경 이력을 구분하면 호환 계약을 읽기 수월하다.


먼저 읽을 글: [API, ABI와 호환성 정리](https://blog.namuori.net/posts/tech-k03/), [Git 포크, 브랜치와 변경 이력 비교](https://blog.namuori.net/posts/tech-k25/), [표시 이름과 저장 형식의 호환성](https://blog.namuori.net/posts/tech-s02/)


이어 읽을 글: [Structly의 메모리 읽기와 구조체 구성](https://blog.namuori.net/posts/structly-memory-layout/), [Windows 메모리 접근과 보호 기능 정리](https://blog.namuori.net/posts/windows-security-boundaries/)


## 참고

- [포크의 변경과 보존 범위 문서](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/FORK.md): 포크 변경, 보존 범위 (저장소 접근 권한 필요)
- [플러그인 연결 인터페이스](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Plugins/IPluginHost.cs): 플러그인 호스트 인터페이스 (저장소 접근 권한 필요)
- [네이티브 코드 연결](https://github.com/NAMUORI00/Structly/blob/7a621580083354efb5f9971e053112065d2f7c80/ReClass.NET/Core/NativeCoreWrapper.cs): 네이티브 ABI 래퍼 (저장소 접근 권한 필요)

---


이전 글, [Structly의 메모리 읽기와 구조체 구성](https://blog.namuori.net/posts/structly-memory-layout/)


다음 글, [Windows 메모리 접근과 보호 기능 정리](https://blog.namuori.net/posts/windows-security-boundaries/)


## 작업을 정리하며


이름 변경도 외부와 연결된 지점을 먼저 분류해야 한다. 파일을 열고 저장해 다시 여는 왕복 과정과 플러그인 로딩을 따로 확인하면 바꿔도 되는 이름의 범위가 드러난다. 변경 대상을 계약별로 나누는 방식이 유지보수에 유용하다.
