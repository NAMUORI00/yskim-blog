---
title: "브라우저의 구조, 표현, 동작, 상태 정리"
date: 2025-04-02
draft: false
slug: "tech-k40"
categories:
  - "앱과 인터페이스"
tags:
  - "workflow"
summary: "전송 버튼 예제 하나를 두고 HTML 구조, CSS 표현, JavaScript 동작, UI 대기 상태가 브라우저에서 어떻게 맞물리는지 살펴본다. 한 함수에 섞여 있던 역할을 CSS 클래스와 요소별 속성으로 나누는 과정을 다룬다."
cover: ""
canonical: ""
comments: false
notion_id: "3f4dcd44-779f-81f7-8f25-cd3ec78fcf3c"
generated_by: "notion"
---
웹 화면에 전송 버튼 하나를 만든다고 해 보자. 처음에는 버튼이 파란색으로 보이다가, 사용자가 누르면 회색으로 바뀌고 문구도 '전송 중…'으로 달라져야 한다. 처리 중에는 같은 버튼을 다시 눌러도 중복으로 실행되지 않게 막아야 한다. 기능 자체는 단순하지만, 이 안에는 화면에 버튼을 놓는 일, 색과 여백을 입히는 일, 클릭 입력을 받아 처리하는 일, 현재 대기 중인지 기억하는 일이 함께 들어 있다.


## 버튼 코드 한 조각에 섞여 있는 네 가지 역할


이 네 가지 일을 파일이나 계층으로 나누지 않고 한곳에 적으면 다음과 같은 코드가 된다.


```html
<button id="send" style="background: #3b82f6; color: white; padding: 8px 16px;">
  전송
</button>
<script>
  let pending = false;
  document.getElementById('send').addEventListener('click', function () {
    if (pending) return;
    pending = true;
    this.style.background = '#9ca3af';
    this.textContent = '전송 중…';
  });
</script>
```


이 예제는 버튼을 눌렀을 때 화면 표시를 바꾸고 중복 실행을 막는 데까지만 다룬다. 실제로 서버에 요청을 보내고 완료된 뒤 버튼을 원래대로 복구하는 과정은 생략했다. 짧은 코드지만 각 줄이 결정하는 대상은 서로 다르다.


| 역할 | 해당 부분                            | 결정하는 대상           |
| -- | -------------------------------- | ----------------- |
| 구조 | `<button id="send">전송</button>`  | 문서에 어떤 요소가 존재하는지  |
| 표현 | `style="background: #3b82f6; …"` | 요소가 화면에 어떻게 보이는지  |
| 동작 | `addEventListener('click', …)`   | 사용자 입력에 어떻게 반응하는지 |
| 상태 | `let pending = false`            | 현재 UI가 어떤 단계에 있는지 |


코드가 파일별로 나뉘어 있지 않더라도 문서의 뼈대를 선언하는 줄, 시각 스타일을 지정하는 줄, 클릭 이벤트를 받아 처리하는 줄, 진행 단계를 기록하는 변수는 역할이 뚜렷이 구분된다. 이 네 가지 역할이 브라우저 안에서 각각 어떻게 동작하는지 차례대로 따라가 본다.


## 구조: HTML이 선언하는 것과 DOM이 만드는 것


`<button id="send">전송</button>` 한 줄은 문서에 식별자가 `send`인 버튼을 하나 두고, 그 안에 '전송'이라는 텍스트를 넣겠다는 선언이다. 브라우저는 이 HTML 문자열을 읽어 파싱한 뒤 메모리에 **DOM**(Document Object Model) 트리를 만든다. DOM은 문서를 노드(node) 단위의 나무 구조로 표현한 프로그래밍 인터페이스로, JavaScript가 요소를 찾거나 속성과 내용을 바꿀 때 거치는 통로가 된다([MDN — Introduction to the DOM](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)).


처음 페이지를 열었을 때는 HTML 소스와 DOM이 같아 보이지만 둘은 같은 대상이 아니다. 앞선 예제에서 버튼을 눌러 스크립트가 `this.textContent = '전송 중…'`을 실행하면 메모리에 있는 DOM 노드의 텍스트는 갱신되지만, 원본 HTML 문서는 그대로 남는다.


이 차이는 브라우저 개발자 도구에서 바로 대조해 볼 수 있다. Elements 패널은 스크립트가 수정한 결과까지 반영된 현재 DOM 트리를 보여 주고, Sources 패널은 브라우저가 불러온 소스 파일과 소스맵을 보여 준다. 서버가 처음 전달한 HTML 원문을 그대로 확인하려면 Network 패널의 응답 본문이나 브라우저의 '페이지 소스 보기'를 함께 보면 된다.


![HTML 소스가 파싱되어 DOM 트리가 되고 JavaScript가 textContent를 바꿔 DOM의 텍스트 노드만 '전송 중…'으로 갱신하는 과정을 나타낸 도식](/images/notion/tech-k40/image-1.png)


