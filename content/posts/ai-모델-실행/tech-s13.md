---
title: "모델 추론과 대체 응답의 상태 기록"
date: 2026-06-01
draft: false
slug: "tech-s13"
categories:
  - "AI 모델 실행"
tags:
  - "workflow"
summary: "MedEdge의 생성 분기와 추론 서버의 상태 확인을 읽으며 서버 생존, 모델 준비, 실제 생성, 대체 응답을 나누었다. 화면에 표시된 답변이 어느 경로에서 만들어졌는지를 평가 기록과 연결해 정리했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dcdcd44-779f-8179-b8d5-effa80d09752"
generated_by: "notion"
math: true
---
MedEdge의 생성 분기와 추론 서버의 상태 확인을 읽으며 서버 생존, 모델 준비, 실제 생성, 대체 응답을 나누었다. 화면에 표시된 답변이 어느 경로에서 만들어졌는지를 평가 기록과 연결해 정리했다.


## 서버 응답에서 모델 준비 여부까지


kiit26-mededge-rag의 `OllamaClient` 클래스는 생성 호출 전에 [`available()`](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/generation.py) 메서드로 서버 상태를 확인한다.


`/api/tags` 엔드포인트에 GET 요청을 보내고, HTTP 200이 돌아오면 `True`를 반환한다. 타임아웃은 3초로 짧게 잡혀 있다.


```python
def available(self) -> bool:
    try:
        with urllib.request.urlopen(
            self._request("/api/tags", method="GET"), timeout=3
        ) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False
```


