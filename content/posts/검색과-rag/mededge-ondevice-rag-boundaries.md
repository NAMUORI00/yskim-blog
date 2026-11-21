---
title: "MedEdge의 로컬 검색과 답변 생성 경로"
date: 2026-06-06
draft: false
slug: "mededge-ondevice-rag-boundaries"
categories:
  - "검색과 RAG"
tags:
  - "rag"
  - "ml"
summary: "MedEdge에서는 기기 안에서 자료를 검색하고 의료 QA 답변으로 연결하는 연구용 프로토타입을 구성했다. Android의 LiteRT-LM과 Python의 Ollama 경로, 모델 실패 시 템플릿 출력을 구분해 응답의 생성 경로를 기록하는 문제를 다뤘다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-812d-b972-f2f44d51c306"
generated_by: "notion"
---
MedEdge에서는 기기 안에서 자료를 검색하고 의료 QA 답변으로 연결하는 연구용 프로토타입을 구성했다. Android의 LiteRT-LM과 Python의 Ollama 경로, 모델 실패 시 템플릿 출력을 구분해 응답의 생성 경로를 기록하는 문제를 다뤘다.


## 구현과 확인 과정


MedEdge의 로컬 검색과 답변 생성 경로를 코드 기준으로 정리했다. 이 프로젝트에는 Android의 LiteRT-LM 경로, Python의 Ollama 경로, 그리고 모델 실패 시 사용되는 템플릿 대체 응답이 있다. 화면에 답변이 표시되더라도 기기 안의 모델이 생성한 것인지, 템플릿을 반환한 것인지는 화면만으로 구분되지 않는다. 의료 QA 연구용 프로토타입의 실행 경로를 비교했다. 진단, 처방의 유효성은 별도의 임상 검증이 필요한 영역이다.


![08-ondevice-roles.png](/images/notion/mededge-ondevice-rag-boundaries/image-1.png)


그림 1. MedEdge RAG의 모델 준비, 기기 내부 검색과 생성, 평가 경계. 템플릿 응답은 로컬 LLM 추론 성공과 별도로 기록해야 한다.


## 로컬 실행의 구성과 제약


로컬 검색과 생성은 질문, 근거를 처리하는 위치를 기기 안에 둘 수 있는 구성이다. 모델 파일과 실행 메모리를 준비해야 하고, 저장소의 offline, bootstrap 구분은 네트워크를 쓰는 준비 단계와 추론 단계를 나눈다. 개인정보가 실제로 이동하는 경로와 기기 비용은 각 실행 경로에서 확인해야 한다.


## 모델 준비와 추론 단계

- **offline**: `android.permission.INTERNET` 권한 자체가 없다. 모델은 개발 PC에서 ADB로 사전 배치한다. 모델 가중치는 APK, 저장소와 별도로 준비하는 경로도 사용한다.
- **bootstrap**: 최초 실행 시 모델을 다운로드하고 SHA-256으로 무결성을 검증한다.

저장소의 로컬 검증 구성은 Pixel 7 기반 Android 15/API 35 에뮬레이터다. 에뮬레이터 구성을 확인했더라도 실제 휴대전화의 속도, 발열, 메모리 사용량은 별도로 남겨둘 문제였다. Android 배포 구분은 README의 설계 기록을 따르며, 아래 함수 수준 설명은 개발용 Python 경로를 기준으로 한다.


## 검색 벡터를 만드는 과정을 따라가기


검색은 단어를 해시값으로 바꾸어 4,096차원 벡터에 담는 방식으로 구현되어 있다. 이 벡터를 사용해 질문과 문서를 비교한다. 구현 클래스 이름은 `HashingVectorIndex`다.


[검색 색인 구현](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/vector_store.py)


`vectorize(text, dims)` 함수의 처리 과정:

1. `TOKEN_RE = re.compile(r"[A-Za-z0-9]+|[가-힣]+")`로 토큰을 분리한다.
2. 원래 토큰과 한국어 접미사를 제거한 변형을 만들고 불용어를 제외한다. 단어 특징에는 가중치 2.0을 더한다.
3. `strip_korean_suffix()`는 정해진 접미사 목록을 적용한다. 규칙 기반 전처리로 토큰을 구성한다.
4. 3글자 이상의 한국어 토큰에서 접미사를 제거한 문자열의 길이 2, 3 문자 n-gram을 생성하고 각 특징에 0.25를 더한다.
5. `stable_hash(value)`: `int(hashlib.sha1(value.encode("utf-8")).hexdigest()[:16], 16)`: 의 결과를 차원 수로 나눈 나머지를 이용해 단어와 n-gram 특징을 버킷에 매핑한다.
6. L2 정규화한 희소 벡터를 만든다.