그림 1. HTML 소스를 파싱해 만든 DOM 트리에서 JavaScript가 텍스트 노드를 갱신하는 흐름(설명용 단순화 도식).


## 표현: 같은 구조를 다르게 보이게 하는 CSS


HTML 태그의 `style` 속성에 직접 적은 `background: #3b82f6`은 인라인 스타일이다. 이 시각 규칙을 외부 CSS 파일로 옮기면 문서 구조와 표현의 경계가 또렷해진다.


```css
/* send-button.css */
.send-btn {
  background: #3b82f6;
  color: white;
  padding: 8px 16px;
}
.send-btn.pending {
  background: #9ca3af;
  opacity: 0.7;
}
```


CSS는 **선택자**(selector)로 대상 DOM 노드를 찾고, **선언**(declaration)으로 색상이나 여백 같은 시각 속성을 지정한다. HTML 버튼에서 인라인 `style` 속성을 지우고 `class="send-btn"`만 붙여 두면, 평소에는 파란색 버튼으로 보이다가 `pending` 클래스가 추가될 때 회색 반투명 상태로 바뀐다. 문서 구조인 HTML 태그 구성을 바꾸지 않고도 화면 표현만 교체할 수 있다([MDN — Introduction to CSS syntax](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Syntax/Introduction)).


인라인 스타일과 클래스 기반 스타일의 차이는 관리할 요소가 늘어날 때 분명해진다. 인라인 스타일은 요소마다 색상 값을 직접 적어야 해서 버튼이 열 개면 열 곳을 모두 고쳐야 한다. 반면 클래스 규칙으로 분리해 두면 CSS 파일 한 곳만 수정해도 같은 클래스를 가진 모든 버튼에 즉시 반영된다.


![세 개의 버튼에 각각 인라인 스타일을 지정한 모습과 하나의 CSS 클래스 규칙으로 묶어 일괄 적용하는 모습을 비교한 도식](/images/notion/tech-k40/image-2.png)


그림 2. 요소마다 인라인 스타일을 직접 적는 방식과 CSS 클래스 규칙으로 표현을 분리하는 방식의 비교.


다만 버튼 색상을 회색으로 흐리게 바꾸는 표현과 실제로 클릭 입력을 막는 동작은 구분해야 한다. CSS에서 `pointer-events: none`을 주면 마우스 클릭은 막히지만, 키보드 초점 이동이나 스크립트를 통한 호출까지 차단하지는 못한다. 입력 자체를 막는 일은 시각 표현이 아니라 요소의 동작 제어에 해당하므로 버튼의 `disabled` 속성으로 처리하는 편이 의미에 맞다.


## 동작: 이벤트가 연결하는 입력과 반응


버튼이 클릭에 반응하는 과정은 JavaScript의 `addEventListener`가 담당한다. 이 메서드는 감시할 이벤트 종류와 그때 실행할 콜백 함수를 연결한다([MDN — EventTarget.addEventListener()](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)). 첫 예제에서는 `'click'`이 이벤트 타입이고, 두 번째 인자로 넘긴 함수가 콜백이다.


사용자가 버튼을 눌렀을 때 동작 코드가 실행되는 순서는 다음과 같다.

1. 사용자가 화면의 버튼을 누른다.
2. 브라우저가 `click` 이벤트 객체를 생성한다.
3. 해당 버튼에 등록된 클릭 콜백 함수가 실행된다.
4. 콜백 안에서 `pending` 변수 값을 확인해 이미 `true`면 함수를 바로 빠져나온다.
5. `pending`이 `false`면 값을 `true`로 바꾸고, 배경색 스타일과 버튼 텍스트를 갱신한다.

![사용자가 버튼을 클릭했을 때 브라우저와 클릭 콜백, 상태 변수 사이에서 일어나는 다섯 단계의 실행 순서와 DOM 갱신 과정을 나타낸 시퀀스 다이어그램](/images/notion/tech-k40/image-3.png)


그림 3. 클릭 이벤트가 발생했을 때 콜백 함수가 상태 확인과 변경, 스타일 수정, 텍스트 갱신을 차례로 처리하는 순서(설명용 시퀀스).


이 실행 흐름을 보면 클릭 콜백 함수 하나가 상태(`pending` 변경), 표현(`style.background` 변경), 구조에 속한 텍스트 노드(`textContent` 변경)를 모두 직접 다루고 있다. 작은 함수 하나가 네 가지 역할을 가로지르며 결합된 상태다.


## UI 상태와 처리 책임 나누기


첫 예제의 구조는 화면에 버튼이 여러 개로 늘어날 때 바로 한계를 드러낸다. `let pending = false`가 버튼 바깥에 하나만 선언되어 있어서, 버튼 하나만 눌러도 `pending`이 `true`가 되어 다른 버튼까지 모두 클릭이 막히기 때문이다. 게다가 콜백 안에서 색상 코드를 직접 대입하고 있어 디자인을 바꿀 때도 JavaScript 코드를 열어야 한다.


