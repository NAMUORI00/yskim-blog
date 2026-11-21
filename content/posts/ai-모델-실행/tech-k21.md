---
title: "오디오 샘플링과 주파수 분석"
date: 2025-01-11
draft: false
slug: "tech-k21"
categories:
  - "AI 모델 실행"
tags:
  - "workflow"
summary: "오디오의 시간과 주파수 표현을 정리했다. 소리를 일정 간격으로 기록하는 샘플링부터 파형의 구간별 주파수 성분을 보는 과정까지 연결했다. 파형을 직접 사용하는 모델도 있어, 이 변환은 모든 오디오 처리의 필수 단계로 가정하지 않았다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8136-ac4c-c0a4c65e2729"
generated_by: "notion"
---
## 소리를 숫자로 기록한다는 것


오디오의 시간과 주파수 표현을 정리했다. 소리를 일정 간격으로 기록하는 샘플링부터 파형의 구간별 주파수 성분을 보는 과정까지 연결했다. 파형을 직접 사용하는 모델도 있어, 이 변환은 모든 오디오 처리의 필수 단계로 가정하지 않았다.


마이크에 들어온 소리는 연속적인 공기 진동이다. 이것을 컴퓨터로 다루려면 일정 간격으로 진폭을 측정해서 숫자의 나열로 바꿔야 한다. 이 과정이 샘플링이다.


초당 몇 번 측정하느냐가 샘플링 레이트(sample rate)이고, CD 음질의 표준인 44,100Hz는 1초에 44,100개의 숫자를 기록한다는 뜻이다. 모노라면 1초가 44,100개 샘플이며, 스테레오는 각 채널에 같은 수의 샘플이 있다.


## 샘플링 레이트가 정하는 한계


대역 제한된 신호를 이상적으로 복원하려면 샘플링 레이트가 포함할 최대 주파수의 두 배보다 커야 한다. 샘플링 레이트의 절반을 나이퀴스트 주파수라고 부르지만, 그 경계의 모든 신호를 정확히 기록할 수 있다는 뜻으로 읽으면 안 된다. 예를 들어 경계 주파수의 사인파는 샘플링 위상에 따라 모두 0으로 관측될 수도 있다.


44,100Hz의 경계는 22,050Hz다. 실제 녹음은 그 위의 성분이 낮은 주파수로 겹쳐 보이지 않도록 샘플링 전에 필터링하며, 필터의 전이 구간도 필요하다. 8,000Hz라면 경계는 4,000Hz로 내려간다. 이 숫자만으로 녹음 품질 전체를 판단할 수는 없고, 마이크, 필터, 양자화, 코덱 조건을 함께 봐야 한다.


## 주파수 성분 분석


한 곡의 음악에는 여러 음높이가 동시에 들어 있다. 시간축으로 파형을 보면 복잡한 곡선일 뿐이지만, 푸리에 변환(Fourier Transform)을 적용하면 어떤 주파수가 얼마나 강한지를 분리해서 볼 수 있다.


440Hz 사인파(라 음)와 880Hz 사인파(한 옥타브 위 라 음)를 합성한 신호로 확인해 보면 과정이 분명해진다.


```python
import numpy as np

sr = 44100
t = np.arange(0, 0.1, 1/sr)   # 0.1초, 4410개 샘플
signal = np.sin(2 * np.pi * 440 * t) + 0.5 * np.sin(2 * np.pi * 880 * t)
```


