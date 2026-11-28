---
title: "강화학습의 상태, 행동, 보상 정리"
date: 2025-03-12
draft: false
slug: "tech-k17"
categories:
  - "AI 모델 실행"
tags:
  - "workflow"
summary: "강화학습의 기본 요소인 상태, 행동, 보상, 정책의 관계를 3×3 격자 이동 예제로 따라가며 할인 리턴과 가치 함수를 계산하고, 이 상호작용 루프가 Gymnasium 코드에서 어떻게 구현되는지 설명한다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8169-9add-ffdde0037da2"
generated_by: "notion"
---
강화학습에서 에이전트는 매 순간 정답표를 받아 학습하지 않는다. 대신 현재 위치를 관찰해 행동을 고르고, 한 칸 움직인 뒤 바뀐 위치와 보상을 환경으로부터 돌려받는다. 목표 지점에 도착했을 때만 보상이 주어지는 환경이라면, 출발점과 중간 경로에서 내린 선택이 얼마나 좋았는지는 어떻게 수치로 계산할 수 있을까. 이 질문에 답하려면 한 판의 이동 과정을 처음부터 끝까지 따라가며 보상들이 어떻게 누적되고 전달되는지 확인해야 한다.


에이전트와 환경이 주고받는 상호작용 흐름은 네 가지 기본 요소로 이루어진다. 에이전트가 놓인 현재 위치나 조건을 뜻하는 **상태**(state), 에이전트가 고르는 **행동**(action), 행동의 결과로 환경이 돌려주는 **보상**(reward), 그리고 행동에 따라 다음 상태로 넘어가는 **전이**(transition)다. 이 네 가지 요소가 **마르코프 결정 과정**(Markov Decision Process, MDP)의 기본 골격을 이루며, Sutton과 Barto(2018)의 교재에서 이 구조를 체계적으로 다루고 있다([incompleteideas.net/book/the-book-2nd.html](http://incompleteideas.net/book/the-book-2nd.html)).


## 3×3 격자의 에피소드 예제


에이전트가 시작 상태에서 출발해 종료 상태에 이를 때까지의 한 구간을 **에피소드**(episode)라고 한다. 작은 3×3 격자 세계를 예로 들어 에피소드 하나를 따라가 보자. 에이전트는 좌표 `0,0`에서 출발하고 목표 지점은 `2,2`다. 매 시점 `t`마다 상, 하, 좌, 우 가운데 하나를 행동으로 선택할 수 있으며, 격자 밖으로 나가는 행동은 무시되어 제자리에 머문다. 목표 칸인 `2,2`에 도착하면 보상 `+1`을 받고 에피소드가 끝나며, 나머지 이동에서는 모두 보상 `0`을 받는다.


한 에피소드가 아래 표와 같이 진행되었다고 하자.


| 시점 t | 상태 s | 행동 a | 보상 r | 다음 상태  |
| ---- | ---- | ---- | ---- | ------ |
| 0    | 0,0  | 우    | 0    | 1,0    |
| 1    | 1,0  | 우    | 0    | 2,0    |
| 2    | 2,0  | 하    | 0    | 2,1    |
| 3    | 2,1  | 하    | +1   | 2,2 종료 |


에이전트는 네 번의 행동으로 목표에 도착했다. `0,0`에서 `2,2`까지 가기 위한 최소 이동 횟수가 4회(우, 우, 하, 하 또는 하, 하, 우, 우 등)이므로 이 경로는 최단 경로 가운데 하나다.


![3×3 격자에서 0,0 시작 칸부터 1,0, 2,0, 2,1을 거쳐 2,2 도착 칸까지 이동하며 마지막에 보상 +1을 받는 경로 그림](/images/notion/tech-k17/image-1.png)


그림 1. 3×3 격자에서 시작점(0,0)부터 도착점(2,2)까지 이동하는 한 에피소드의 경로와 시점별 보상.


## 정책: 상태에서 행동을 고르는 규칙


앞선 표에서는 에이전트가 이미 선택한 행동을 따라갔지만, 실제로는 각 상태에서 어떤 행동을 고를지 정하는 기준이 있어야 한다. 이처럼 상태마다 행동을 선택하는 규칙을 **정책**(policy) π라고 한다. 상태 s에서 행동 a를 고를 확률을 정의하면 확률적 정책 π(a|s)가 되고, 상태마다 행동이 하나로 고정되면 결정적 정책 π(s) = a가 된다.


위 격자 예제에서 "오른쪽으로 갈 수 있으면 오른쪽으로 가고, 벽에 막히면 아래로 간다"는 규칙은 결정적 정책이다. 반대로 "상, 하, 좌, 우 네 방향을 25%씩 균등한 확률로 선택한다"면 확률적 정책이 되어 같은 출발점에서 시작해도 에피소드마다 이동 경로가 달라진다. 강화학습의 목표는 앞으로 받을 누적 보상을 최대화하는 정책을 찾는 것이므로, 에피소드 동안 받은 보상들을 하나의 값으로 정량화할 기준이 필요하다.


## 할인율과 누적 보상 계산


시점 t 이후에 받을 보상의 합을 **리턴**(return) G_t라고 부른다. 미래의 보상을 단순 합산할 수도 있지만, 미래 보상에 0과 1 사이의 **할인 계수**(discount factor) γ를 거듭 곱해 가까운 시점의 보상을 더 크게 반영하는 방식이 일반적이다.

> G_t = r(t+1) + γ · r(t+2) + γ² · r(t+3) + …

할인 계수를 γ = 0.9로 두고 앞선 격자 에피소드의 리턴을 도착 시점부터 역방향으로 계산해 보자. 각 시점의 리턴은 그 시점에 받은 보상에 다음 시점 리턴의 0.9배를 더한 값이다.

- G₃ = 1 (도착 보상)
- G₂ = 0 + 0.9 × 1 = 0.9
- G₁ = 0 + 0.9 × 0.9 = 0.81
- G₀ = 0 + 0.9 × 0.81 = 0.729

출발 지점인 시점 0에서 이 에피소드의 할인 리턴 G₀는 0.729다. 마지막에 받은 보상 +1이 시작점으로 한 단계씩 거슬러 올라오면서 0.9배씩 줄어들어 반영된 결과다.


![시점 t=3의 리턴 G₃=1에서 시작해 왼쪽으로 0.9씩 곱하며 G₂=0.9, G₁=0.81, G₀=0.729를 계산하는 흐름도](/images/notion/tech-k17/image-2.png)


그림 2. 할인 계수 γ = 0.9일 때 도착 보상 +1이 역방향으로 할인되어 시점별 리턴(G₃~G₀)이 계산되는 과정(직접 계산한 예).


할인 계수 γ의 크기에 따라 에이전트가 미래 보상을 평가하는 방식이 달라진다. γ가 1에 가까울수록 먼 미래의 보상이 현재와 비슷한 크기로 반영되고, 0에 가까울수록 당장 눈앞의 보상만 중시한다. 예를 들어 이 격자에서 γ = 1이라면 몇 칸을 돌아가든 G₀ = 1이 되어 도착까지의 이동 거리와 무관하게 같은 리턴을 내고, γ = 0이라면 G₀ = 0이 되어 즉시 보상이 없는 상태를 무가치하게 취급한다.


## 가치 함수와 정책 평가


앞에서 계산한 G₀ = 0.729는 에피소드 하나에서 얻은 단일 표본이다. 반면 **가치 함수**(value function) V(s)는 상태 s에서 출발해 정책 π를 따랐을 때 기대되는 할인 리턴의 평균을 뜻한다.


이 격자 예제처럼 환경의 상태 전이와 보상이 결정적이고 종료 상태에 도달하는 결정적 정책을 쓴다면, 에피소드를 반복해도 매번 같은 경로와 리턴이 나온다. 하지만 정책이 확률적이거나 환경 전이에 무작위성이 있으면 같은 상태에서 출발해도 에피소드마다 리턴이 달라진다. 이 경우에는 여러 에피소드를 실행해 얻은 리턴 표본들의 평균으로 기댓값을 구해 V(s)를 근사한다.


요약하면 정책 π는 각 상태에서 할 행동을 결정하고, 가치 함수 V(s)는 그 정책을 따랐을 때 기대되는 리턴을 평가한다. 에이전트는 정책에 따라 행동하며 얻은 보상으로 가치를 추정하고, 더 높은 가치를 주는 행동을 고르도록 정책을 개선해 나간다.


![에이전트가 정책 π로 행동 a를 골라 환경과 상호작용하고, 보상 r로부터 계산한 리턴 G와 가치 함수 V(s)를 통해 정책을 개선하는 구조도](/images/notion/tech-k17/image-3.png)


그림 3. 에이전트와 환경의 상호작용에서 얻은 보상이 리턴과 가치 함수 V(s)를 거쳐 정책 π 개선으로 이어지는 구조(개념도).


## 코드로 보는 에피소드의 골격


격자 예제에서 살펴본 에피소드 진행은 실제 코드에서 반복문 하나로 표현된다. 강화학습 환경 라이브러리인 Gymnasium은 에이전트와 환경의 상호작용 루프를 표준 API로 제공한다([gymnasium.farama.org — Basic Usage](https://gymnasium.farama.org/introduction/basic_usage/)).


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


`reset()`은 환경을 초기화해 첫 관측(`state`)을 반환하고, `step(action)`은 선택한 행동을 환경에 적용한 뒤 다음 관측(`next_state`), 보상(`reward`), 종료 여부(`terminated`, `truncated`), 부가 정보(`info`)를 반환한다. 격자 예제에서 따라갔던 (s, a, r, s') 전이가 코드에서는 이 두 함수의 호출로 구현된다. 다만 반환된 관측이 환경의 완전한 상태와 일치하는지는 각 환경의 정의에 따라 다르다.


종료 여부를 `terminated`와 `truncated` 두 변수로 나누는 이유는 목표 달성이나 실패로 에피소드가 끝나는 경우와 시간제한에 걸려 중단되는 경우가 학습 과정에서 다르게 취급되기 때문이다([gymnasium.farama.org — CartPole](https://gymnasium.farama.org/environments/classic_control/cart_pole/)).


![env.reset()으로 시작해 action 선택과 env.step(action)을 반복하다가 terminated 또는 truncated가 참이면 env.close()로 끝나는 흐름도](/images/notion/tech-k17/image-4.png)


그림 4. Gymnasium API에서 에피소드 초기화부터 스텝 반복과 종료 판정(terminated, truncated)까지 이어지는 실행 흐름.


이 글에서는 에피소드가 끝난 뒤 전체 보상 기록으로 리턴 G_t를 계산하고 가치 함수 V(s)의 의미를 짚어 보았다. 완결된 에피소드의 리턴 표본을 그대로 쓰는 몬테카를로(Monte Carlo) 접근과, 에피소드가 끝나기 전에 다음 상태의 가치 추정치를 이용해 갱신하는 시간차(TD) 학습이다. 몬테카를로 방식이라고 해서 정책이 반드시 확률적일 필요는 없다. 같은 격자 환경에서 두 방식의 수렴 속도를 비교하려면 상태 전이와 정책, 가치 갱신 조건을 함께 맞추어 실험해야 한다.


---


## 참고 자료

- Sutton, R. S. & Barto, A. G. (2018). _Reinforcement Learning: An Introduction_ (2nd ed.). MIT Press. [incompleteideas.net/book/the-book-2nd.html](http://incompleteideas.net/book/the-book-2nd.html)
- Farama Foundation. _Gymnasium: Basic Usage._ [gymnasium.farama.org/introduction/basic_usage](https://gymnasium.farama.org/introduction/basic_usage/)
- Farama Foundation. _CartPole Environment._ [gymnasium.farama.org/environments/classic_control/cart_pole](https://gymnasium.farama.org/environments/classic_control/cart_pole/)

## 함께 읽기


먼저 읽을 글: [작은 예제로 정리한 손실과 가중치 갱신](https://blog.namuori.net/posts/tech-k32/)


이어 읽을 글: [강화학습 실습의 탐험과 평가 설정](https://blog.namuori.net/posts/tech-06-04/)
