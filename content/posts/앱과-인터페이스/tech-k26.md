---
title: "UI 상태와 데이터 저장 과정"
date: 2025-04-05
draft: false
slug: "tech-k26"
categories:
  - "앱과 인터페이스"
tags:
  - "workflow"
summary: "UI에서 바꾼 값이 저장되고 다시 표시되는 과정을 정리했다. 화면 메모리, 브라우저 저장소, 서버는 서로 다른 위치다. 새로고침 뒤 값이 남는 경우에도 어떤 저장, 복원 경로를 거쳤는지 나누어 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8136-a837-e3da5b4454b3"
generated_by: "notion"
---
## 입력했는데 새로고침하면 사라지는 값


UI에서 바꾼 값이 저장되고 다시 표시되는 과정을 정리했다. 화면 메모리, 브라우저 저장소, 서버는 서로 다른 위치다. 새로고침 뒤 값이 남는 경우에도 어떤 저장, 복원 경로를 거쳤는지 나누어 살펴봤다.


## 메모리의 화면 상태


화면 상태(UI state)는 브라우저의 JavaScript 런타임이 메모리에 들고 있는 값이다. 변수에 담긴 배열, DOM에 추가된 요소, 입력 필드의 현재 값이 모두 여기에 해당한다.


```javascript
let todos = [];

function addTodo(text) {
  todos.push({ text, done: false });
  renderList();
}
```


`todos` 배열은 메모리에만 존재한다. `addTodo("우유 사기")`를 호출하면 화면에 항목이 보이지만, 탭을 닫거나 새로고침하면 JavaScript 실행 컨텍스트가 초기화되면서 빈 배열로 돌아간다. 화면에 보인다는 것과 저장되어 있다는 것 사이에는 이 간극이 있다.


모달이 열려 있는지, 드롭다운이 펼쳐져 있는지, 스크롤이 어디까지 내려갔는지도 화면 상태다. 이런 값은 새로고침 후에 복원할 필요가 없는 경우가 많다. 반면 사용자가 입력한 데이터는 소실되면 곤란하므로, 저장 경로가 필요하다.


## 데이터 저장 위치


값이 새로고침 이후에도 남으려면 브라우저 외부이거나 브라우저의 영속 저장소에 기록되어야 한다. 경로는 크게 세 가지로 나뉜다.


**서버 전송**: `fetch('/api/todos', { method: 'POST', body: ... })`로 서버에 보내고, 서버가 데이터베이스에 기록한다. 여러 기기에서 같은 데이터를 읽을 수 있는 경로지만, 서버의 저장 계약과 장애 처리까지 확인해야 한다.


**localStorage**: `localStorage.setItem('todos', JSON.stringify(todos))`로 브라우저 로컬 저장소에 쓴다. 같은 출처(origin)에서 탭을 닫아도 유지된다. 용량 제한이나 사용자 설정으로 쓰기가 실패할 수 있어 예외 처리가 필요하다.


**sessionStorage**: `sessionStorage`에 쓰면 같은 탭 안에서만 유지되고, 탭을 닫으면 사라진다. 화면 상태와 영속 저장 사이의 중간 지점에 해당한다.


![K26-01.png](/images/notion/tech-k26/image-1.png)


_그림 1. 화면 상태에서 서버 저장까지의 흐름: 저장 버튼을 누르기 전까지 데이터는 화면 상태에만 존재한다. 설명용 예제. 출처: 본문 예제를 바탕으로 직접 작성._


## CRUD 연산과 화면 갱신의 간격


서버 쪽 저장은 보통 CRUD(Create, Read, Update, Delete) 연산으로 정리된다. 화면에서 항목을 추가하면 Create, 목록을 불러오면 Read, 체크박스를 토글하면 Update, 항목을 지우면 Delete에 대응한다.


여기서 갈리는 지점이 있다. 체크박스를 누르자마자 서버에 Update 요청을 보내는 앱이 있고, 별도의 저장 버튼을 눌러야 보내는 앱이 있다. 전자는 매 조작마다 저장을 시도하지만 응답 전에는 두 상태가 다를 수 있고, 네트워크 오류 시 화면은 바뀌었는데 서버에는 반영되지 않는 불일치가 생길 수 있다. 후자는 저장 전까지 화면과 서버가 의도적으로 다르다.


화면 변경 이후에는 개발자 도구의 Network 탭에서 실제 요청과 응답을 대조할 수 있다. 202처럼 접수만 알리는 응답도 있어, 저장 완료의 의미는 코드뿐 아니라 본문과 API 계약까지 확인할 대상이다.


## 새로고침으로 경계를 확인하는 방법


새로고침은 복원 경로를 확인하는 출발점으로 정리했다. 저장소의 실제 값과 읽기 응답을 함께 비교하면 쓰기 실패와 복원 실패를 나누어 볼 수 있다.


`localStorage`를 쓰는 경우, 브라우저 개발자 도구의 Application 탭에서 저장된 키-값 쌍을 직접 확인할 수 있다. 서버 저장이라면 Network 탭에서 요청과 응답을 확인한다.


![readable-K26-02.png](/images/notion/tech-k26/image-2.png)


_그림 2. 저장 완료 확인과 이후 복원 확인을 나눈 흐름: 설명용 예제_


`sessionStorage`의 값은 새로고침에서는 유지되고 탭 종료 뒤 사라진다. 새로고침만으로는 `sessionStorage`와 `localStorage`의 보관 범위를 구분하기 어렵다는 점을 확인 조건에 추가했다.


탭 종료와 새 세션, 다른 기기의 읽기까지 구분해 확인할 필요가 있다. 브라우저 저장소 역시 사용자 삭제와 정책의 영향을 받으므로 백업과 같은 의미로 쓰지 않았다.


## 추가 확인 항목


화면 상태와 저장 상태를 나누어 값이 달라질 수 있는 위치를 정리했다. React의 `useState`와 서버 상태 관리, Vue의 반응형 객체와 API 호출 분리는 각 프레임워크 적용편에서 이어서 살펴볼 내용이다.


오프라인 저장 실패 후의 재시도와 서버, 로컬의 충돌 해결도 후속 내용으로 남겼다. 저장 요청과 실제 반영 결과를 연결하는 기록이 이 비교의 출발점이다.


**참고**

- [Web Storage API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [Client-side storage — MDN](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Client-side_storage)
- [Window: localStorage — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)

## 함께 읽기


이어 읽을 글: [Notion 콘텐츠의 저장과 사이트 반영](https://blog.namuori.net/posts/tech-s20/), [화면 초안과 서버 저장 상태 관리](https://blog.namuori.net/posts/tech-s23/), [Notion 콘텐츠의 블로그 문서 변환 과정](https://blog.namuori.net/posts/tech-11-01/), [명함 CMS의 미리보기와 배포 과정](https://blog.namuori.net/posts/tech-11-05/)


먼저 알아둘 내용: 브라우저의 구조, 표현, 동작, 상태 정리: 원고, 그림 작성 완료, Notion 연결 준비 중
