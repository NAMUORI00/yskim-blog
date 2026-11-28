---
title: "컨테이너 이미지와 데이터 저장 구조"
date: 2025-03-27
draft: false
slug: "tech-k23"
categories:
  - "인프라와 개발 도구"
tags:
  - "workflow"
summary: "컨테이너를 멈추거나 삭제할 때 파일이 남는 곳과 사라지는 곳을 이미지 레이어, 컨테이너 쓰기 레이어, 볼륨, 호스트 장치로 나누어 수명과 연결 구조를 비교한다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8145-95fc-cc3ef04a5d56"
generated_by: "notion"
---
프로그램을 실행할 때 필요한 코드와 설정을 한데 묶어 격리된 공간에서 돌리는 단위를 **컨테이너**(container)라고 한다. 실제 컴퓨터인 호스트(host)에서 컨테이너를 새로 띄우거나 교체할 때는 그 안에서 만든 파일이 어디는 남고 어디는 사라지는지 구분해야 한다. 인공지능 모델을 학습하며 중간 상태를 기록한 학습 체크포인트나 결과 파일을 잘못된 위치에 두면 컨테이너를 지우는 순간 함께 사라지기 때문이다.


컨테이너를 이루는 읽기 전용 이미지 층과 실행 중에 생기는 쓰기 층, 그리고 컨테이너 바깥에 연결하는 저장 공간인 볼륨은 저마다 수명이 다르다. 이 글에서는 각 저장 영역이 언제 생기고 사라지는지 비교하고, 호스트의 물리 장치가 컨테이너와 어떻게 연결되는지 차례로 확인한다.


## 읽기 전용 이미지 레이어


컨테이너에서 무엇이 남고 사라지는지 알려면 먼저 컨테이너의 밑바탕이 되는 이미지가 어떤 층으로 이루어지는지부터 봐야 한다. 이미지는 컨테이너를 찍어 내는 읽기 전용 틀이며, `Dockerfile`이라는 설정 파일에 명령을 적어 빌드(제작)한다.


```docker
FROM python:3.11
COPY requirements.txt .   # 의존성 목록 복사
RUN pip install -r requirements.txt  # 패키지 설치
COPY . /app               # 앱 코드 복사
```


위 예시에서 `COPY`나 `RUN`처럼 파일 시스템을 바꾸는 명령은 새로운 **이미지 레이어**(image layer, 이미지 층)를 한 층씩 만든다. 모든 명령이 파일 시스템 레이어를 추가하는 것은 아니며, 명령 종류에 따라 레이어가 새로 생기거나 이미지의 설명 정보인 메타데이터만 바뀐다. 예를 들어 `FROM`은 기존 베이스 이미지(`python:3.11`)의 여러 레이어를 가져오고, `ENV` 같은 설정 명령은 메타데이터만 갱신한다.


