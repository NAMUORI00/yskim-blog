---
title: "오디오 샘플링과 주파수 분석"
date: 2025-01-11
draft: false
slug: "tech-k21"
categories:
  - "AI 모델 실행"
tags:
  - "workflow"
summary: "연속된 소리 신호를 숫자로 기록하는 샘플링과 나이퀴스트 주파수의 한계를 짚고, 파형에서 주파수 성분을 분리하는 FFT와 시간 구간별 변화를 추적하는 STFT 스펙트로그램 및 윈도우 크기의 트레이드오프를 살펴본다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8136-ac4c-c0a4c65e2729"
generated_by: "notion"
math: true
---
소리를 녹음해 시간축 파형(waveform)으로 그려 보면 진폭이 오르내리는 복잡한 곡선이 나타난다. 파형을 그대로 입력받는 오디오 모델도 있지만, 지금 어떤 높낮이의 소리가 섞여 있는지, 또 시간에 따라 그 음들이 어떻게 바뀌는지를 다루려면 시간축 파형만으로는 부족할 때가 많다. 연속된 공기 진동을 컴퓨터가 다룰 수 있는 숫자 배열로 바꾸는 샘플링부터, 파형에서 주파수 성분을 분리하는 푸리에 변환, 그리고 시간 흐름에 따른 주파수 변화를 보여 주는 스펙트로그램까지 오디오 신호가 변환되는 과정을 차례대로 따라가 본다.


## 연속된 소리를 숫자로 바꾸는 샘플링


마이크에 들어온 소리는 연속적인 공기 진동이다. 컴퓨터가 이 신호를 다루려면 일정한 시간 간격으로 진폭을 측정해 숫자의 나열로 바꿔야 하는데, 이 과정을 **샘플링**(sampling)이라고 한다.


1초 동안 진폭을 몇 번 측정하는지를 **샘플링 레이트**(sample rate)라고 부른다. 예를 들어 CD 음질의 표준인 44,100Hz는 1초에 44,100번 진폭을 재서 숫자 44,100개를 기록한다는 뜻이다. 단일 채널인 모노(mono) 오디오라면 1초가 44,100개 샘플로 이루어지고, 좌우 두 채널을 쓰는 스테레오(stereo)라면 각 채널에 같은 수의 샘플이 들어간다.


## 샘플링 레이트와 나이퀴스트 주파수의 한계


그렇다면 1초에 44,100번 측정할 때 얼마나 높은 주파수의 소리까지 기록할 수 있을까. 주파수 대역이 제한된 신호를 온전히 복원하려면, 샘플링 레이트가 신호에 포함된 최대 주파수의 두 배보다 커야 한다. 샘플링 레이트의 절반에 해당하는 값을 **나이퀴스트 주파수**(Nyquist frequency)라고 부른다. 샘플링 레이트가 44,100Hz라면 경계인 나이퀴스트 주파수는 22,050Hz가 되고, 8,000Hz라면 경계는 4,000Hz로 내려간다.


다만 그 경계의 모든 신호를 언제나 온전히 기록할 수 있다는 뜻으로 읽으면 안 된다. 예를 들어 정확히 경계 주파수로 진동하는 사인파가 들어올 때, 샘플링 시점(위상)이 파형의 영점과 맞물리면 모든 샘플이 0으로 관측될 수도 있다. 또한 경계보다 높은 주파수 성분이 섞여 있으면 샘플링 뒤에 오히려 낮은 주파수 성분처럼 겹쳐 보이는 현상이 생긴다. 그래서 실제 녹음 과정에서는 샘플링 전에 경계 이상의 성분을 걸러 내는 필터를 거치며, 이 필터가 감쇠하는 전이 구간도 확보해야 한다. 결국 샘플링 레이트 숫자 하나로만 녹음 품질 전체를 판단할 수는 없고, 마이크와 필터 특성, 샘플당 표현 정밀도를 정하는 양자화(quantization), 코덱 조건을 함께 봐야 한다.


## 파형에서 주파수 성분을 분리하는 푸리에 변환


한 곡의 음악에는 여러 음높이가 동시에 들어 있다. 시간축을 따라 그린 파형만 보면 여러 진동이 합쳐진 곡선만 보이지만, **푸리에 변환**(Fourier Transform)을 적용하면 어떤 주파수 성분이 얼마나 강하게 섞여 있는지 분리해서 볼 수 있다.


진폭이 1.0인 440Hz 사인파(라 음)와 진폭이 0.5인 880Hz 사인파(한 옥타브 위 라 음)를 합성한 0.1초짜리 신호로 이 과정을 확인해 보자.


```python
import numpy as np

sr = 44100
t = np.arange(0, 0.1, 1/sr)   # 0.1초, 4410개 샘플
signal = np.sin(2 * np.pi * 440 * t) + 0.5 * np.sin(2 * np.pi * 880 * t)
```


