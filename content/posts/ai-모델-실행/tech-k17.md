---
title: "강화학습의 상태, 행동, 보상 정리"
date: 2025-03-12
draft: false
slug: "tech-k17"
categories:
  - "AI 모델 실행"
tags:
  - "workflow"
summary: "강화학습의 상태, 행동, 보상, 정책을 격자 이동 예제로 정리했다. 에이전트가 위치를 보고 한 칸 움직인 뒤 새 위치와 보상을 받는 흐름이다. 한 에피소드를 따라 각 요소와 누적 보상의 관계를 계산했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8169-9add-ffdde0037da2"
generated_by: "notion"
---
## 에피소드 하나를 처음부터 끝까지


강화학습의 상태, 행동, 보상, 정책을 격자 이동 예제로 정리했다. 에이전트가 위치를 보고 한 칸 움직인 뒤 새 위치와 보상을 받는 흐름이다. 한 에피소드를 따라 각 요소와 누적 보상의 관계를 계산했다.


이 흐름을 이루는 요소는 네 가지다—상태(state), 행동(action), 보상(reward), 그리고 이 셋을 연결하는 전이(transition).


이 네 가지가 마르코프 결정 과정(Markov Decision Process, MDP)의 기본 골격이며, Sutton과 Barto(2018)의 교재가 이 구조를 체계적으로 다루고 있다([incompleteideas.net/book/the-book-2nd.html](http://incompleteideas.net/book/the-book-2nd.html)).


## 3×3 격자의 에피소드 예제


3×3 격자 세계를 생각하자. 에이전트는 좌표 0,0에서 출발하고 목표 지점은 2,2다. 매 시점마다 상, 하, 좌, 우 중 하나를 선택할 수 있으며, 격자 밖으로 나가는 행동은 무시되고 제자리에 머문다. 목표에 도착하면 보상 +1을 받고 에피소드가 끝나며, 나머지 이동에는 보상 0을 준다.


한 에피소드가 다음과 같이 진행되었다고 하자.


| 시점 t | 상태 s | 행동 a | 보상 r | 다음 상태  |
| ---- | ---- | ---- | ---- | ------ |
| 0    | 0,0  | 우    | 0    | 1,0    |
| 1    | 1,0  | 우    | 0    | 2,0    |
| 2    | 2,0  | 하    | 0    | 2,1    |
| 3    | 2,1  | 하    | +1   | 2,2 종료 |


4번의 행동으로 도착했는데, 0,0에서 2,2까지 최소 이동 횟수가 4회(우, 우, 하, 하 또는 하, 하, 우, 우 등)이므로 이 경로는 최단 경로 중 하나에 해당한다.


![readable-K17-01-grid.png](/images/notion/tech-k17/image-1.png)


_그림 1. 3×3 격자에서 한 에피소드의 이동 경로와 할인 리턴 (설명용 예제). 시작점에서 도착점까지 이동하며, 도착 시에만 보상 +1을 받는다._


## 정책: 상태에서 행동을 고르는 규칙


정책(policy) π는 각 상태에서 어떤 행동을 선택할지 정하는 규칙이다. 확률적 정책이라면 π(a|s)는 상태 s에서 행동 a를 선택할 확률이고, 결정적 정책이라면 π(s) = a로 행동이 하나로 고정된다.


위 격자 예제에서 "항상 오른쪽부터, 벽이면 아래로"라는 규칙은 결정적 정책이다. "각 방향을 25% 균등 확률로 선택"이라면 확률적 정책이 되고, 같은 시작점에서도 에피소드마다 경로가 달라진다. 강화학습의 목표는 누적 보상을 최대화하는 정책을 찾는 것이므로, 누적 보상을 정량화할 기준이 필요하다.


## 할인율과 누적 보상 계산


시점 t 이후로 받을 보상의 합을 리턴(return) G_t라 부른다. 단순 합산도 가능하지만, 미래 보상에 할인 계수(discount factor) γ를 곱해 가까운 보상을 더 크게 반영하는 쪽이 일반적이다.

> G_t = r(t+1) + γ · r(t+2) + γ² · r(t+3) + …

γ = 0.9로 두고 위 에피소드를 계산해 보자.

- G₃ = 1 (도착 보상)
- G₂ = 0 + 0.9 × 1 = 0.9
- G₁ = 0 + 0.9 × 0.9 = 0.81
- G₀ = 0 + 0.9 × 0.81 = 0.729

시작 지점에서 이 에피소드의 할인 리턴은 0.729다. γ가 1에 가까울수록 먼 미래의 보상이 현재와 비슷한 크기로 반영되고, 0에 가까울수록 즉각적인 보상만 중시하게 된다. γ = 1이라면 G₀ = 1이 되어 도착까지의 거리와 무관하게 동일한 리턴을 내고, γ = 0이라면 G₀ = 0이 되어 즉시 보상이 없는 상태를 무가치하게 취급한다.


## 가치 함수와 정책 평가


가치 함수 V(s)는 상태 s에서 정책 π를 따랐을 때 기대되는 할인 리턴이다. 위에서 계산한 G₀ = 0.729는 하나의 에피소드에서 나온 표본이고, V(s)는 같은 상태에서 정책 π를 무한히 반복했을 때의 평균에 해당한다.


환경 전이와 보상까지 결정적이고 종료에 도달하는 정책이면 이 격자 예제에서 같은 경로가 반복된다. 확률적 환경이나 정책에서는 에피소드별 리턴이 달라지므로 여러 표본으로 기댓값을 추정한다. 여러 에피소드의 평균으로 V(s)를 근사하는 이유다.


정책은 행동을 결정하고 가치 함수는 그 정책을 따를 때 기대되는 리턴을 나타낸다. 가치 추정과 정책 개선이 연결되는 흐름을 이 관계로 정리했다.


![K17-02.png](/images/notion/tech-k17/image-2.png)


_그림 2. 에이전트-환경 상호작용과 정책, 가치 함수의 관계 (설명용). 에이전트는 정책에 따라 행동하고, 가치 함수가 정책의 기대 성과를 평가한다. 가치 추정에 기반한 정책 개선이 반복되는 구조다._


## 코드로 보는 에피소드의 골격


Gymnasium 라이브러리는 이 상호작용 루프를 표준 API로 제공한다([gymnasium.farama.org — Basic Usage](https://gymnasium.farama.org/introduction/basic_usage/)).


```python
import gymnasium as gym

env = gym.make("CartPole-v1")
state, info = env.reset()

total_reward = 0
done = False

while not done:
    action = env.action_space.sample()  # 랜덤 정책
    next_state, reward, terminated, truncated, info = env.step(action)
    total_reward += reward
    state = next_state
    done = terminated or truncated

env.close()
```


`reset()`은 초기 관측을, `step(action)`은 다음 관측, 보상, 종료 여부 등을 반환한다. 관측이 환경의 완전한 상태와 같은지는 환경 정의에 달렸다. 격자 예제에서 따라갔던 (s, a, r, s') 전이가 코드에서는 이 두 함수의 호출로 표현된다.


`terminated`와 `truncated`를 구분하는 이유는, 목표 달성이나 실패로 끝나는 경우와 시간 제한에 걸려 끝나는 경우가 학습에서 다르게 취급되기 때문이다([gymnasium.farama.org — CartPole](https://gymnasium.farama.org/environments/classic_control/cart_pole/)).


완결된 에피소드의 리턴 표본을 쓰는 몬테카를로 접근과, 종료 전 다음 상태의 가치 추정치로 갱신하는 시간차(TD) 학습은 후속 비교 대상으로 남겼다. 몬테카를로에서 정책이 반드시 확률적일 필요는 없다. 같은 격자에서도 수렴 속도를 비교하려면 전이, 정책, 갱신 조건을 함께 정할 필요가 있다.


---


**참고 자료**

- Sutton, R. S. & Barto, A. G. (2018). _Reinforcement Learning: An Introduction_ (2nd ed.). MIT Press. [incompleteideas.net/book/the-book-2nd.html](http://incompleteideas.net/book/the-book-2nd.html)
- Farama Foundation. _Gymnasium: Basic Usage._ [gymnasium.farama.org/introduction/basic_usage](https://gymnasium.farama.org/introduction/basic_usage/)
- Farama Foundation. _CartPole Environment._ [gymnasium.farama.org/environments/classic_control/cart_pole](https://gymnasium.farama.org/environments/classic_control/cart_pole/)

## 함께 읽기


먼저 읽을 글: [작은 예제로 정리한 손실과 가중치 갱신](https://blog.namuori.net/posts/tech-k32/)


이어 읽을 글: [강화학습 실습의 탐험과 평가 설정](https://blog.namuori.net/posts/tech-06-04/)