이렇게 만들어진 이미지 레이어는 모두 읽기 전용이어서 수정할 수 없고, 같은 이미지에서 만든 모든 컨테이너가 함께 공유한다. Docker의 [스토리지 드라이버](https://docs.docker.com/engine/storage/drivers/)는 여러 레이어를 **유니언 파일 시스템**(union filesystem)으로 합쳐 컨테이너 안에서는 하나의 파일 시스템처럼 보이게 한다.


읽기 전용 레이어는 서로 다른 이미지 사이에서도 재사용된다. 예를 들어 두 이미지가 120MB짜리 베이스 이미지를 함께 쓴다면, 디스크에는 공통 레이어 120MB가 한 번만 저장된다. 그 위에 쌓이는 추가 레이어만 각 이미지별로 따로 보관된다.


![공통 베이스 이미지 120MB를 이미지 A와 이미지 B가 아래에서 공유하고 상위 레이어만 각각 따로 쌓는 구조도](/images/notion/tech-k23/image-1.png)


그림 1. 두 이미지가 120MB 베이스 이미지 레이어를 디스크에서 공유하고 상위 읽기 전용 레이어만 따로 보관하는 구조 (설명용 개념도)


다만 이미지 이름 뒤에 붙이는 태그(이름표)가 같더라도 다시 빌드하는 시점에 따라 다른 이미지가 만들어질 수 있다. 똑같은 실행 환경을 그대로 재현하려면 태그뿐 아니라 이미지 내용으로 계산한 고유 식별값인 다이제스트(digest)도 함께 확인해야 한다.


## 컨테이너 쓰기 레이어


앞서 본 이미지 레이어는 읽기 전용이어서, 이 층만으로는 컨테이너가 실행되는 동안 새 파일을 만들거나 기존 파일을 고칠 수 없다. 그래서 컨테이너가 실행되면 이미지 레이어 맨 위에 쓰기 가능한 얇은 층이 하나 올라간다. Docker의 [이미지 레이어 문서](https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/)에서는 이 층을 **얇은 쓰기 레이어**(thin writable layer)라 부른다.


뒤에서 다룰 볼륨이나 바인드 마운트(bind mount)처럼 외부와 연결한 경로 밖에서 파일을 만들거나 고치면 모두 이 쓰기 레이어에 기록된다. 원래 이미지에 있던 파일을 수정할 때도 아래쪽 원본 레이어를 직접 고치지 않는다. 원본 파일을 쓰기 레이어로 복사해 온 뒤 그 사본을 고치는 **쓰기 시점 복사**(copy-on-write) 방식으로 동작한다.


```bash
docker run --name test python:3.11 bash -c "echo hello > /tmp/result.txt"
docker rm test
# 이 컨테이너의 쓰기 레이어로는 파일을 다시 읽을 수 없다
```


이 쓰기 레이어는 해당 컨테이너 하나에만 묶여 있다. 위 명령처럼 `test` 컨테이너를 실행해 `/tmp/result.txt`에 파일을 쓴 뒤 컨테이너를 멈추면, 정지된 동안에는 쓰기 레이어가 그대로 남아 있다. 하지만 `docker rm test`로 컨테이너를 삭제하면 쓰기 레이어와 그 안의 수정 사본도 함께 사라져 파일을 다시 읽을 수 없다. 아래쪽의 읽기 전용 이미지 레이어는 그대로 남지만, 같은 이미지로 새 컨테이너를 만들어도 이전 쓰기 레이어의 변경 내용은 이어지지 않는다.


![아래쪽 이미지 읽기 전용 레이어는 유지되고 위쪽 컨테이너 쓰기 레이어의 파일과 수정 사본은 docker rm 실행 시 소멸함을 나타내는 다이어그램](/images/notion/tech-k23/image-2.png)


그림 2. 이미지의 읽기 전용 레이어 위에 생성되는 컨테이너 쓰기 레이어와 삭제 시 소멸 범위 (설명용 개념도)


## 컨테이너 바깥의 볼륨


컨테이너를 삭제하면 쓰기 레이어가 함께 사라지기 때문에, 컨테이너를 교체한 뒤에도 결과 파일이 남아야 한다면 컨테이너 바깥의 저장소를 연결해야 한다. [볼륨](https://docs.docker.com/engine/storage/volumes/)(volume)은 Docker가 호스트 컴퓨터의 파일 시스템 안에 따로 관리하는 공간으로, 컨테이너의 생성이나 삭제와 독립적으로 유지된다.


```bash
docker volume create mydata
docker run -v mydata:/data --name worker python:3.11 \
  bash -c "echo result > /data/output.txt"
docker rm worker
docker run -v mydata:/data python:3.11 cat /data/output.txt
# "result" 출력 — 파일이 살아 있다
```


위 명령에서는 `mydata` 볼륨을 컨테이너의 `/data` 경로에 마운트(연결)한 뒤 `output.txt` 파일을 저장했다. 그 뒤 `worker` 컨테이너를 지우고 새 컨테이너에 같은 `mydata` 볼륨을 마운트하면 앞서 저장한 `output.txt`가 그대로 남아 있다. 그래서 학습 체크포인트, 데이터셋, 로그처럼 컨테이너보다 오래 살아야 하는 데이터는 볼륨이나 별도 영속 저장소에 두는 구성을 검토한다.


![기존 컨테이너 삭제 시 쓰기 레이어의 임시 파일 A는 제거되지만 볼륨에 쓴 결과 파일 B는 남아 새 컨테이너가 마운트해 읽는 흐름도](/images/notion/tech-k23/image-3.png)


그림 3. 기존 컨테이너를 삭제하고 새 컨테이너가 같은 볼륨을 마운트해 결과 파일을 읽는 과정 (직접 작성한 설명용 시나리오)


다만 볼륨이 컨테이너와 별개로 유지되는 것과 데이터 백업은 다른 문제다. `docker volume rm mydata`를 실행하면 볼륨 자체도 삭제되므로, 데이터를 얼마나 오래 보존할지는 볼륨 관리 정책에 달려 있다.


바인드 마운트(`-v /host/path:/container/path`)도 컨테이너 바깥에 데이터를 둔다는 점에서는 볼륨과 비슷하다. 그러나 Docker가 관리하는 이름 있는 볼륨(named volume)과 달리 호스트 컴퓨터의 특정 폴더 경로를 직접 지정해 연결한다. 개발 중에 호스트에서 고친 소스 코드를 컨테이너에 실시간으로 반영하고 싶을 때 주로 쓴다.


## 호스트 GPU와 네트워크


볼륨처럼 컨테이너 바깥에 있는 저장 공간뿐 아니라, GPU 같은 물리 장치도 컨테이너의 수명과 분리해 볼 수 있다. GPU는 호스트 컴퓨터에 장착된 하드웨어이므로 컨테이너가 사라져도 호스트에 그대로 남는다.


```bash
docker run --gpus all nvidia/cuda:<환경에-맞는-태그> nvidia-smi
```


NVIDIA GPU를 지원하는 Docker 환경에서는 먼저 호스트 드라이버와 NVIDIA Container Toolkit 같은 런타임(실행 환경) 설정을 확인한다. 그 뒤 위 명령처럼 `--gpus` 옵션으로 컨테이너에 노출할 장치를 지정하며, 태그 자리는 실제 환경과 호환되는 이미지 태그로 바꿔야 한다.


이 명령을 실행하면 호스트의 NVIDIA 드라이버를 거쳐 컨테이너 안에서 GPU에 접근할 수 있다. 이때 NVIDIA Container Toolkit이 호스트 드라이버와 컨테이너 런타임 사이를 중개한다. 컨테이너가 종료되면 그 안에서 돌던 GPU 작업도 함께 끝나고 자원 사용 상태가 달라진다.


반면 물리 GPU와 호스트 드라이버 자체는 컨테이너를 삭제한 뒤에도 호스트에 그대로 남는다. 네트워크 포트도 마찬가지로 호스트의 자원을 연결해 쓴다. `-p 8080:80`으로 포트 포워딩(포트 연결)을 설정해 쓰더라도 호스트의 네트워크 스택 자체는 컨테이너의 생성이나 삭제와 무관하게 유지된다.


## 결론


앞에서 다룬 이미지 레이어, 컨테이너 쓰기 레이어, 볼륨, 호스트 장치의 연결 구조와 수명 관계를 한눈에 비교하면 다음 그림과 같다. 이미지 레이어는 빌드 시점에 고정되어 읽기 전용으로 공유되고, 컨테이너 쓰기 레이어는 컨테이너가 정지된 동안에는 남지만 삭제하면 사라진다. 반면 볼륨은 컨테이너와 분리된 수명으로 관리되며, GPU나 네트워크 스택 같은 호스트 자원은 컨테이너가 실행되는 동안만 연결해 쓰고 작업이 끝나면 점유 상태만 해제된다.


![읽기 전용 이미지 레이어들 위에 올라간 쓰기 레이어와 외부에서 마운트되는 볼륨 및 --gpus로 연결되는 호스트 GPU의 관계도](/images/notion/tech-k23/image-4.png)


그림 4. 이미지 레이어, 컨테이너 쓰기 레이어, 볼륨, 호스트 GPU의 연결 구조와 수명 관계 (설명용 개념도)


이처럼 영역별 수명을 나누어 보면 컨테이너를 교체할 때 따로 보존해야 할 데이터 경로와 복구 수단을 분명히 구분할 수 있다. 다만 여러 컨테이너가 같은 볼륨을 동시에 마운트할 때 생기는 파일 잠금과 쓰기 충돌 문제는 이번 글에서 확인하지 않고 후속 주제로 남겨 두었다. 컨테이너 쓰기 레이어를 `docker commit`으로 묶어 새 이미지로 만드는 방식이 Dockerfile 빌드와 재현 조건에서 어떻게 다른지도 이어서 확인할 과제다.


---


**참고 자료**

- Docker Docs, "Storage drivers." [https://docs.docker.com/engine/storage/drivers/](https://docs.docker.com/engine/storage/drivers/)
- Docker Docs, "Understanding the image layers." [https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/](https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/)
- Docker Docs, "Volumes." [https://docs.docker.com/engine/storage/volumes/](https://docs.docker.com/engine/storage/volumes/)

## 함께 읽기


이어 읽을 글: [설치 구성과 서비스 실행 단계](https://blog.namuori.net/posts/tech-s12/), [스마트팜 서비스 코드와 연구 자료의 저장소 구성](https://blog.namuori.net/posts/tech-03-03/), [음원 분리 모델의 학습 코드와 실행 환경](https://blog.namuori.net/posts/tech-09-02/), [AI 개발 컨테이너와 서비스 설치 과정 정리](https://blog.namuori.net/posts/tech-10-01/)
