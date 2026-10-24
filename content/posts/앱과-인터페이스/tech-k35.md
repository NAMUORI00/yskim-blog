---
title: "이벤트, 콜백과 실행 순서"
date: 2025-03-18
draft: false
slug: "tech-k35"
categories:
  - "앱과 인터페이스"
tags:
  - "workflow"
summary: "타이머 예제로 콜백의 실행 순서를 정리했다. 지연 시간을 0으로 두어도 바로 다음 동기 코드가 먼저 실행된다. B가 마지막에 출력되는 흐름을 호출 스택과 작업 큐에 놓고 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-811c-9567-d71f532fde91"
generated_by: "notion"
---
## 타이머 등록과 출력 순서


타이머 예제로 콜백의 실행 순서를 정리했다. 지연 시간을 0으로 두어도 바로 다음 동기 코드가 먼저 실행된다. B가 마지막에 출력되는 흐름을 호출 스택과 작업 큐에 놓고 살펴봤다.


```javascript
console.log('A');
setTimeout(() => console.log('B'), 0);
console.log('C');
```


예제의 출력 순서는 `A`, `C`, `B`다. `setTimeout`에 0을 주어도 `B`는 마지막이다. 0밀리초는 타이머의 최소 지연을 지정한다. 콜 스택, 작업 큐, 이벤트 루프를 나누어 이 순서를 따라갔다.


## 콜 스택: 지금 실행 중인 함수의 쌓임


JavaScript 런타임은 함수를 호출하면 콜 스택(call stack)에 실행 컨텍스트를 쌓고, 함수가 반환되면 꺼낸다. 스택이 비어 있어야 다음 작업을 꺼내 올 수 있다.


위 코드를 한 줄씩 따라가면: `console.log('A')`가 스택에 올라가고, 출력을 마치면 빠진다. 이어서 `setTimeout`이 스택에 올라간다. 여기서 일어나는 일은 콜백 `() => console.log('B')`를 런타임의 타이머에 등록하고 바로 반환하는 것이다.


`setTimeout` 자체는 콜 스택에서 빠지고, 곧이어 `console.log('C')`가 스택에 올라가 실행된다. 이 시점에서 `A`와 `C`가 출력된 상태이고, `B`의 콜백은 아직 대기 중이다.


## 작업 큐와 이벤트 루프: 스택이 빈 뒤에 꺼내기


`setTimeout`이 등록한 콜백은 지정한 지연 시간이 지나면 작업 큐(task queue)에 들어간다. 지연이 0이어도 콜백은 현재 실행 중인 코드가 끝난 뒤 실행 기회를 얻는다.


이벤트 루프(event loop)는 콜 스택이 완전히 비어 있는지 반복적으로 확인하고, 비어 있으면 작업 큐에서 하나를 꺼내 스택에 올린다([Concurrency model and Event Loop — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop)).


그래서 `A`와 `C`가 먼저 출력된 뒤에야 `B`의 콜백이 실행되는 것이다. 이 동작의 핵심 규칙은 run-to-completion이다. 하나의 태스크가 콜 스택에 올라가면, 그 태스크가 끝나서 스택이 빌 때까지 다른 태스크가 끼어들지 못한다.


## 클릭 두 번과 느린 응답: 시간선 위에 놓기


좀 더 현실적인 상황을 그려 본다. 버튼에 클릭 핸들러가 등록되어 있고, 동시에 느린 API 호출이 진행 중인 경우다.


```javascript
button.addEventListener('click', () => {
  console.log('클릭 처리');
});

fetch('/slow-api').then(response => {
  console.log('응답 수신');
});
```


`fetch` 호출 직후 사용자가 버튼을 두 번 빠르게 클릭했다고 하면, 두 클릭 처리 후에 API 응답이 도착하는 경우를 가정한다. 단순히 fetch 뒤에 클릭했다는 사실만으로 이 순서가 보장되지는 않는다. 이벤트 루프 관점에서 시간선을 따라가면:


![K35-01.png](/images/notion/tech-k35/image-1.png)


