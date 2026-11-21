---
title: "브라우저의 구조, 표현, 동작, 상태 정리"
date: 2025-04-02
draft: false
slug: "tech-k40"
categories:
  - "앱과 인터페이스"
tags:
  - "workflow"
summary: "버튼 하나의 코드에서 HTML 구조, CSS 표현, JavaScript 동작, 대기 상태를 나누어 정리했다. 화면에 버튼을 놓는 일과 클릭을 처리하는 일은 다른 역할이다. 입력 이후 표시와 상태가 바뀌는 순서를 따라갔다."
cover: ""
canonical: ""
comments: false
notion_id: "3f4dcd44-779f-81f7-8f25-cd3ec78fcf3c"
generated_by: "notion"
---
버튼 하나의 코드에서 HTML 구조, CSS 표현, JavaScript 동작, 대기 상태를 나누어 정리했다. 화면에 버튼을 놓는 일과 클릭을 처리하는 일은 다른 역할이다. 입력 이후 표시와 상태가 바뀌는 순서를 따라갔다.


## 버튼 하나로 네 역할 구분하기


아래 코드에는 구조, 표현, 동작, 상태라는 네 가지 역할이 섞여 있다.


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


예제는 클릭 뒤 표시를 바꾸는 범위다. 실제 요청과 완료 후 복구는 생략되어 있다. 짧은 코드 안에서 네 역할이 어느 줄에 놓였는지 살펴봤다.


| 역할 | 해당 부분                            | 무엇을 결정하는가         |
| -- | -------------------------------- | ----------------- |
| 구조 | `<button id="send">전송</button>`  | 문서에 어떤 요소가 존재하는지  |
| 표현 | `style="background: #3b82f6; …"` | 요소가 눈에 어떻게 보이는지   |
| 동작 | `addEventListener('click', …)`   | 사용자 입력에 어떻게 반응하는지 |
| 상태 | `let pending = false`            | 현재 UI가 어떤 단계에 있는지 |


역할별로 파일이 나뉘어 있지는 않아도 각 줄이 바꾸는 대상을 구분할 수 있었다. 이후의 분리는 이 대응을 기준으로 읽었다.


## 구조: HTML이 선언하는 것과 DOM이 만드는 것


`<button id="send">전송</button>` 한 줄은 "이 문서에 버튼이 하나 있고, 식별자는 send이며, 안에 '전송'이라는 텍스트가 들어간다"는 선언이다. 브라우저는 이 선언을 파싱하여 DOM 트리를 만든다.


DOM은 문서를 노드 트리로 표현한 프로그래밍 인터페이스로, JavaScript가 요소를 찾거나 속성을 바꿀 수 있는 통로가 된다([MDN — Introduction to the DOM](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)).


HTML 소스와 DOM은 같은 내용처럼 보이지만 동일하지 않다. 스크립트가 `textContent`를 바꾸면 DOM 노드는 갱신되지만 원본 HTML 파일은 그대로 남는다. 이 차이를 확인하려면 브라우저 개발자 도구에서 Elements 패널과 Sources 패널을 나란히 열어보면 된다.


Elements는 현재 DOM을 보여주고, Sources에서는 로드한 소스와 소스맵 등을 볼 수 있다. 서버가 전달한 HTML 자체를 대조하려면 Network의 응답이나 페이지 소스 보기도 함께 확인할 수 있다.


<pre class="mermaid">flowchart TB
    A[/&quot;HTML 소스&lt;br/&gt;&amp;lt;button&amp;gt;전송&amp;lt;/button&amp;gt;&quot;/] --&gt;|파싱| B(&quot;DOM 트리&lt;br/&gt;document&quot;)
    B --&gt; C[&quot;HTMLButtonElement&lt;br/&gt;id=send&quot;]
    C --&gt; D((&quot;텍스트 노드&lt;br/&gt;'전송'&quot;))
    E[&quot;JavaScript&quot;] --&gt;|&quot;textContent 변경&quot;| C
    C --&gt;|&quot;DOM 갱신&quot;| F[&quot;HTMLButtonElement&lt;br/&gt;id=send&lt;br/&gt;'전송 중…'&quot;]
    style A fill:#fef3c7
    style B fill:#dbeafe
    style D fill:#f3e8ff
    style F fill:#dcfce7</pre>


_그림 1. HTML 소스에서 DOM 트리가 만들어지고, JavaScript가 DOM을 변경하는 흐름(설명용 단순화 도식)_


## 표현: 같은 구조를 다르게 보이게 하는 CSS


`style` 속성에 직접 쓴 `background: #3b82f6`은 인라인 스타일이다. 같은 효과를 외부 CSS 파일로 분리하면 구조와 표현의 경계가 뚜렷해진다.


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


CSS는 선택자(selector)를 통해 DOM 노드를 찾고, 선언(declaration)으로 시각 속성을 지정한다. 이 CSS 예제에서는 HTML 버튼에 `class="send-btn"`을 붙이고 기존 인라인 색상 지정은 제거한다고 가정했다. `.pending`이 추가되면 회색으로 바뀐다. 입력 차단은 CSS 색상과 별개의 동작이므로 버튼의 `disabled` 속성으로 처리하는 편이 의미가 분명하다.


`pointer-events: none`만으로는 키보드나 프로그램 호출까지 막지 못한다. 구조(HTML)를 전혀 바꾸지 않고 표현만 달라진다는 점이 분리의 핵심이다([MDN — Introduction to CSS syntax](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Syntax/Introduction)).


