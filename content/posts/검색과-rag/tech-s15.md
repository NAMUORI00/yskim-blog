---
title: "영상 근거의 구조와 충분성 검토"
date: 2026-05-27
draft: false
slug: "tech-s15"
categories:
  - "검색과 RAG"
tags:
  - "workflow"
summary: "CCTV 근거 RAG의 인공 테스트 자료에서 영상의 존재, 관련 장면, 답변에 필요한 단서를 나누어 읽었다. 카메라 두 대의 파일이 있어도 사건 장면이 가려질 수 있어 각 조건을 별도로 정리했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dcdcd44-779f-8109-bbcf-c8cfd7af0444"
generated_by: "notion"
---
## 카메라 입력과 답변 근거


CCTV 근거 RAG의 인공 테스트 자료에서 영상의 존재, 관련 장면, 답변에 필요한 단서를 나누어 읽었다. 카메라 두 대의 파일이 있어도 사건 장면이 가려질 수 있어 각 조건을 별도로 정리했다.


CCTV 영상 증거 RAG 프로젝트의 테스트 코드에는 한 쌍의 카메라를 가정한 자료가 있다. 검증 함수를 확인하기 위해 구성한 인공 데이터다. 메타데이터에는 c1을 1920×1080, c2를 1280×720, 길이를 각각 12.5초로 적어 두었다. 캡션은 같은 출입구를 다른 각도에서 보는 상황을 가정한다. 샘플에는 c1의 프레임 10, 12와 c2의 11, 13에 주석 항목을 넣었다.