그림 1. 클릭 두 번과 느린 응답의 처리 순서: 두 클릭 처리 후 응답이 도착한다고 가정했다. Promise 반응은 마이크로태스크에서 처리한다 (설명용 시퀀스)


그림은 클릭 태스크 둘을 처리한 뒤 네트워크 응답이 준비되는 조건의 예제다. 브라우저에는 여러 태스크 소스가 있어 모든 이벤트를 단일 FIFO 순서로 일반화하지 않았다.


출력은 "클릭 처리", "클릭 처리", "응답 수신" 순서가 된다. 중요한 점은 클릭 A의 콜백이 오래 걸리면 클릭 B의 처리도 그만큼 밀린다는 것이다. 콜 스택을 오래 점유하는 코드가 UI 응답 지연을 만드는 이유가 여기에 있다.


## 마이크로태스크와 태스크: 우선순위가 다른 두 큐


실행 환경은 여러 종류의 큐를 구분한다. `setTimeout` 콜백이 들어가는 태스크 큐(task queue)와, `Promise.then` 콜백이 들어가는 마이크로태스크 큐(microtask queue)가 구분된다.


이벤트 루프는 태스크 하나를 실행한 뒤, 다음 태스크로 넘어가기 전에 마이크로태스크 큐를 전부 비운다([HTML Standard — Event Loop Processing Model](https://html.spec.whatwg.org/multipage/webappapis.html)).


```javascript
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
```


출력은 `1`, `4`, `3`, `2`다. 동기 코드(`1`, `4`)가 먼저 실행되고, 콜 스택이 비면 마이크로태스크 큐의 `3`을 전부 처리한 뒤에야 태스크 큐의 `2`로 넘어간다.


손으로 따라가면: 동기 실행 → 마이크로태스크 전부 비우기 → 태스크 하나 실행 → 다시 마이크로태스크 전부 비우기, 이것이 아래 그림에서 추적할 순서다. 실제 브라우저의 렌더링 기회와 여러 태스크 소스의 선택은 생략했다.


![K35-02.png](/images/notion/tech-k35/image-2.png)


그림 2. 이벤트 루프의 처리 우선순위: 마이크로태스크 큐를 먼저 전부 비운다 (설명용 흐름도)


마이크로태스크가 새 마이크로태스크를 계속 추가하면 다음 태스크로 넘어가지 못할 수 있다. `Promise`가 재귀적으로 자신을 등록하는 경로에서는 `setTimeout` 콜백이나 UI 이벤트가 계속 밀리는 조건이 생긴다.


## 추가로 정리할 내용


여기서 따라간 것은 브라우저 환경에서 동기 코드, 태스크, 마이크로태스크가 어떤 순서로 실행되는지를 한 시간선 위에 놓고 읽는 방법이다.


Node.js 환경에서는 이벤트 루프가 timers, poll, check 등 여러 페이즈(phase)로 나뉘어 동작한다([The Node.js Event Loop — Node.js 공식 문서](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick)).


`setImmediate`와 `process.nextTick`의 처리 시점은 Node.js에서 따로 살펴볼 내용이다. 브라우저의 태스크, 마이크로태스크 구분과 비교하고, Promise 기반의 `async/await`에서 `await` 이후 코드가 재개되는 위치도 이어서 정리할 수 있다.


---


**참고 문서**

- [Concurrency model and Event Loop — MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/EventLoop)
- [HTML Standard — Event Loop Processing Model](https://html.spec.whatwg.org/multipage/webappapis.html)
- [The Node.js Event Loop — Node.js 공식 문서](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick)

## 함께 읽기


이어 읽을 글: [작업 재시도와 멱등성 정리](https://blog.namuori.net/posts/tech-k19/), [Windows 훅과 콜백의 수명 관리](https://blog.namuori.net/posts/tech-s04/), [비동기 작업의 재시도와 승인 기록](https://blog.namuori.net/posts/tech-s19/), [Windows 훅의 등록과 종료 흐름 정리](https://blog.namuori.net/posts/tech-01-04/)