검색은 전체 벡터에 대해 내적(dot product)을 계산하고 양수 점수를 가진 결과만 점수 내림차순으로 정렬해 상위 k개를 반환한다. 학습된 의미 임베딩이 아닌 해시 기반 희소 벡터를 쓰고 있었다.


같은 문자 패턴이 겹치는 질문과 문서는 점수가 높게 나올 수 있지만, 다른 표현으로 쓴 같은 의미까지 잘 잡아내는지는 별도 실험이 필요한 부분이다. 인덱스는 JSON 직렬화(`save`/`load`)로 디스크에 저장하며, 버전 필드가 포함된다.


## 응답이 돌아온 경로를 다시 확인하기


[답변 생성 처리](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/generation.py)의 `OllamaClient`가 기본 모델명 `gemma4:e2b`로 생성 요청을 보낸다.


`/api/tags`의 HTTP 200은 서버가 응답함을 나타낸다. 지정 모델의 설치와 추론 성공은 추가로 확인해야 한다. 실제 생성은 `/api/chat`에서 수행한다. 타임아웃은 60초다.


`answer_question(question, hits, use_llm=True)` 함수는 LLM 호출을 시도하되, `OSError`, `URLError`, `TimeoutError`, `JSONDecodeError`가 발생하면 `template_answer()`로 폴백한다.


템플릿 폴백은 검색된 QA 답변에 `qa_id`, `domain`, `score`를 붙여 출력한다. 모델을 사용할 수 없을 때 검색된 자료를 보여줄 수 있다는 점에서 대체 경로로 이해했다. 다만 추론 성공 응답과 구별해 기록하지 않으면 평가를 잘못 읽을 수 있다.


`DISCLAIMER = "본 답변은 연구용 의료 정보이며 진단이나 처방을 대체하지 않습니다..."` 문자열이 `_with_disclaimer()`를 통해 모든 답변에 항상 추가된다. 두 정상 반환 경로에는 연구용 안내가 포함된다. 의학적 안전성은 별도 검증이 필요하다.


## 생성 모델과 평가 모델의 실행 위치


[평가 처리](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/evaluation.py)에는 두 가지 평가 경로가 있다.


`run_benchmark()`는 `llm_only`(근거 없이 모델만)와 `rag_top3`(상위 3건 근거 포함) 조건을 쌍으로 생성한다. AIHub 의료 QA 데이터셋이 평가 대상이다.


`run_ragas()`는 4가지 RAGAS 메트릭(`answer_relevancy`, `faithfulness`, `context_precision`, `context_recall`)으로 평가하며, 심사 모델과 임베딩 제공자를 설정해 사용한다.


저장소의 기본 심사 모델명은 `gemini-3-flash-preview:cloud`다. 이 평가 경로는 기기 내부 추론과 분리되어 있으며, 외부 심사자를 사용하면 평가 자료가 해당 서비스로 전달될 수 있다.


`summarize_answer_relevancy()`는 `llm_only`와 `rag_top3` 사이의 `answer_relevancy` 차이를 쌍별 부트스트랩 CI로 추정한다. 반복 10,000회, 신뢰 수준 0.95, 시드 13이다. `bootstrap_mean_ci()`가 백분위 부트스트랩을 구현한다.


## 질문 한 번에 연결되는 부분


질문을 받으면 저장한 검색 색인을 읽고, 관련 문서를 찾은 뒤 답변을 만든다. 결과에는 답변과 검색 근거를 함께 돌려준다. 각 근거에는 질문, 답변 항목의 식별자, 분야, 질문 유형, 검색 점수가 들어가므로 답변만 남길 때보다 어떤 자료를 사용했는지 확인하기 쉽다.


함수 인터페이스는 `ask(index_path, question, top_k=3, use_llm=True)`이고 반환 형식은 `(answer, evidence)`다. [질문에서 답변까지 연결하는 처리](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/pipeline.py)


## 실행 경로별 확인 항목


