---
title: "RGB, HSV와 색상 마스크 정리"
date: 2025-03-24
draft: false
slug: "tech-k20"
categories:
  - "AI 모델 실행"
tags:
  - "workflow"
summary: "색상 마스크를 정리하며 RGB와 HSV의 조건을 비교했다. 밝기가 달라지면 같은 물체도 고정된 RGB 범위에서 빠질 수 있다. 색상, 채도, 명도를 따로 조절하는 HSV가 이 경우를 어떻게 표현하는지 픽셀 계산으로 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-81ae-bb44-c6d0ab9f7398"
generated_by: "notion"
---
## 특정 색 영역만 골라내는 문제


색상 마스크를 정리하며 RGB와 HSV의 조건을 비교했다. 밝기가 달라지면 같은 물체도 고정된 RGB 범위에서 빠질 수 있다. 색상, 채도, 명도를 따로 조절하는 HSV가 이 경우를 어떻게 표현하는지 픽셀 계산으로 살펴봤다.


## RGB 임계값과 조명 조건


RGB는 빨강(R), 초록(G), 파랑(B) 세 채널의 밝기 조합으로 색을 표현한다. "빨간색"을 찾겠다고 R > 150, G < 50, B < 50 같은 조건을 걸면, 밝은 조명 아래 빨간 물체는 잘 걸러진다. 그런데 같은 물체가 그늘에 들어가면 R 값이 100 정도로 내려간다. 조건에 걸리지 않는다.


RGB에서는 색의 종류와 밝기가 세 채널에 함께 표현된다. 어두워지는 과정에서 세 값이 변하므로 밝은 조건에 맞춘 고정 범위가 같은 색을 놓칠 수 있다. 이 차이가 색공간을 바꿔 비교할 이유였다.


## HSV로 색 종류를 분리하는 방법


HSV는 색상(Hue), 채도(Saturation), 명도(Value) 세 축으로 색을 나눈다. 핵심은 Hue 축이 "색의 종류"만 담당한다는 점이다. 세 RGB 채널을 같은 비율로 줄이는 이상적인 예제에서는 H가 유지된다. 실제 조명은 색온도, 반사, 카메라 보정까지 바꾸므로 H와 S도 달라질 수 있다.