Ollama의 `/api/tags`는 서버가 보유한 모델 목록을 반환하는 엔드포인트다([Ollama API Introduction](https://docs.ollama.com/api/introduction)).


이 코드가 확인하는 것은 해당 엔드포인트의 HTTP 200 응답이다. 응답 본문의 모델 목록, 요청 모델의 존재, 메모리 로딩 상태와 추론 가능 여부는 별도 확인이 필요하다.


smartfarm-llm-inference의 모델 서버 관리 스크립트(저장소 접근 권한 필요)는 다른 방식을 사용한다. `health` 명령이 `curl -sS http://localhost:${PORT}/health`를 호출하는데, llama.cpp 서버의 `/health` 엔드포인트는 모델 로딩이 완료된 후에야 정상 응답을 돌려주므로 모델 준비 상태에 더 가까운 확인이 된다.


다만 이 스크립트는 curl 뒤에 `|| true`가 있고 HTTP 오류를 실패 종료로 강제하는 옵션도 없어서, 스크립트 종료 코드 0만으로 준비 완료를 판정할 수 없다. 응답 상태와 본문을 읽어야 한다.


## LLM이 실제로 답한 경우


답변 생성 처리의 `answer_question()` 함수를 따라가면 정상 경로가 보인다.


```python
def answer_question(question, hits, use_llm=True):
    if use_llm:
        client = OllamaClient()
        if client.available():
            try:
                return _with_disclaimer(
                    client.chat(system_prompt(), build_prompt(question, hits))
                )
            except (OSError, urllib.error.URLError, TimeoutError,
                    json.JSONDecodeError):
                pass
    return template_answer(question, hits)
```


`use_llm=True`이고, 서버가 `available()`이고, `client.chat()`이 예외 없이 완료되면 -- 세 조건을 모두 통과한 경우에만 LLM 생성 답변이 반환된다. `chat()` 내부에서는 `/api/chat` 엔드포인트에 모델명, 시스템 프롬프트, 사용자 프롬프트를 JSON으로 보내고 응답의 `message.content`를 추출한다.


이 경로에서 확인한 것은 검색 근거를 포함한 프롬프트의 전송이다. 모델의 근거 활용 여부는 응답과 원문을 대조할 범위로 남았다. chat 메서드는 content가 없을 때 빈 문자열을 반환하므로 예외 없는 종료와 유효한 본문도 구분했다.


## 실패 경로와 템플릿 폴백


`use_llm`이 꺼져 있거나 가용성 검사가 실패하면 템플릿으로 간다. 생성 호출에서는 코드에 열거된 예외가 잡혔을 때 템플릿으로 이어진다. 모든 종류의 오류가 잡히는 것은 아니므로 응답 구조가 예상과 다른 경우 등은 별도로 확인해야 한다.


```python
def template_answer(question, hits):
    if not hits:
        return _with_disclaimer(
            "검색된 근거가 부족하여 답변을 생성할 수 없습니다."
        )
    lines = [f"질문: {question}", "", "검색된 근거를 바탕으로 보면:"]
    for hit in hits:
        record = hit.record
        lines.append(
            f"- {record.answer} "
            f"(근거: {record.qa_id}, {record.domain}, score={hit.score:.3f})"
        )
    return _with_disclaimer("\n".join(lines))
```


템플릿 경로는 검색 결과에 저장된 원문 답변을 목록으로 보여 준다. 모델이 근거를 종합해 새 문장을 만드는 경로와 출력 방식이 달라 평가에서도 별도로 읽었다.


함수는 답변 문자열을 반환하며 실행 경로를 나타내는 별도 필드는 담지 않는다. 사용자에게 두 경로를 어떻게 표시하는지는 UI까지 확인할 항목으로 남았다.


![S13-01.png](/images/notion/tech-s13/image-1.png)


그림 1. answer_question의 생성 요청과 템플릿 분기. 잡히지 않은 예외는 도식 밖으로 전파될 수 있으며, 성공 경로에서도 빈 본문과 근거 충실성은 별도 확인이 필요하다. 출처: 답변 생성 처리를 바탕으로 직접 구성.


## 벤치마크 기록에서 경로를 구분하는 필드


답변 평가 기록의 `benchmark_row()` 함수는 각 질문에 대한 응답을 기록할 때 [`used_llm`](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/evaluation.py)[ 필드](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/evaluation.py)를 함께 저장한다.


`generate_answer()` 내부에서 `client.chat()`이 성공하면 `(answer, True)`를, 실패하거나 LLM 비활성 상태이면 `(answer, False)`를 반환한다.


```python
answer, used_llm = generate_answer(question, hits, ...)
return {
    "condition": condition,
    "answer": answer,
    "used_llm": used_llm,
    "latency_ms": elapsed_ms,
    ...
}
```


`used_llm=False`에는 LLM 비활성화, 가용성 검사 실패, 생성 중 예외가 함께 들어간다. 생성 경로를 구분하는 값이며, 실패 원인은 추가 로그로 확인해야 했다. 원인별 분석에는 별도의 결과 코드가 필요한 구조다.


지연 시간도 경로를 대신 판정하지 못한다. 생성 요청이 시간 초과된 뒤 템플릿을 조립하면 대체 응답도 오래 걸린다. 확인한 `benchmark_row`의 타이머는 `generate_answer` 호출을 감싸고, 검색은 이 함수에 들어오기 전에 끝난다. 따라서 저장된 `latency_ms`를 검색까지 포함한 전체 RAG 지연으로 해석하지 않았다.


`condition`은 llm_only 또는 rag_top3처럼 의도한 비교 조건이고, `used_llm`은 실제로 통과한 생성 경로의 기록이다. 둘을 함께 읽어야 조건 이름만으로 모델 호출을 성공한 것으로 세는 일을 피할 수 있다. 이 글에서는 실행 시간을 새로 측정하지 않았다.


## 서버 프로세스와 모델 파일의 분리


smartfarm-llm-inference의 모델 서버 시작 스크립트(저장소 접근 권한 필요)는 서버를 시작하기 전에 두 가지를 순서대로 확인한다.


첫째, `llama-server` 바이너리가 존재하는지 확인한다. 로컬 빌드 경로(`./llama.cpp/build/bin/llama-server`)를 먼저 찾고, 없으면 PATH에서 찾는다. 둘째, 모델 파일이 존재하는지 확인한다. `MODEL_PATH`가 지정되지 않으면 `./models/` 아래에서 후보 GGUF 파일을 순서대로 탐색한다.


```bash
for cand in \
    "./models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf" \
    "./models/Qwen3-4B-Q4_K_M.gguf" \
    "./models/qwen2.5-1.5b-instruct-q4_k_m.gguf"
do
    if [ -f "$cand" ]; then MODEL_PATH="$cand"; break; fi
done
```


서버 프로세스는 모델 파일이 없으면 시작조차 하지 않는다. 하지만 컨테이너 실행 설정에서는 이미지(`ghcr.io/ggml-org/llama.cpp:server-cuda`)와 모델 파일이 분리되어 있다.


호스트의 `./models/`에 GGUF 파일이 없으면 이미지를 내려받아도 컨테이너가 시작 직후 종료되는 경로다. 모델 파일 준비를 이미지 설치와 별도 단계로 읽었다.


![S13-02.png](/images/notion/tech-s13/image-2.png)


그림 2. 파일 준비, 서버 준비, 실제 생성, 본문 검증을 나눈 설명용 흐름. 준비 상태가 정상이어도 개별 요청이 메모리, 입력, 시간 제한으로 실패할 수 있다. 출처: 서버 시작 스크립트와 llama.cpp 서버 문서를 바탕으로 직접 구성.


후속 확인에서는 템플릿으로 넘어간 원인과 질문 유형을 함께 기록할 수 있다. 서버 응답 상태와 현재 `OllamaClient.timeout=60.0` 설정을 대조하면 시간 초과가 발생한 조건을 좁힐 수 있다.


`used_llm=True`인 응답은 검색 근거 활용 여부를 추가로 평가할 대상이다. 근거와 답변의 대응을 보는 faithfulness 같은 지표를 연결할 내용으로 남겼다.


**참고**

- [Ollama API Introduction -- docs.ollama.com](https://docs.ollama.com/api/introduction)
- [kiit26-mededge-rag 답변 생성 처리](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/generation.py)
- [kiit26-mededge-rag 답변 평가 기록](https://github.com/NAMUORI00/ondevice-medical-rag/blob/d5dd214987338e1e57664bb6143ce9d38436c14e/src/mededge_rag/evaluation.py)
- [Ollama 모델 목록 API](https://docs.ollama.com/api/tags): 모델 목록 조회의 의미
- [llama.cpp 서버 문서](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md): 준비 상태와 요청 API
- [모델 서버 관리 스크립트](https://github.com/NAMUORI00/smartfarm-llm-inference/blob/ec2d186934b77e5ec272eabf9a0bae7a71baf4ae/scripts/llm/llama-local-manage.sh) (저장소 접근 권한 필요): 서버 시작, 상태 확인 스크립트
- [모델 서버 시작 스크립트](https://github.com/NAMUORI00/smartfarm-llm-inference/blob/ec2d186934b77e5ec272eabf9a0bae7a71baf4ae/scripts/llm/run-llama-local.sh) (저장소 접근 권한 필요): 서버 시작, 상태 확인 스크립트

## 함께 읽기


먼저 읽을 글: [모델 파일, 토크나이저, 런타임 정리](https://blog.namuori.net/posts/tech-k13/), [LLM 추론 단계와 토큰 생성 시간](https://blog.namuori.net/posts/tech-k14/)


이어 읽을 글: [스마트팜 추론 서버의 실행 설정과 준비 상태](https://blog.namuori.net/posts/tech-03-04/), [MedEdge의 로컬 검색과 답변 생성 경로](https://blog.namuori.net/posts/mededge-ondevice-rag-boundaries/), [MedEdge의 모델 초기화와 응답 시간 측정](https://blog.namuori.net/posts/tech-05-02/)
