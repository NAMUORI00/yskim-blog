---
title: "HMAC으로 메시지 변경을 확인하는 과정"
date: 2025-07-16
draft: false
slug: "hmac-message-verification"
categories:
  - "시스템과 보안"
tags:
  - "workflow"
summary: "공유 비밀키와 메시지가 HMAC 계산에 들어가는 경로를 정리하고, Python 예제로 같은 메시지와 변경된 메시지의 검증 결과를 비교했다."
cover: ""
canonical: ""
comments: false
notion_id: "3f4dcd44-779f-81db-9406-fa3dbcdff08c"
generated_by: "notion"
math: true
---
메시지 인증을 정리하면서 해시값과 HMAC의 차이를 다시 살펴봤다. 파일의 해시값을 함께 보내면 변경 여부를 비교할 수 있지만, 메시지와 해시값을 둘 다 바꿀 수 있는 상대에게는 그것만으로 인증이 되지 않는다. HMAC은 이 계산에 공유 비밀키를 넣는다.


## 메시지와 키가 만나는 위치


HMAC은 해시 함수 H, 메시지 M, 정리한 키 K′를 두 번의 해시 계산에 사용한다.


$$
\operatorname{HMAC}_K(M)=H((K'\oplus opad)\parallel H((K'\oplus ipad)\parallel M))
$$


키가 해시 함수의 블록 길이보다 길면 먼저 해시하고, 짧으면 오른쪽을 0으로 채워 블록 길이에 맞춘다. ipad와 opad는 각각 0x36과 0x5c를 블록 길이만큼 반복한 값이다. 내부 해시의 출력 길이와 해시 함수의 블록 길이는 서로 다른 값이라 구분해 두었다. 내부 결과에 임의의 0 패딩을 더하는 과정은 없다. [RFC 2104의 정의](https://www.rfc-editor.org/rfc/rfc2104.html#section-2)


<pre class="mermaid">flowchart TD
    K([&quot;공유 비밀키&quot;]) --&gt; N[&quot;키 길이 정리&quot;]
    N --&gt; I[&quot;ipad와 XOR&quot;]
    N --&gt; O[&quot;opad와 XOR&quot;]
    M([&quot;메시지 바이트&quot;]) --&gt; H1[&quot;내부 해시&quot;]
    I --&gt; H1
    H1 --&gt; H2[&quot;외부 해시&quot;]
    O --&gt; H2
    H2 --&gt; T([&quot;인증 태그&quot;])</pre>


그림 1. 키와 메시지가 내부, 외부 해시에 들어가는 경로. RFC 2104 §2의 정의를 바탕으로 직접 재구성했다. 


## 같은 바이트를 검증하는 예제


노트에 남겨 둔 Python 예제에는 호출자가 키와 메시지를 제공하도록 되어 있었다. 이번에는 송신 측의 태그와 수신 측의 계산 결과를 비교하는 부분까지 한 예제로 묶었다.


```python
import hashlib
import hmac
import secrets

key = secrets.token_bytes(32)  # 설명용: 실제 서비스의 키 전달 과정은 생략
message = b"amount=100"

received_tag = hmac.new(key, message, hashlib.sha256).digest()

def verify(payload, tag):
    expected = hmac.new(key, payload, hashlib.sha256).digest()
    return hmac.compare_digest(expected, tag)

print(verify(message, received_tag))
print(verify(b"amount=900", received_tag))
```


이 예제를 실행하면 같은 메시지는 True, 숫자만 바꾼 메시지는 False가 된다. 키는 실행할 때마다 새로 만들기 때문에 태그 자체를 고정된 값으로 비교하지 않았다. 운영 서비스에서는 양쪽이 키를 안전하게 공유하고 갱신하는 별도 과정이 필요하다.


문자열을 눈으로 비교하면 내용이 같아 보여도 공백, 줄바꿈, 문자 인코딩이 바뀌면 바이트가 달라질 수 있다. JSON을 인증할 때도 어느 직렬화 결과를 계산 대상으로 삼을지 먼저 정해야 한다. 원시 본문 검증과 필드 기반 재구성은 각각 검증할 바이트열을 정하는 계약이 필요하다.


태그 비교에는 일반적인 문자열 비교 대신 [Python의 compare_digest](https://docs.python.org/3.13/library/hmac.html#hmac.compare_digest)를 사용했다. 두 인자는 같은 종류의 값으로 맞춘다. 이 예제는 양쪽 모두 bytes이며, hex 문자열로 바꾸어 전송한다면 수신 측의 해석도 그 형식에 맞춰야 한다.


## 인증이 해결하지 않는 부분


HMAC은 메시지를 숨기지 않는다. 공유키를 가진 양쪽 모두 유효한 태그를 만들 수 있으므로 공개키 전자서명처럼 제삼자에게 작성자를 입증하는 수단으로도 바로 사용할 수 없다.


이 예제의 verify 함수에 동일한 메시지와 태그를 두 번 넣으면 두 번 모두 True가 된다. 메시지의 변조 검사와 이전 메시지의 재전송 차단이 다른 조건이라는 점이 흥미롭다. 웹훅처럼 재전송이 가능한 경로에서는 인증 대상에 시각이나 요청 식별자를 포함할지, 이미 처리한 요청을 어떻게 기록할지가 다음 검토 항목이다. 이 부분은 별도 글에서 다루려고 한다.
