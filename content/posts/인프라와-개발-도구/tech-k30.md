---
title: "미디어 스트리밍의 압축과 전송 과정"
date: 2025-04-20
draft: false
slug: "tech-k30"
categories:
  - "인프라와 개발 도구"
tags:
  - "workflow"
summary: "미디어 스트리밍을 압축, 전송, 재생 단계로 정리했다. 저장된 파일을 받는 경우와 라이브 촬영을 보내는 경우는 입력이 준비되는 시점과 허용 대기가 다르다. 프레임의 이동 경로를 따라 지연과 복구 조건이 생기는 위치를 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-81bf-b559-e84b8488246d"
generated_by: "notion"
---
## 파일 전송과 스트리밍의 차이


미디어 스트리밍을 압축, 전송, 재생 단계로 정리했다. 저장된 파일을 받는 경우와 라이브 촬영을 보내는 경우는 입력이 준비되는 시점과 허용 대기가 다르다. 프레임의 이동 경로를 따라 지연과 복구 조건이 생기는 위치를 살펴봤다.


## 프레임: 영상을 구성하는 정지 이미지


영상은 정지 이미지(프레임)의 연속이다. 초당 30프레임(30fps)이면 1초에 30장의 이미지가 만들어진다. 한 프레임의 크기를 계산해 보자. 1920×1080 해상도에서 픽셀당 3바이트(RGB)라면 한 프레임은 1920 × 1080 × 3 = 6,220,800바이트, 약 6.22MB다.


이것을 30fps로 전송하면 초당 186.624MB, 약 1.493Gbps가 필요하다. 이는 패킷 오버헤드를 제외한 RGB24 원시 데이터 계산이며, 실제 카메라 포맷은 다를 수 있다. 대역폭과 저장량을 줄여야 할 이유가 이 숫자에서 드러난다. 여기서 코덱이 개입한다.


## 코덱이 줄이는 것


코덱(codec, coder-decoder)은 영상의 인접 프레임이 대부분 비슷하다는 점을 이용한다. 예측 관계를 이해하기 위해 I와 P 두 유형부터 보자. B 프레임 등 다른 유형은 여기서 생략한다.


**I-프레임**(Intra frame)은 다른 프레임 없이 독립적으로 디코딩할 수 있는 완전한 이미지다. 독립적인 화면 내용과 스트림의 임의 접근 지점은 구분해야 한다. H.264에서는 참조 관계를 새로 시작할 수 있는 IDR 같은 조건도 확인한다. 압축은 하지만 프레임 내부의 중복만 제거하므로 크기가 상대적으로 크다.


**P-프레임**(Predicted frame)은 참조 영상으로부터 예측한 값과 잔차, 움직임 정보 등을 이용한다. 프레임 간 압축은 예측과 잔차 표현을 함께 사용한다. 배경이 고정된 채 사람만 움직이는 장면이라면 배경 부분은 "이전과 같음"으로 처리하고, 움직인 영역의 변화량만 기록한다. 원본 대비 데이터가 훨씬 줄어든다.


압축 후 비트레이트는 장면, 품질 목표, 인코더 설정에 영향을 받는다. 해상도와 프레임 수의 원시 데이터 계산과 실제 압축 결과를 나누어 읽었다.


