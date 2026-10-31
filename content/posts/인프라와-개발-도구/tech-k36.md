---
title: "주소, 포트, VPN과 원격 접근 경로"
date: 2025-04-17
draft: false
slug: "tech-k36"
categories:
  - "인프라와 개발 도구"
tags:
  - "workflow"
summary: "원격 접속을 주소, 경로, 포트, 권한 검사로 나누어 정리했다. 192.168.1.50에서 포트 22는 SSH, 80은 웹 요청을 받을 수 있다. VPN에 따른 연결 변화와 연결 후의 403 Forbidden은 다른 단계의 결과로 읽을 수 있다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8164-b4ba-daa6c6293129"
generated_by: "notion"
---
## 주소, 포트, 권한별 접속 결과


원격 접속을 주소, 경로, 포트, 권한 검사로 나누어 정리했다. `192.168.1.50`에서 포트 22는 SSH, 80은 웹 요청을 받을 수 있다. VPN에 따른 연결 변화와 연결 후의 `403 Forbidden`은 다른 단계의 결과로 읽을 수 있다.


## DNS: 이름을 주소로 바꾸는 첫 단계


`ssh dev.example.com`을 입력하면 먼저 `dev.example.com`이라는 도메인 이름을 IP 주소로 변환해야 한다. 이 변환을 담당하는 시스템이 DNS(Domain Name System)다.


클라이언트 운영체제는 로컬에 설정된 DNS 리졸버(resolver)에 질의를 보낸다. 리졸버가 캐시에 답을 가지고 있으면 바로 반환하고, 없으면 루트 네임서버 → `.com` 네임서버 → `example.com`의 권한 네임서버 순서로 질의를 반복하여 최종 IP 주소를 받아 온다.