인라인 스타일과 클래스 기반 스타일의 실질적인 차이는 유지보수에서 드러난다. 인라인 스타일은 요소마다 개별적으로 작성해야 하므로 버튼이 열 개면 열 곳을 고쳐야 한다. 클래스는 한 곳에서 규칙을 바꾸면 해당 클래스를 가진 모든 요소에 반영된다.


## 동작: 이벤트가 연결하는 입력과 반응


`addEventListener`는 특정 이벤트 타입과 콜백 함수를 연결하는 메서드다([MDN — EventTarget.addEventListener()](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)). 앞선 코드에서 `'click'`이 이벤트 타입이고, 그 뒤의 함수가 콜백이다.


여기서 동작 코드가 하는 일을 순서대로 따라가 본다.

1. 사용자가 버튼을 누른다.
2. 브라우저가 `click` 이벤트 객체를 생성한다.
3. 해당 버튼에 등록된 콜백이 실행된다.
4. 콜백 안에서 `pending`을 확인하고, 이미 `true`면 즉시 빠져나온다.
5. 처음이면 `pending`을 `true`로 바꾸고, 스타일과 텍스트를 갱신한다.

이 흐름에서 콜백 내부가 구조(textContent 변경), 표현(style 변경), 상태(pending 변경)를 모두 건드리고 있다. 한 함수가 여러 층을 관통하는 셈이다.


<pre class="mermaid">sequenceDiagram
    participant U as 사용자
    participant B as 브라우저
    participant CB as 클릭 콜백
    participant S as 상태 변수
    U-&gt;&gt;B: 버튼 클릭
    B-&gt;&gt;CB: click 이벤트 전달
    CB-&gt;&gt;S: pending 확인
    S--&gt;&gt;CB: false
    CB-&gt;&gt;S: pending = true
    CB-&gt;&gt;B: style.background 변경
    CB-&gt;&gt;B: textContent 변경
    Note over B: DOM 갱신 → 화면 다시 그림</pre>


_그림 2. 클릭 이벤트가 상태 확인, 변경과 DOM 갱신으로 이어지는 순서(설명용 시퀀스)_


## UI 상태와 처리 책임


예제의 전역 `pending`은 버튼을 여러 개로 늘렸을 때 개별 대기 상태를 표현하기 어렵다. 전역 `pending`을 공유하는 대신 상태를 각 DOM 요소에 연결하는 방법을 비교했다.


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


`dataset.pending`은 HTML의 `data-pending` 속성에 대응한다. 상태를 각 요소의 속성에 저장하면 전역 변수 없이도 요소별 독립 상태를 유지할 수 있다. 실제 요청을 붙일 때는 성공과 실패 뒤 `finally` 등에서 pending, disabled, 클래스, 버튼 문구를 복원해야 한다.


이 예제에는 그 완료 경로를 생략했다. 동시에 `classList.add('pending')`으로 표현 변경을 CSS에 위임하면, 콜백은 더 이상 `style` 속성을 직접 건드리지 않는다.


이 변경으로 콜백이 담당하는 층이 줄어든다.


| 변경 전 콜백                  | 변경 후 콜백                   |
| ------------------------ | ------------------------- |
| 상태 확인과 변경                | 상태 확인과 변경                 |
| `style.background` 직접 변경 | `classList.add` (CSS에 위임) |
| `textContent` 변경         | `textContent` 변경          |


변경한 구조에서는 CSS에 표현 규칙을 두고 JavaScript가 클래스를 추가하거나 제거한다. `style`을 직접 바꾸던 코드와 비교해 수정할 위치가 나뉘었다.


## 역할별 확인 항목


구조, 표현, 동작, 상태를 분리하면 각 층을 독립적으로 점검할 수 있다.

- **구조 점검**: HTML만 브라우저에 열어본다. JavaScript와 CSS를 모두 끈 상태에서 버튼이 존재하고 텍스트가 보이면 구조는 제 역할을 한다.
- **표현 점검**: CSS 파일만 바꿔본다. `.pending` 클래스의 배경색을 빨간색으로 바꿨을 때 JavaScript를 건드리지 않고 결과가 달라지면 표현이 제대로 분리된 것이다.
- **동작 점검**: 콘솔에서 `document.getElementById('send').click()`을 실행한다. 아직 disabled가 아닌 버튼이라면 click 이벤트를 발생시킬 수 있다. 이것은 실제 포인터, 키보드 입력 전체와 동일한 검증이 아니며, disabled 버튼에서는 click()이 동작하지 않는다.

이 점검은 프레임워크 없이도 브라우저 개발자 도구만으로 수행할 수 있다. 각 층이 다른 층에 의존하는 정도가 낮을수록 점검이 쉬워진다([MDN — DOM Events](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Events)).


## 후속 정리


상태가 복잡해지면 `data-*` 속성과 클래스 조합, 별도의 상태 객체를 비교할 필요가 있다. 여러 요소가 함께 바뀌는 경우에 상태를 어디에 모을지, 화면과 어떻게 대응시킬지는 후속 내용으로 남겼다.


---


**참고 자료**

- [MDN — Document Object Model (DOM)](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model)
- [MDN — Introduction to CSS syntax](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Syntax/Introduction)
- [MDN — EventTarget.addEventListener()](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
- [MDN — DOM Events](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Events)