준비 단계와 추론 단계를 나누어 살펴봤다. bootstrap 빌드는 모델을 받을 때 네트워크를 사용한다. 다운로드가 끝난 뒤 로컬 추론만 수행하는 구조와, 앱 수명 전체에서 네트워크를 전혀 사용하지 않는 구조는 다르다. SHA-256은 받은 파일과 기대한 파일의 일치를 확인한다. 답변 품질은 별도 평가 항목이다.


Android와 Python 개발 경로도 구분해서 봤다. Android는 LiteRT-LM Kotlin API를 사용하고, Python은 Ollama 클라이언트를 사용한다.


Python의 `OLLAMA_HOST`가 외부 주소를 가리키면 원격 서버를 사용한다. 로컬 실행 여부는 실제 주소 설정으로 확인한다. 실행 위치를 기록할 때 실제 호스트 설정과 사용한 빌드를 함께 남겨두는 편이 낫겠다.


실제 생성과 대체 표시도 따로 살펴봤다. 화면에 템플릿 QA가 표시된 경우에는 검색, 템플릿 경로의 성공으로 기록한다. 후속 검증에서는 검색 성공, 모델 준비 상태, 실제 추론 여부, 대체 경로 사용 여부를 별도 항목으로 두고 싶다.


## 최근 실행 환경과 남은 평가


Google의 현재 LiteRT-LM 문서는 Gemma 4의 E2B, E4B 모델과 Android 실행 경로를 안내하고 있다. 다만 모바일용 실행 환경이 제공된다는 사실과, 이 프로젝트가 특정 기기에서 충분히 빠르거나 정확하다는 것은 별개의 문제다.


실제 모델 파일과 런타임, 하드웨어 가속 설정을 맞춘 뒤의 측정은 아직 진행하지 않았다. [Google LiteRT-LM의 Gemma 4 문서](https://developers.google.com/edge/litert-lm/models/gemma-4)


RAGAS 점수는 임상적인 정확성 판정과 동일하지 않다. 근거 충실도는 제공된 자료와의 관계를 평가하므로, 원본 QA 자체가 잘못되었거나 오래된 경우까지 자동으로 해결하지 않는다. 같은 질문이 인덱스와 평가셋에 중복 포함되면 검색이 실제보다 쉬워질 수 있어, 자료 분리 기준을 먼저 확인할 필요가 있다.


아직 확인하지 못한 항목으로는 실제 기기의 최초 응답 시간, 연속 실행 시 메모리와 발열, 모델 부재, 시간 초과 경로의 동작, 독립 질문셋에 대한 근거 적합성이 있다. 기기나 서버가 바뀌어도 비교할 수 있도록 측정 조건과 결과를 함께 기록하는 것이 다음 단계다. Notion 메모리 MCP는 저장된 노트를 현재 질문의 문맥으로 다시 연결하는 별도 주제다.


## 함께 읽을 내용


모델 파일과 런타임, 검색과 생성의 역할을 구분하는 정도를 전제로 한다.


먼저 읽을 글: [모델 파일, 토크나이저, 런타임 정리](https://blog.namuori.net/posts/tech-k13/), [RAG의 검색과 답변 생성 과정](https://blog.namuori.net/posts/tech-k05/), [모델 추론과 대체 응답의 상태 기록](https://blog.namuori.net/posts/tech-s13/)


이어 읽을 글: [MedEdge의 모델 초기화와 응답 시간 측정](https://blog.namuori.net/posts/tech-05-02/)


## 참고

- [검색 색인 구현](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/vector_store.py): 해시 벡터 인덱스, 토큰화, 검색
- [답변 생성 처리](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/generation.py): LLM 클라이언트, 템플릿 폴백, 면책 문구
- [평가 처리](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/evaluation.py): 벤치마크, RAGAS 평가, 부트스트랩 CI

---


이전 글, [MV-EviRAG의 영상 선택과 답변 판단 과정](https://blog.namuori.net/posts/mvevirag-evidence-risk-control/)


다음 글, [Notion 메모리 MCP의 기록 저장과 문맥 구성](https://blog.namuori.net/posts/notion-mcp-memory-context/)


## 작업을 정리하며


사용자가 보는 답변에 어떤 처리 경로가 사용됐는지 남기는 것이 중요하다. 모델 실행과 템플릿 출력을 구분하면 응답 시간과 품질을 같은 조건으로 평가할 수 있다. 의료적 유효성과 안전성은 이 실행 검증에 더해 별도의 검증 체계가 필요한 과제다.