테스트는 이 입력으로 패킷 4건이 만들어지는지를 확인하도록 작성돼 있다. 코드의 기대값을 실제 영상에서 사건을 검출한 결과로 해석할 수는 없다. (저장소 접근 권한 필요, [commit 955287b](https://github.com/NAMUORI00/CCTV_Video_Evidence_RAG_IEEE/blob/955287ba34233a9a87200cad62320c21b092c9e6/tests/test_annotation_validation.py))


카메라 c2의 증거 섹션이 아예 빠져 있으면, 검증 단계에서 "annotations.evidence.c2 is required"라는 오류가 발생한다. 영상 파일이 있느냐와 해당 시점의 증거 레코드가 있느냐는 다른 문제다.


## 증거 패킷 하나에 담기는 정보


개별 증거 항목은 프레임 번호, 객체 ID, 바운딩 박스 좌표, 객체 라벨, 소속 시점, 원본 영상 메타데이터를 묶어서 하나의 패킷으로 구성된다.


위 샘플에서 첫 번째 패킷을 읽으면 이벤트 클래스가 fall, 시점이 c1, 프레임 번호가 10, 바운딩 박스가 `[100, 120, 200, 320]`이다. 영상 메타데이터에서 파일명은 sample_`c1.mp`4로 기록된다.


이 패킷에 대해 시스템은 형식 검증을 먼저 수행한다. bbox의 좌표 관계(x2 > x1, y2 > y1)가 만족되는지, bbox가 해당 영상의 해상도 경계 안에 있는지, 프레임 번호가 음이 아닌 정수인지 확인한다. c2 영상의 해상도가 1280×720인데 bbox의 x2가 1300이면 "outside video bounds"로 판정된다.


프레임 번호가 10.5처럼 정수가 아닌 값이면 "frame_id must be a non-negative integer" 오류가 발생한다. 같은 시점 안에서 frame_id, obj_id, obj_bbox, obj_label 배열의 길이가 다르면 "array lengths are inconsistent"로 걸린다.


형식 검증은 증거 레코드의 구조를 확인하는 단계로 읽었다. 이 검사 결과와 실제 영상에서 사건을 확인하는 결과는 구분된다.


## 빈 근거 입력과 답변 보류 평가


영상이 존재하지만 검색된 증거 프레임이 하나도 첨부되지 않은 상태에서 모델이 어떻게 반응하는지 확인하는 스트레스 테스트가 있다. 이 테스트는 기존 증거 패킷 목록에서 샘플 ID와 이벤트 클래스를 가져오되, VLM에 보내는 이미지를 0장으로 설정한다. 프롬프트에는 "Retrieved evidence: NONE"이라고 명시하고, 검색된 증거만 사용하라고 지시한다.


이 스크립트에는 보류율, 무증거 답변 지표, 파싱 성공률, 잘못된 인용 관련 집계가 있다. 여기서 세 항목을 먼저 구분했다. 보류율(abstention_rate)은 모델이 abstain=true를 반환한 비율이고, 무증거 허위답변율로 이름 붙인 값은 event_present=true이면서 보류하지 않은 비율이며, 파싱 성공율은 JSON 응답이 정상적으로 파싱된 비율이다.


이 실험의 계약에서는 증거가 없으면 보류해야 하고, evidence_quality는 none이어야 한다. 다만 이 지표는 무근거 긍정 응답을 세는 규칙이지 모든 종류의 무근거 답변을 포괄하지는 않는다. event_present=false로 단정한 응답과 파싱 실패도 따로 봐야 한다. 이 글은 보류 판단의 검사 조건을 다루며, 모델 호출을 통한 보류율 측정은 후속 평가 항목이다.


이 테스트에서는 영상 파일의 존재와 모델에 전달된 검색 증거를 따로 다룬다. 근거 없이 답변한 경로를 확인하기 위한 입력 조건이다.


RAG 시스템에서 증거 충분성에 따른 보류는 최근 연구에서도 중요한 과제로 다루어지고 있다([GRACE, arXiv:2601.04525](https://arxiv.org/abs/2601.04525), [SURE-RAG, arXiv:2605.03534](https://arxiv.org/abs/2605.03534)).


![readable-S15-01.png](/images/notion/tech-s15/image-1.png)


그림 1. 주석의 형식 검사와 실제 영상 근거의 충분성을 나눈 설명용 흐름. 검증 함수의 확인 범위와 후속 판단 단계를 함께 구분한 흐름이다. 출처: 주석 테스트와 본문 예제를 바탕으로 직접 구성.


## 다중 시점에서 같은 객체를 식별하는 부담


c1에서 사람의 객체 ID가 p1이고 c2에서 같은 사람의 객체 ID가 p7이라면, 이 둘이 같은 사람인지 확인하는 작업이 별도로 필요하다. 증거 패킷 자체는 시점별로 독립적이므로, 시점 간 객체 연결은 크로스 뷰 매칭이나 ReID 같은 추가 처리가 담당해야 한다.


위 인공 샘플은 각 시점에 항목 두 개를 넣었기 때문에 패킷 네 건을 기대한다. 실제 패킷 수는 입력과 구성 조건에 따라 달라진다. 이 테스트 계약에서는 한쪽 evidence 섹션을 삭제하면 오류가 발생하도록 검사한다.


기록할 상태를 영상 파일 없음, 해당 이벤트의 증거 프레임 없음, 증거 레코드의 형식 오류로 나누었다. bbox가 해상도를 벗어나는 경우는 마지막 상태에 해당한다. 원인별 처리를 읽는 기준으로 삼았다.


## 감사 분류: 수락한 판단이 맞았는지 확인하기


MOT 추적 연구에서는 VLM이 내린 판단을 GT와 대조하여 감사 분류를 수행한다. 트래커의 예측 박스와 GT 박스 사이의 IoU를 계산하고, IoU 임계값(기본 0.5) 이상으로 매칭된 경우 GT ID를 확인한다. (저장소 접근 권한 필요, [commit 01d05e7](https://github.com/NAMUORI00/Detection_Track/blob/01d05e773c864348252c31a2607ebbdfdc029a5b/detection_track/research/audit_runtime_vlm_events.py))


VLM이 두 바운딩 박스가 같은 사람이라고 수락했을 때, GT ID가 실제로 일치하면 true_accept이고 일치하지 않으면 false_accept다. 거부한 경우도 마찬가지로 true_reject와 false_reject로 나뉜다. 어느 쪽이든 GT 박스와의 매칭이 실패하면 unknown으로 분류된다.


확인한 감사 스크립트는 기록된 판단과 GT를 읽어 사후 분류하는 경로다. GT가 런타임 판단에 개입하면 정답 누출이 되기 때문이다. 감사 결과에서 false_accept가 발생했다면, 기록된 수락 판단이 이 GT 매칭 기준과 어긋났다는 뜻이다.


감사 로그만으로 모델에 전달된 모든 이미지나 모델 내부의 활용을 증명하지는 못한다. 영상을 읽은 것과 판단 근거가 유효한 것은 별개의 문제다.


![S15-02.png](/images/notion/tech-s15/image-2.png)


그림 2. 기록된 객체 동일성 판단을 GT 매칭과 대조하는 감사 분류. unknown을 정답이나 오답으로 자동 치환하지 않는다. 출처: 실행 중 객체 동일성 판단을 대조하는 검사 코드를 바탕으로 직접 구성.


## 존재, 구조, 충분성의 세 층


확인한 범위를 영상의 존재, 증거의 구조, 답변의 충분성으로 나누어 정리했다.


첫째, **영상의 존재**. 카메라 c1, c2의 파일이 있고, 해상도와 길이 정보가 기록되어 있다. 이 층에서 확인할 수 있는 것은 "입력이 있다"는 사실뿐이다.


둘째, **증거의 구조**. 특정 프레임에서 특정 객체가 유효한 bbox와 함께 기록되어 있다. 시점별 형식 검증을 통과했다. 이 형식 검사만으로 해당 프레임에 사건이 실제 보인다거나 디코딩이 성공했다고 보장되지는 않는다.


셋째, **답변의 충분성**. 질문에 필요한 단서가 있는지와 보류 여부를 판단하는 범위다. high, medium, none 같은 증거 품질 표현은 이 판단 기준과 연결해 읽을 항목이다. 근거 기반 답변은 주장과 증거가 대응하는지 확인하는 대상이다.


영상의 존재만으로 답변의 근거를 확인할 수는 없었다. 검색된 증거와 주장의 대응을 별도로 검토하는 이유다. 객체 동일성 감사와 사건 답변의 충분성도 평가 대상이 달라 각각의 지표로 읽었다.


후속 비교에서는 증거 프레임 수에 따른 보류율과 허위답변율을 함께 볼 수 있다. 두 시점의 품질 차이가 큰 조건에서 근거 선택이 답변 정확도에 미치는 영향도 별도 평가 항목으로 남겼다.


---


**참고 자료**

- GRACE: Reinforcement Learning for Grounded Response and Abstention under Contextual Evidence: [https://arxiv.org/abs/2601.04525](https://arxiv.org/abs/2601.04525)
- SURE-RAG: Sufficiency and Uncertainty-Aware Evidence Verification for Selective RAG: [https://arxiv.org/abs/2605.03534](https://arxiv.org/abs/2605.03534)
- CCTV_Video_Evidence_RAG_IEEE 저장소 (비공개, 저장소 접근 권한 필요): [commit 955287b](https://github.com/NAMUORI00/CCTV_Video_Evidence_RAG_IEEE/blob/955287ba34233a9a87200cad62320c21b092c9e6/README.md)
- Detection_Track 저장소 (비공개, 저장소 접근 권한 필요): [commit 01d05e7](https://github.com/NAMUORI00/Detection_Track/blob/01d05e773c864348252c31a2607ebbdfdc029a5b/README.md)
- [무증거 스트레스 테스트](https://github.com/NAMUORI00/CCTV_Video_Evidence_RAG_IEEE/blob/955287ba34233a9a87200cad62320c21b092c9e6/scripts/wp39_abstention_stress_test.py) (저장소 접근 권한 필요): 지표의 실제 계산 조건

## 함께 읽기


먼저 읽을 글: [영상 프레임과 객체 추적의 시간 정보](https://blog.namuori.net/posts/tech-k12/), [답변 보류와 선택적 예측의 평가 지표](https://blog.namuori.net/posts/tech-k11/)


이어 읽을 글: [MV-EviRAG의 영상 선택과 답변 판단 과정](https://blog.namuori.net/posts/mvevirag-evidence-risk-control/), [CCTV RAG의 프레임 식별과 인용 관리](https://blog.namuori.net/posts/tech-04-04/), [Detection_Track의 객체 추적과 ID 복구](https://blog.namuori.net/posts/tech-04-05/), [FoodScan의 이미지 검색과 영양정보 연결](https://blog.namuori.net/posts/tech-13-05/)