VP8, VP9, AV1 같은 다른 코덱도 같은 원리를 쓰되 압축 효율이나 인코딩에 필요한 연산 비용에서 차이가 난다([RFC 7742 - WebRTC Video Processing and Codec Requirements](https://www.rfc-editor.org/rfc/rfc7742.html)).


![readable-K30-01.png](/images/notion/tech-k30/image-1.png)


그림 1. 프레임이 인코딩, 패킷화, 디코딩을 거쳐 재생되는 경로: 원본 크기는 RGB24 수치 예이며 압축 후 크기는 가정하지 않았다 (설명용 도식)


## RTSP: 스트림을 제어하는 채널


RTSP(Real Time Streaming Protocol)의 주된 역할은 미디어 세션 제어다. 재생, 일시정지, 종료를 지시하는 제어 프로토콜이다. TV 리모컨이 방송 신호를 보내지 않는 것과 같다.


RTSP 세션은 세 단계로 움직인다. SETUP에서 클라이언트와 서버가 전송 경로(UDP 포트 등)를 협상하고, PLAY에서 서버가 미디어 전송을 시작하며, TEARDOWN에서 세션을 종료한다([RFC 7826 - RTSP 2.0](https://www.rfc-editor.org/rfc/rfc7826.html)).


미디어를 RTP(Real-time Transport Protocol)로 전송하는 구성이 널리 쓰인다. 별도 UDP 흐름을 쓸 수도 있고 RTSP의 TCP 연결 안에 RTP를 인터리브할 수도 있다. RTSP가 제어 평면, RTP가 데이터 평면인 구조다.


이 분리 때문에 RTSP 연결이 끊어져도 이미 전송 중인 RTP 스트림은 잠시 계속될 수 있고, 반대로 RTP 패킷이 유실되어도 RTSP 세션 자체는 유지된다.


![K30-02.png](/images/notion/tech-k30/image-2.png)


그림 2. RTSP 세션의 제어 흐름: SETUP, PLAY, TEARDOWN은 제어 채널이고 영상 데이터는 RTP로 전달되며 이 그림은 논리적 제어, 미디어 역할을 구분했다 (설명용 도식)


## WebRTC: 브라우저 간 양방향 연결


WebRTC는 브라우저끼리 플러그인 없이 영상과 음성을 주고받는 규격이다. WebRTC는 실시간 양방향 통신에 필요한 연결, 미디어, 보안 구성요소를 함께 다루지만 단방향 방송에도 쓸 수 있다. 화상회의가 대표적인 사용처다.


WebRTC의 필수 비디오 코덱으로 VP8과 H.264 Constrained Baseline이 지정되어 있으며, 최소 320×240 해상도에 20fps 이상을 요구한다([MDN - Codecs used by WebRTC](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/WebRTC_codecs)).


보안 면에서도 차이가 뚜렷하다. WebRTC는 DTLS-SRTP로 미디어 암호화가 기본 내장되어 있지만, RTSP/RTP 조합에서는 SRTP를 별도로 설정해야 한다([RFC 8834 - Media Transport and Use of RTP in WebRTC](https://www.rfc-editor.org/rfc/rfc8834.html)).


## I-프레임 누락과 디코딩


참조 영상이 손실되면 그 영상을 참조하는 후속 프레임에도 오류가 전파될 수 있다. 패킷 손실에 따른 화면 깨짐, 멈춤의 범위는 참조 관계와 복구 방식에 따라 달라진다. 오류 은폐, 재전송, 새 키프레임 요청, 참조 구조에 따라 복구가 달라진다.


GOP(Group of Pictures)는 이런 예측 관계를 가진 영상 묶음을 설명할 때 쓰인다. 접근 가능한 갱신 지점이 2초 간격이라면 새로 접속한 수신자가 다음 지점을 기다릴 수 있다. 그러나 이를 모든 손실 상황에서의 최대 복구 시간으로 해석할 수는 없다. 갱신 지점도 손실될 수 있고 디코더 설정과 버퍼도 영향을 준다.


갱신 간격을 줄이면 시작과 복구가 빨라질 여지가 있지만 데이터량은 늘 수 있다. 선택 조건은 서비스 이름보다 허용 지연, 대역폭, 손실률, 수신기 복구 방식으로 정리했다.


## 후속 검토


다음에는 IP 주소와 포트로 경로를 정하고 NAT 뒤의 기기 사이에서 주소 정보를 교환하는 과정을 살펴본다. 압축된 프레임의 전송에 앞서 연결을 준비하는 내용이다.


---


**참고 자료**

- [RFC 7742 - WebRTC Video Processing and Codec Requirements](https://www.rfc-editor.org/rfc/rfc7742.html)
- [RFC 7826 - RTSP 2.0](https://www.rfc-editor.org/rfc/rfc7826.html)
- [MDN - Codecs used by WebRTC](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/WebRTC_codecs)
- [RFC 8834 - Media Transport and Use of RTP in WebRTC](https://www.rfc-editor.org/rfc/rfc8834.html)

## 함께 읽기


먼저 읽을 글: [주소, 포트, VPN과 원격 접근 경로](https://blog.namuori.net/posts/tech-k36/)


이어 읽을 글: [MediaMTX 설치와 스트리밍 확인 과정](https://blog.namuori.net/posts/tech-10-03/)