클라이언트가 최종 답을 요청하는 것은 재귀 질의이고, 리졸버가 각 권한 서버의 안내를 따라 찾아가는 과정은 보통 반복 질의로 구분한다([RFC 1035 — Domain Names: Implementation and Specification](https://datatracker.ietf.org/doc/html/rfc1035)).


`nslookup dev.example.com`이나 `dig dev.example.com`을 실행하면 이 단계의 결과를 직접 확인할 수 있다.


```javascript
$ dig dev.example.com +short
10.0.1.50
```


DNS가 실패하면 (도메인 오타, 네임서버 장애, 네트워크 차단) 해당 이름으로 새 연결을 준비하기 어렵다. 직접 IP를 지정하거나 유효한 캐시를 사용하는 경로는 별도다. "호스트를 찾을 수 없습니다" 류의 메시지는 대부분 이 단계에서 발생한다.


## IP 주소와 포트: 기계와 서비스를 각각 지정


DNS가 `10.0.1.50`이라는 IP 주소를 반환했다고 하면, IP 주소는 네트워크 계층에서 인터페이스나 논리적인 접속 지점을 가리킨다.


한 기계가 여러 주소를 쓰거나 하나의 서비스 주소 뒤에 여러 기계가 있을 수 있다([RFC 791 — Internet Protocol](https://datatracker.ietf.org/doc/html/rfc791)). 그런데 하나의 기계에 여러 서비스가 동시에 실행 중일 수 있다. 어떤 서비스에 연결할지를 구분하는 것이 포트(port) 번호다.


| 포트   | 서비스        | 용도        |
| ---- | ---------- | --------- |
| 22   | SSH        | 원격 셸 접속   |
| 80   | HTTP       | 웹 서버(평문)  |
| 443  | HTTPS      | 웹 서버(암호화) |
| 5432 | PostgreSQL | 데이터베이스    |


포트 번호는 0부터 65535까지의 정수다. 0~1023은 잘 알려진 포트(well-known ports)로 운영체제가 관리 권한을 요구하는 경우가 많고, 1024 이상은 사용자 프로세스가 바인딩할 수 있다.


`192.168.1.50:5432`라고 쓰면 "해당 IP 주소의 포트 5432에서 대기 중인 프로세스에 연결하라"는 뜻이 된다. 같은 IP 주소라도 포트에 따라 완전히 다른 서비스가 응답하는 이유가 여기에 있다.


## 라우팅과 VPN: 패킷이 도달하는 경로


IP 주소를 확인한 뒤에도 라우팅과 방화벽 등 도달 조건을 점검해야 한다. 클라이언트에서 보낸 패킷은 여러 라우터를 거쳐 목적지에 도착한다. 각 라우터는 자신의 라우팅 테이블을 참고하여 패킷을 다음 라우터로 전달한다.


`10.0.x.x`이나 `192.168.x.x` 같은 사설 주소는 내부 네트워크에서 사용하며 외부 접근에는 별도 연결 경로가 필요하다. 내부 라우터로 연결된 여러 사설 네트워크 사이에서는 접근할 수 있다. 외부 네트워크에서 사설 IP에 도달하려면 경로를 만들어 줘야 한다.


VPN(Virtual Private Network)은 공용 인터넷 위에 암호화된 터널을 만들어, 클라이언트를 마치 내부 네트워크에 있는 것처럼 연결해 주는 방식이다. "VPN을 켜면 접속이 되고 끄면 시간 초과"라는 현상은 VPN이 경로나 DNS, 접근 정책을 바꾸었을 가능성을 보여 준다. 실제 원인은 전후 설정을 비교해야 좁힐 수 있다.


![readable-K36-01.png](/images/notion/tech-k36/image-1.png)


그림 1. VPN 유무에 따른 접근 경로 차이: 사설 IP 서버에 외부에서 접근하는 두 경로 (설명용 흐름도)


`traceroute`(Windows에서는 `tracert`) 명령으로 패킷이 어떤 경로를 거치는지 확인할 수 있다. 전후 경로를 비교하는 데 도움이 되지만, 중간 장치가 응답하지 않거나 터널 내부가 숨겨질 수 있어 모든 홉이 보장되지는 않는다.


## 접속, 인증, 서비스 응답: 세 단계의 구분


TCP 연결 이후에도 인증과 서비스 응답이 남는다. 접속(connection), 인증(authentication), 서비스 응답(service response)을 나누면 오류가 발생한 단계와 추가로 확인할 조건을 구분할 수 있다.


![K36-02.png](/images/notion/tech-k36/image-2.png)


그림 2. 접속에서 서비스 응답까지의 세 관문: 각 실패가 서로 다른 오류를 만든다 (설명용 흐름도)


"Connection refused"는 해당 포트에서 대기 중인 프로세스가 없거나 방화벽이 연결을 거부한 것이다. "Connection timed out"은 정해진 시간 안에 필요한 응답을 받지 못했다는 뜻으로, 라우팅 문제나 방화벽의 무응답 차단(DROP), 돌아오는 경로의 장애, 서버의 과부하 등에서도 나타날 수 있다. 두 메시지 모두 TCP 수준의 문제지만 원인은 다르다.


"401 Unauthorized"나 "403 Forbidden"은 어떤 HTTP 응답자와의 통신은 이루어졌지만, 서비스가 요구하는 인증 정보가 없거나 권한이 부족한 것이다. 응답자는 원본 서버 대신 프록시나 게이트웨이일 수도 있다.


SSH 키 인증 실패는 HTTP 상태 코드가 아닌 별도 프로토콜의 오류다. 메시지를 발생시킨 단계에 맞춰 경로, 설정, 권한 조건을 살펴보는 방식으로 정리했다.


## 추가로 정리할 내용


도메인 → IP → 포트 → 라우팅 경로 → 연결 → 인증 → 서비스 응답의 흐름을 확인했다. 단계마다 성공 여부를 확인하고 증상과 관찰 위치를 함께 남겨 비교한다.


HTTPS의 TLS 핸드셰이크와 인증서 검증은 다음 주제로 남겼다. “certificate verify failed”, “ERR_CERT_AUTHORITY_INVALID” 같은 오류를 TCP 연결 이후 어느 단계에 놓을지 이어서 살펴볼 수 있다.


---


**참고 문서**

- [RFC 1035 — Domain Names: Implementation and Specification](https://datatracker.ietf.org/doc/html/rfc1035)
- [RFC 791 — Internet Protocol](https://datatracker.ietf.org/doc/html/rfc791)
- [DNS — MDN Web Docs Glossary](https://developer.mozilla.org/en-US/docs/Glossary/DNS)

## 함께 읽기


이어 읽을 글: [미디어 스트리밍의 압축과 전송 과정](https://blog.namuori.net/posts/tech-k30/), [MediaMTX 설치와 스트리밍 확인 과정](https://blog.namuori.net/posts/tech-10-03/), [원격 운영 도구의 연결 구성과 복구 절차](https://blog.namuori.net/posts/tech-10-04/)