전역 변수를 공유하는 대신 각 DOM 요소에 상태를 연결하고, 시각 변화는 CSS 클래스에 맡기면 코드를 다음과 같이 바꿀 수 있다.


```javascript
document.querySelectorAll('.send-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    if (this.dataset.pending === 'true') return;
    this.dataset.pending = 'true';
    this.disabled = true;
    this.classList.add('pending');
    this.textContent = '전송 중…';
  });
});
```


JavaScript의 `dataset.pending`은 HTML 요소의 `data-pending` 속성에 대응한다. 대기 상태를 각 버튼 요소의 속성으로 저장하면 전역 변수 없이도 버튼마다 독립된 상태를 유지할 수 있다. 입력 차단은 `this.disabled = true`로 브라우저 기본 속성에 맡기고, 시각 변화는 `this.classList.add('pending')`으로 클래스만 붙여서 CSS 규칙이 처리하게 했다.


![전역 pending 변수를 공유해 버튼 B까지 잠기는 구조와 버튼별 data-pending 속성으로 버튼 A만 대기 상태가 되는 구조를 비교한 도식](/images/notion/tech-k40/image-4.png)


그림 4. 전역 변수 하나로 대기 상태를 공유할 때와 각 버튼 요소의 data-pending 속성으로 상태를 분리했을 때의 동작 차이.


실제 네트워크 요청을 연결할 때는 요청이 성공하거나 실패한 뒤 `finally` 블록 등에서 `dataset.pending`, `disabled`, `pending` 클래스, 버튼 문구를 원래 상태로 되돌려야 한다. 위 코드에서는 클릭 직후 상태가 전이되는 부분만 비교하기 위해 복원 경로는 생략했다.


이렇게 역할을 나누면 클릭 콜백이 직접 책임지는 범위가 줄어든다.


| 구분        | 변경 전 콜백                     | 변경 후 콜백                              |
| --------- | --------------------------- | ------------------------------------ |
| 대기 상태 관리  | 전역 `pending` 확인과 변경         | 요소별 `dataset.pending` 확인과 변경         |
| 입력 차단     | `if (pending) return`으로만 방어 | `this.disabled = true` 병행            |
| 시각 스타일 변경 | `style.background` 색상 직접 수정 | `classList.add('pending')`으로 CSS에 위임 |
| 문구 변경     | `textContent` 변경            | `textContent` 변경                     |


바뀐 코드에서는 대기 중일 때 버튼이 어떤 색으로 보일지를 CSS가 결정하고, JavaScript는 현재 상태에 맞춰 클래스를 붙이거나 떼는 역할만 맡는다. 색상을 고칠 때와 클릭 처리 로직을 고칠 때 열어 봐야 할 위치가 분리된 셈이다.


## 역할별 독립 점검과 남은 과제


구조, 표현, 동작, 상태가 서로 덜 얽혀 있을수록 프레임워크 없이 브라우저 개발자 도구만으로도 각 층을 따로 검증하기 쉬워진다([MDN — DOM Events](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Events)).

- **구조 점검**: JavaScript와 CSS를 모두 끈 상태에서 HTML 문서만 브라우저에 열어 본다. 버튼 요소가 제자리에 존재하고 '전송'이라는 기본 문구가 읽히면 구조는 제 역할을 하고 있다.
- **표현 점검**: JavaScript 코드는 그대로 두고 CSS 파일에서 `.pending` 클래스의 배경색만 다른 색으로 바꿔 본다. 스크립트를 건드리지 않고도 대기 상태의 화면 표시가 달라지면 표현이 제대로 분리된 것이다.
- **동작 점검**: 개발자 도구 콘솔에서 `document.getElementById('send').click()`을 실행해 콜백이 의도대로 상태를 바꾸는지 확인한다. 다만 이 호출은 마우스 포인터나 키보드 입력 전체를 대신하는 검증은 아니며, 이미 `disabled`가 된 버튼에서는 `click()`을 호출해도 이벤트가 발생하지 않는다.

버튼 하나만 독립적으로 바뀔 때는 이처럼 각 요소의 `data-*` 속성과 CSS 클래스 조합만으로도 상태를 무리 없이 다룰 수 있다. 하지만 전송 버튼을 누른 순간 입력창을 함께 비활성화하고 화면 상단에 진행 알림을 띄우는 것처럼, 상태 하나에 여러 DOM 요소가 동시에 맞물려 돌아가야 한다면 요소마다 속성을 흩어 두기 어렵다. 여러 요소가 공유하는 상태를 별도 객체로 모으는 방식과 화면 갱신 구조를 어떻게 연결할지는 다음 주제로 이어서 살펴볼 만하다.


---


**참고 자료**

- [MDN — Document Object Model (DOM)](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
- [MDN — Introduction to CSS syntax](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Syntax/Introduction)
- [MDN — EventTarget.addEventListener()](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
- [MDN — DOM Events](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Events)