두 사인파가 합쳐진 `signal`의 파형은 시간축에서 불규칙해 보인다. 여기에 고속 푸리에 변환(Fast Fourier Transform, FFT) 함수인 [`numpy.fft.rfft`](https://numpy.org/doc/stable/reference/routines.fft.html)를 적용하면 주파수별 크기가 분리된다.


```python
spectrum = np.fft.rfft(signal)
freqs = np.fft.rfftfreq(len(signal), d=1/sr)
magnitude = np.abs(spectrum)
```


일반 `fft` 대신 `rfft`를 쓴 이유는 입력 파형이 실수 신호이기 때문이다. 실수 신호를 변환한 스펙트럼은 양의 주파수와 음의 주파수가 켤레 대칭(Hermitian symmetry)을 이루므로, 양의 주파수 성분만 계산해도 정보 손실이 없다. 길이가 $n$인 입력에서 일반 `fft`는 $n$개의 복소수를 반환하지만, `rfft`는 `n // 2 + 1`개의 복소수를 반환한다. 위 예제처럼 4,410개 샘플을 넣으면 2,206개 복소수가 나오므로 출력 크기가 약 절반으로 줄어든다.


복소수 결과의 절댓값인 `magnitude` 배열을 주파수 축(`freqs`)에 맞춰 그래프로 그리면 440Hz와 880Hz 위치에 뾰족한 봉우리가 나타난다. 합성할 때 880Hz 사인파의 진폭을 0.5로 지정했기 때문에 880Hz 봉우리의 높이는 440Hz 봉우리의 약 절반이 된다.


![440Hz와 880Hz 사인파가 합쳐진 4,410개 샘플 파형에 rfft를 적용해 440Hz와 880Hz 두 봉우리를 가진 크기 스펙트럼을 얻는 다이어그램](/images/notion/tech-k21/image-1.png)


그림 1. 440Hz와 880Hz 사인파를 합성한 0.1초 파형에 rfft를 적용해 주파수별 크기를 분리하는 예제 과정.


## 시간 흐름을 함께 보는 짧은 시간 푸리에 변환


앞의 `rfft` 크기 그래프는 0.1초 구간 전체에 440Hz와 880Hz 성분이 들어 있다는 사실만 알려 준다. 만약 앞부분과 뒷부분에서 서로 다른 음이 차례로 울렸더라도, 전체 구간의 크기 스펙트럼만 보고는 각 음이 발생한 시점을 읽기 어렵다. 복소수 형태의 FFT 결과에는 위상(phase) 정보도 함께 들어 있어서 역변환을 하면 원래 파형으로 되돌릴 수 있지만, 절댓값만 그린 크기 스펙트럼에는 시간 구간이 따로 표시되지 않는다.


시간에 따라 주파수 성분이 어떻게 바뀌는지 보려면 신호 전체를 한 번에 변환하는 대신 짧은 구간으로 나누어야 한다. 전체 신호를 짧은 구간(윈도우, window)으로 자르고 각 구간마다 FFT를 적용하는 방법이 **짧은 시간 푸리에 변환**(Short-Time Fourier Transform, STFT)이다.


![마이크의 연속 진동을 44,100Hz로 샘플링해 파형 데이터를 만든 뒤 전체 분석인 FFT와 구간별 분석인 STFT로 나뉘는 흐름도](/images/notion/tech-k21/image-2.png)


그림 2. 샘플링한 파형 데이터에서 전체 신호의 주파수 분포를 구하는 FFT와 시간 구간별 변화를 구하는 STFT의 처리 갈래(설명용 예제).


파이썬에서는 [`scipy.signal.stft`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.stft.html) 함수로 구간 길이와 겹침 정도를 지정해 STFT를 계산한다.


```python
from scipy.signal import stft

f, t_segments, Zxx = stft(signal, fs=sr, nperseg=1024, noverlap=512,
                              boundary=None, padded=False)
```


`nperseg=1024`는 한 윈도우 구간을 1,024 샘플로 잡는다는 뜻이다. 44,100Hz 샘플링 레이트 기준으로는 약 23ms에 해당한다. `noverlap=512`로 설정하면 인접한 구간을 512 샘플(절반)씩 겹치며 윈도우를 이동한다. 이렇게 나눈 구간마다 주파수 분석을 수행하면 특정 시점에 어떤 주파수가 강한지를 시간 축을 따라 차례대로 확인할 수 있다.


![전체 신호를 0–1023, 512–1535, 1024–2047 구간으로 절반씩 겹쳐 나눈 뒤 각각 FFT를 적용해 스펙트로그램으로 결합하는 다이어그램](/images/notion/tech-k21/image-3.png)


그림 3. STFT에서 1,024 샘플 윈도우를 512 샘플씩 겹쳐 이동하며 구간별 FFT 결과를 스펙트로그램으로 결합하는 과정(설명용 예제).


## 스펙트로그램과 윈도우 크기의 트레이드오프


STFT 결과를 시간과 주파수 평면에 시각화한 것이 **스펙트로그램**(spectrogram)이다. 가로축이 시간, 세로축이 주파수를 나타내며, 각 지점의 밝기나 색이 해당 시점과 주파수의 에너지를 보여 준다.


```python
spectrogram_data = np.abs(Zxx) ** 2
```


STFT 출력인 복소수 행렬 `Zxx`의 절댓값을 제곱하면 시간과 주파수별 제곱 크기를 얻을 수 있다. 만약 이 값을 물리적인 전력 밀도(power spectral density)로 해석하려면 윈도우 정규화와 스케일링(scaling) 조건을 추가로 맞춰야 한다. 음성 인식이나 음악 분석 모델의 입력 표현을 다룰 때도 스펙트로그램이 어떤 정규화와 스케일링 조건으로 계산되었는지 함께 확인해야 한다.


스펙트로그램을 만들 때 윈도우 크기를 어떻게 정하느냐에 따라 시간 해상도와 주파수 해상도 사이에 트레이드오프(trade-off)가 생긴다. FFT 길이를 윈도우 길이와 같게 두면 주파수 빈(bin) 간격은 샘플링 레이트를 윈도우 크기로 나눈 값으로 정해진다.

- **1,024 샘플 윈도우**: 주파수 빈 간격은 `44,100 / 1,024 ≈ 43Hz`다. 창 길이는 약 23ms이며, 512 샘플씩 이동하면 분석 시점 간격은 약 11.6ms가 된다.
- **4,096 샘플 윈도우**: 주파수 빈 간격은 `44,100 / 4,096 ≈ 10.8Hz`로 촘촘해지지만, 창 길이는 약 93ms로 길어진다.

![1,024 샘플 윈도우(창 길이 약 23ms, 빈 간격 약 43Hz)와 4,096 샘플 윈도우(창 길이 약 93ms, 빈 간격 약 10.8Hz)의 시간-주파수 격자 모양을 비교한 그림](/images/notion/tech-k21/image-4.png)


그림 4. 44,100Hz 기준 1,024 샘플 윈도우와 4,096 샘플 윈도우의 시간 구간 길이 및 주파수 빈 간격 비교 개념도.


윈도우가 길면 주파수 눈금을 세밀하게 보는 대신 한 구간에 긴 시간이 섞여 시간 위치가 뭉뚱그려지고, 윈도우가 짧으면 빠른 시간 변화를 잘 잡는 대신 주파수 구분이 거칠어진다. 또한 4,096 샘플 윈도우처럼 빈 간격이 좁아지더라도 10Hz 차이 나는 두 음을 항상 분리할 수 있는 것은 아니다. 실제로 두 음이 분리되어 보이는지는 구간에 곱하는 창 함수(window function)와 관측 길이, 신호의 크기, 잡음 조건에도 영향을 받는다. 따라서 창 길이를 고를 때는 관심 있는 소리 변화가 얼마 동안 지속되는지부터 따져 봐야 하며, 구간 경계에서 신호가 급격히 잘리는 현상을 완화하려면 인접 윈도우를 절반씩 겹쳐서(overlap) 계산하는 방식을 쓴다.


한편 SciPy에서 위 예제의 `scipy.signal.stft`와 [`scipy.signal.spectrogram`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.spectrogram.html)은 현재 레거시(legacy) 인터페이스로 분류되어 있으며, 더 많은 기능을 갖춘 [`ShortTimeFFT`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ShortTimeFFT.html)가 대안으로 권장된다. API 분류만으로 기존 코드의 정상 실행 여부까지 판단하지는 않았으며, 기존 `spectrogram`과 대안인 `ShortTimeFFT`의 기능 및 출력 조건은 대조할 대상으로 정리했다. 오디오 모델에 들어가는 시간과 주파수 표현을 더 구체적으로 살펴보려면, 사람의 청각 특성에 맞춘 멜 스케일(mel scale)의 비선형 주파수 축과 한(Hann) 윈도우가 스펙트럼 누출(spectral leakage)을 줄이는 과정을 이어서 확인해 볼 수 있다.


---


## 참고 자료

- [NumPy — Discrete Fourier Transform (numpy.fft)](https://numpy.org/doc/stable/reference/routines.fft.html)
- [SciPy — scipy.signal.stft](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.stft.html)
- [SciPy — scipy.signal.spectrogram](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.spectrogram.html)
- [SciPy — ShortTimeFFT (권장 대체)](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ShortTimeFFT.html)

## 함께 읽기


이어 읽을 글: [음원 분리, 음성 변환, 음성 합성 비교](https://blog.namuori.net/posts/tech-k22/), [오디오 처리 단계의 시간 단위와 특징 표현](https://blog.namuori.net/posts/tech-s18/), [Spring과 FastAPI를 연결한 음원 분리 서비스](https://blog.namuori.net/posts/tech-09-01/), [음원 분리 모델의 학습 코드와 실행 환경](https://blog.namuori.net/posts/tech-09-02/)
