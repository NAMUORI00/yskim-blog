---
title: "HTTP 요청과 응답, 인증과 인가 정리"
date: 2025-01-02
draft: false
slug: "tech-k24"
categories:
  - "웹과 백엔드"
tags:
  - "workflow"
summary: "브라우저 요청 하나를 기준으로 HTTP의 메서드, 헤더, 응답과 인증, 인가를 정리했다. 같은 주소라도 요청 정보와 서버 정책에 따라 결과가 달라진다. 각 정보가 검사되는 위치를 예제의 흐름에 맞춰 읽었다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-817d-aa39-c0f3c727d2cd"
generated_by: "notion"
---
브라우저 요청 하나를 기준으로 HTTP의 메서드, 헤더, 응답과 인증, 인가를 정리했다. 같은 주소라도 요청 정보와 서버 정책에 따라 결과가 달라진다. 각 정보가 검사되는 위치를 예제의 흐름에 맞춰 읽었다.


## 요청의 구성: 메서드, 경로, 헤더


브라우저가 서버에 보내는 HTTP 요청은 크게 세 부분으로 이루어진다. 메서드(method)는 어떤 동작을 원하는지, 경로(path)는 어떤 자원에 대한 것인지, 헤더(headers)는 부가 정보를 담는다.


```javascript
GET /api/notes HTTP/1.1
Host: example.com
Accept: application/json
Authorization: Bearer <예시-토큰>
```


첫 줄에서 `GET`이 메서드이고 `/api/notes`가 경로, `HTTP/1.1`이 프로토콜 버전이다. `Host` 헤더는 어느 서버로 향하는지를, `Accept`는 원하는 응답 형식을, `Authorization`은 인증 정보를 전달한다.


[MDN의 HTTP 인증 가이드](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Authentication)에 따르면, `Authorization` 헤더는 서버가 요구하는 인증 스킴(Bearer, Basic 등)에 맞는 자격 증명을 담는다.


POST나 PUT 요청에는 본문(body)이 추가되어 서버에 데이터를 함께 보낸다. GET 요청에는 보통 본문이 없다.


## 응답의 구성: 상태 코드와 본문


서버의 응답에도 정해진 구조가 있다.


```javascript
HTTP/1.1 200 OK
Content-Type: application/json

{"notes": [{"id": 1, "title": "첫 번째 노트"}]}
```


`200`이 상태 코드이고 `OK`가 상태 메시지다. 상태 코드의 첫 자리가 응답의 종류를 결정하는데, 2xx는 성공, 3xx는 리다이렉트, 4xx는 클라이언트 오류, 5xx는 서버 오류로 분류된다.


`Content-Type`은 본문의 형식을 알려준다. `Content-Length`에는 실제 인코딩된 바이트 수를 쓴다. 여기서는 길이 헤더를 생략하고 구조만 표시했다.


이 구조 안에서 인증 실패도, 권한 부족도, 서버 내부 오류도 모두 표현된다. 상태 코드와 헤더, 본문 내용은 실패 원인과 API 계약에 따라 달라진다.


## 인증: 누구인지 확인하는 관문


서버가 요청에서 유효한 자격 증명을 찾지 못하면 [401 Unauthorized](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/401)를 돌려보낸다.


```javascript
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="api"
```


`WWW-Authenticate` 헤더는 클라이언트에게 어떤 인증 방식을 써야 하는지 안내한다. 401은 "신원을 확인할 수 없다"는 뜻이다. 토큰이 아예 없거나, 있지만 만료되었거나, 형식이 잘못된 경우가 모두 여기에 해당한다. 유효한 자격 증명을 다시 보내면 성공할 가능성이 열려 있다는 점이, 다음에 나올 403과의 결정적 차이다.


## 인가: 권한이 있는지 확인하는 관문


인증은 통과했지만 해당 자원에 접근할 권한이 없으면 서버는 [403 Forbidden](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/403)을 돌려보낸다.


```javascript
HTTP/1.1 403 Forbidden
Content-Type: application/json

{"error": "admin role required"}
```


이 예제에서 401은 유효한 인증 정보가 필요하다는 뜻이고, 403은 요청을 이해했지만 허용하지 않았다는 뜻으로 사용한다. 같은 자격 증명으로 재전송하는 것만으로 403이 해결되지는 않는다. 다만 403 자체가 인증 성공을 보증하지는 않는다. IP 정책이나 다른 접근 제한에서도 나올 수 있고, 다른 권한을 가진 계정으로 요청하면 결과가 달라질 수 있다.


## 하나의 엔드포인트, 세 가지 결과


같은 `GET /api/admin/settings`에 세 가지 상태의 요청을 보낸다고 해 보자.


```javascript
요청 1: Authorization 헤더 없음        → 401 Unauthorized
요청 2: 일반 사용자 토큰              → 403 Forbidden
요청 3: 관리자 토큰                   → 200 OK + 설정 데이터
```


예제 서버는 인증 정보를 확인한 뒤 해당 사용자의 자원 접근 권한을 검사한다. 두 검사가 각각 어떤 요청을 통과시키는지 나누어 살펴봤다.


![K24-01.png](/images/notion/tech-k24/image-1.png)


그림 1. 서버의 인증, 인가 처리 흐름 (설명용 개념도)


![K24-02.png](/images/notion/tech-k24/image-2.png)


그림 2. 같은 엔드포인트에 대한 세 가지 응답 시나리오 (설명용)


그림은 예제 API의 처리 순서를 나타낸다. 공개 자원이나 정책에 따라 달라질 수 있고, 존재를 숨기려고 403 대신 404를 쓰기도 한다. 상태 코드와 해당 API의 계약, 로그를 함께 읽어야 내부 처리 범위를 좁힐 수 있다.


## 후속 검토


쿠키와 Bearer 토큰 인증의 요청 구조 차이는 다음 비교 대상으로 남겼다. 다른 출처(origin)의 API 호출에서 OPTIONS 프리플라이트가 인증, 인가와 연결되는 방식도 별도로 살펴볼 내용이다.


---


**참고 자료**

- MDN Web Docs, "HTTP authentication." [https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Authentication](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Authentication)
- MDN Web Docs, "401 Unauthorized." [https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/401](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/401)
- MDN Web Docs, "403 Forbidden." [https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/403](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/403)

## 함께 읽기


이어 읽을 글: [MCP의 구성 요소와 도구 호출 과정](https://blog.namuori.net/posts/tech-k18/), [CMS 콘텐츠와 정적 웹페이지 생성](https://blog.namuori.net/posts/tech-k29/), [제안, 승인, 실행 결과의 상태 관리](https://blog.namuori.net/posts/tech-s11/), [설치 구성과 서비스 실행 단계](https://blog.namuori.net/posts/tech-s12/)