진폭 1.0인 440Hz 파와 진폭 0.5인 880Hz 파를 더했다. 이 신호의 파형은 두 사인파가 합쳐져서 불규칙해 보인다. 여기에 [`numpy.fft.rfft`](https://numpy.org/doc/stable/reference/routines.fft.html)를 적용하면 주파수별 크기가 분리된다.


```python
spectrum = np.fft.rfft(signal)
freqs = np.fft.rfftfreq(len(signal), d=1/sr)
magnitude = np.abs(spectrum)
```


`rfft`는 실수 입력에 최적화된 FFT이다. 실수 신호의 스펙트럼은 대칭(Hermitian symmetry)이라서, 양의 주파수 성분만 계산해도 정보 손실이 없다. n개 입력에서 n//2+1개의 복소수를 반환한다. 4,410개 샘플이면 2,206개 복소수가 나오고, 일반 `fft`가 4,410개를 반환하는 것에 비해 출력이 절반이다.


magnitude 배열을 그래프로 그리면 440Hz와 880Hz에 뾰족한 봉우리가 나타난다. 880Hz 봉우리의 높이는 440Hz 봉우리의 약 절반인데, 합성할 때 진폭을 0.5로 지정했기 때문이다.


![readable-K21-01.png](/images/notion/tech-k21/image-1.png)


_그림 1. 오디오 신호 처리의 두 갈래(설명용 예제). 전체 신호에 FFT를 적용하면 주파수 분포를, 구간별로 STFT를 적용하면 시간에 따른 주파수 변화를 볼 수 있다._


## 시간 구간별 주파수 분석


앞의 FFT 결과는 0.1초 전체에 440Hz와 880Hz가 있다는 것만 알려 준다. 만약 앞쪽과 뒤쪽에서 서로 다른 음이 났다면 전체 크기 스펙트럼만으로 발생 시점을 읽기는 어렵다. 복소 FFT에는 위상 정보도 포함된다. 위상을 포함한 전체 복소 FFT는 원래 파형으로 역변환할 수 있지만, 크기 그래프에는 시간별 구간 표시가 없다는 점이 문제다.


이 한계를 해결하는 것이 짧은 시간 푸리에 변환(Short-Time Fourier Transform, STFT)이다. 전체 신호를 짧은 구간(윈도우)으로 나누고, 각 구간에 FFT를 적용한다.


```python
from scipy.signal import stft

f, t_segments, Zxx = stft(signal, fs=sr, nperseg=1024, noverlap=512,
                              boundary=None, padded=False)
```


`nperseg=1024`는 한 구간이 1,024 샘플이라는 뜻이다. 44,100Hz 기준으로 약 23ms에 해당한다.


이 구간마다 주파수 분석을 수행해서, "이 시점에 어떤 주파수가 강한가"를 시간 축을 따라 확인할 수 있다([SciPy — scipy.signal.stft](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.stft.html)).


## 스펙트로그램과 윈도우 크기의 트레이드오프


STFT 결과를 시각화한 것이 스펙트로그램이다. 가로축이 시간, 세로축이 주파수, 밝기나 색이 해당 시점, 주파수의 에너지를 나타낸다.


```python
spectrogram_data = np.abs(Zxx) ** 2
```


STFT 출력 `Zxx`의 절대값을 제곱하면 시간, 주파수별 제곱 크기를 볼 수 있다. 이를 물리적 전력 밀도로 읽는 경우에는 정규화와 scaling 조건이 더 필요하다. 음성 인식이나 음악 분석의 입력 표현을 읽을 때도 이 계산 조건을 함께 확인할 수 있다.


![K21-02.png](/images/notion/tech-k21/image-2.png)


_그림 2. STFT의 윈도우 분할과 결합 과정(설명용 예제). 인접 구간을 절반씩 겹쳐 시간 변화를 매끄럽게 잡는다._


윈도우 크기를 어떻게 정하느냐에 따라 시간 해상도와 주파수 해상도 사이에 트레이드오프가 생긴다. FFT 길이를 윈도우 길이와 같게 두면 주파수 빈 간격은 샘플링 레이트를 윈도우 크기로 나눈 값이다. 실제 두 음의 분리 가능성은 창 함수와 관측 길이, 신호 크기 및 잡음에도 영향을 받는다.

- **1,024 샘플 윈도우**: 빈 간격 = 44,100 / 1,024 ≈ 43Hz. 창 길이는 약 23ms이며 512샘플씩 이동하면 분석 시점 간격은 약 11.6ms다.
- **4,096 샘플 윈도우**: 빈 간격 = 44,100 / 4,096 ≈ 10.8Hz. 창 길이는 약 93ms다. 빈이 촘촘해져도 10Hz 차이의 두 음을 항상 분리한다는 보장은 없다.

윈도우가 길면 주파수를 세밀하게 보는 대신 시간 위치가 뭉뚱그려지고, 짧으면 시간 변화를 잘 잡는 대신 주파수 구분이 거칠어진다. 창 길이를 고를 때는 관심 있는 변화가 얼마 동안 지속되는지부터 확인할 필요가 있다. 인접 윈도우를 절반씩 겹쳐서(overlap) 사용하는 것도 급격한 경계에서 정보가 잘리는 것을 완화한다.


SciPy에서 위 예제의 `scipy.signal.stft`와 `scipy.signal.spectrogram`은 현재 레거시로 분류되어 있으며, 더 많은 기능을 갖춘 [`ShortTimeFFT`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ShortTimeFFT.html)가 대체로 권장된다.


기존 예제의 `spectrogram`과 대안인 `ShortTimeFFT`는 기능과 출력 조건을 대조할 대상으로 정리했다. API 분류만으로 기존 실행의 정상 여부까지 판단하지는 않았다.


멜 스케일(mel scale)의 비선형 주파수 축과 한(Hann) 윈도우의 스펙트럼 누출(spectral leakage) 변화는 후속 주제로 남겼다. 중간 표현을 모델 입력으로 만들 때 어떤 시간, 주파수 정보를 강조하는지 이어서 살펴볼 수 있다.


---


**참고 자료**

- [NumPy — Discrete Fourier Transform (numpy.fft)](https://numpy.org/doc/stable/reference/routines.fft.html)
- [SciPy — scipy.signal.stft](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.stft.html)
- [SciPy — scipy.signal.spectrogram](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.spectrogram.html)
- [SciPy — ShortTimeFFT (권장 대체)](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ShortTimeFFT.html)

## 함께 읽기


이어 읽을 글: [음원 분리, 음성 변환, 음성 합성 비교](https://blog.namuori.net/posts/tech-k22/), [오디오 처리 단계의 시간 단위와 특징 표현](https://blog.namuori.net/posts/tech-s18/), [MusicSplitterWeb의 업로드와 음원 처리 흐름](https://blog.namuori.net/posts/tech-09-01/), [음원 분리 모델의 학습 코드와 실행 환경](https://blog.namuori.net/posts/tech-09-02/)