아래 범위는 OpenCV의 8비트 입력과 일반 `COLOR_BGR2HSV` 변환에 해당한다. 부동소수점 입력이나 HSV_FULL 변환은 표현 범위가 다르다([OpenCV Color Spaces Tutorial](https://docs.opencv.org/4.x/df/d9d/tutorial_py_colorspaces.html)).

- **H (색상)**: 0 ~ 179: 360도 색상환을 절반으로 나눈 값이다. Photoshop 등에서 H를 0~360으로 표기하는 것과 차이가 있으니 비교할 때 주의가 필요하다.
- **S (채도)**: 0 ~ 255
- **V (명도)**: 0 ~ 255

직접 계산으로 확인해 보면 동일 비율의 스케일 변화에서는 H가 보존되는 조건을 볼 수 있다. BGR (0, 0, 200)(순수한 빨강)의 경우, R=200이 최대값이므로 V=200, S=(200−0)/200×255=255이다. H=60×(G−B)/(V−min)=60×0/200=0이고, OpenCV는 이 값을 2로 나누어 0~179 범위에 맞추니 H=0이 된다.


같은 색을 절반 밝기로 줄인 BGR (0, 0, 100)에서도 계산을 따라가면 V=100, S=255, H=0이다. V만 200에서 100으로 바뀌었고 H는 그대로 0이다.


순수 빨강이 아닌 경우도 확인해 보면, BGR (0, 100, 200)(주황에 가까운 색)에서 R=200, G=100, B=0이므로 H=60×(100−0)/(200−0)=30, OpenCV H=15가 된다.


밝기를 절반으로 줄인 BGR (0, 50, 100)에서도 H=60×(50−0)/(100−0)=30, OpenCV H=15이다. 이 계산은 색 성분의 비율을 유지했고 클리핑과 양자화 오차를 무시했을 때의 결과다.


## 마스크로 원하는 색만 남기기


HSV로 변환한 뒤, `cv2.inRange()`로 범위 안에 드는 픽셀은 흰색(255), 나머지는 검은색(0)인 이진 마스크를 만든다.


```python
import cv2
import numpy as np

hsv = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2HSV)

lower_blue = np.array([110, 50, 50])
upper_blue = np.array([130, 255, 255])

mask = cv2.inRange(hsv, lower_blue, upper_blue)
result = cv2.bitwise_and(bgr_image, bgr_image, mask=mask)
```


H 범위를 110~130으로 잡으면 OpenCV 기준 파란 계열만 통과한다. S 하한을 50으로 둔 것은, 채도가 너무 낮은 회색 톤이 섞이는 것을 막기 위해서다.


특정 BGR 값의 HSV 대응값을 모를 때는 한 픽셀짜리 배열을 변환해서 확인할 수 있다.


```python
green_bgr = np.uint8([[[0, 255, 0]]])
green_hsv = cv2.cvtColor(green_bgr, cv2.COLOR_BGR2HSV)
# 결과: [[[60, 255, 255]]] — H가 60
```


H=60을 기준으로 ±10 정도를 잡으면 `[50, 100, 100]` ~ `[70, 255, 255]`가 초록 필터 범위가 된다.


![readable-K20-01.png](/images/notion/tech-k20/image-1.png)


_그림 1. 색 필터링 파이프라인(설명용 예제). BGR 이미지를 HSV로 변환하고 inRange로 마스크를 생성한 뒤 원본에 적용한다._


## 조명 변화에 따른 마스크 변화


HSV는 색상과 명도 조건을 따로 조절하기 편하며, 조명이 바뀌면 임계값도 다시 확인해야 한다. V가 극단적으로 낮아지면(거의 검은색에 가까운 환경)색상 정보 자체가 사라져 H 값이 불안정해진다.


S가 낮은 경우에도 마찬가지다. 흰색에 가까운 파스텔 톤은 채도가 낮아서 H가 흔들리기 쉽다. inRange에서 S 하한을 50이나 100으로 잡는 것이 관례처럼 쓰이는 이유가 여기에 있다.


![K20-02.png](/images/notion/tech-k20/image-2.png)


_그림 2. 같은 빨간 물체를 RGB 조건과 HSV 조건으로 걸러낸 결과 비교(설명용 예제). RGB는 그늘에서 탈락하지만, HSV는 이상적인 비례 밝기 변화에서는 두 예제가 같은 H 조건을 통과한다. 실제 촬영 결과가 아닌 직접 작성한 수치 예제다._


## 색 필터와 객체 인식의 경계


inRange의 결과는 지정 범위에 든 픽셀이다. 그 픽셀이 물체인지 배경인지는 이 연산만으로 정해지지 않는다. 노란색 조건이라면 택시뿐 아니라 같은 범위의 간판, 벽, 옷도 함께 선택될 수 있다.


색 필터는 객체 인식 파이프라인에서 후보 영역을 줄이는 전처리 단계로 쓰이고, 물체를 구별하려면 모양, 위치, 학습된 특징 등 추가 근거가 필요하다. 윤곽선을 얻는 것만으로 물체의 종류가 판정되지는 않는다.


빨강의 H 범위를 0~10과 170~179 두 구간으로 다루는 이유와, 파스텔 색을 포함할 때의 S 하한은 후속 실험 항목으로 정리했다. 색상환의 경계와 낮은 채도에서 생기는 잡음을 각각 비교할 내용이다.


---


**참고 자료**

- [OpenCV — Changing Colorspaces Tutorial](https://docs.opencv.org/4.x/df/d9d/tutorial_py_colorspaces.html)
- [OpenCV — cv2.inRange() API Reference](https://docs.opencv.org/4.x/d2/de8/group__core__array.html#ga48af0ab51e36436c5d04340e036ce981)

## 함께 읽기


이어 읽을 글: [화면 캡처와 모델 입력의 좌표 변환](https://blog.namuori.net/posts/tech-s17/), [display-share의 화면 캡처와 좌표 변환](https://blog.namuori.net/posts/tech-08-01/), [display-share의 색상 마스크와 객체 검출](https://blog.namuori.net/posts/tech-08-02/), [색상 도구의 입력 범위와 설정 관리](https://blog.namuori.net/posts/tech-08-03/)
