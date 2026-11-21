---
title: "컨테이너 이미지와 데이터 저장 구조"
date: 2025-03-27
draft: false
slug: "tech-k23"
categories:
  - "인프라와 개발 도구"
tags:
  - "workflow"
summary: "컨테이너의 교체 전후에 파일이 남는 위치를 정리했다. 이미지, 컨테이너의 쓰기 영역, 별도 볼륨은 서로 다른 수명을 갖는다. 결과 파일의 보관 경로와 호스트 자원의 관계를 이 구분에 맞춰 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3dbdcd44-779f-8145-95fc-cc3ef04a5d56"
generated_by: "notion"
---
컨테이너의 교체 전후에 파일이 남는 위치를 정리했다. 이미지, 컨테이너의 쓰기 영역, 별도 볼륨은 서로 다른 수명을 갖는다. 결과 파일의 보관 경로와 호스트 자원의 관계를 이 구분에 맞춰 살펴봤다.


## 이미지 레이어: 빌드 시점에 고정되는 읽기 전용 층


Dockerfile에서는 COPY나 RUN처럼 파일 시스템을 바꾸는 단계가 이미지 레이어를 만들 수 있다. 명령의 종류에 따라 파일 시스템 레이어 또는 이미지 메타데이터가 갱신된다. FROM은 기존 베이스 이미지의 여러 레이어를 가져올 수 있고 ENV 같은 설정은 메타데이터를 바꾼다. 이 레이어들은 모두 읽기 전용이고, 같은 이미지에서 생성된 모든 컨테이너가 공유한다.


```docker
FROM python:3.11
COPY requirements.txt .   # 의존성 목록 복사
RUN pip install -r requirements.txt  # 패키지 설치
COPY . /app               # 앱 코드 복사
```


생성된 이미지 레이어는 읽기 전용으로 재사용된다. 같은 태그로 다시 빌드하면 다른 이미지가 될 수 있어 재현에는 이미지 digest도 확인할 필요가 있다. Docker의 [스토리지 드라이버](https://docs.docker.com/engine/storage/drivers/)가 이 레이어들을 union filesystem으로 합쳐 하나의 파일 시스템처럼 보이게 한다.


같은 베이스 이미지를 쓰는 여러 이미지가 레이어 1을 디스크에서 공유할 수 있으므로, 베이스 이미지가 120MB이고 두 이미지가 같은 베이스를 쓴다면 120MB는 한 번만 저장된다. 나머지 레이어만 각 이미지별로 따로 보관하면 된다.


## 컨테이너 레이어: 쓸 수 있지만 컨테이너와 함께 사라지는 층


컨테이너가 실행되면 이미지 레이어 맨 위에 쓰기 가능한 얇은 레이어 하나가 추가된다. 컨테이너 안에서 볼륨이나 bind mount 같은 별도 마운트 밖에서 파일을 만들거나 수정하면 이 쓰기 레이어에 반영된다.


Docker의 [이미지 레이어 문서](https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/)에서는 이를 "thin writable layer"라 부른다.


이 레이어는 해당 컨테이너에 종속된다. `docker rm`으로 컨테이너를 삭제하면 쓰기 레이어도 함께 소멸한다.


```bash
docker run --name test python:3.11 bash -c "echo hello > /tmp/result.txt"
docker rm test
# 이 컨테이너의 쓰기 레이어로는 파일을 다시 읽을 수 없다
```


이미지의 읽기 전용 레이어는 유지되고, 같은 이미지로 새 컨테이너를 만들면 이전 쓰기 레이어의 변경은 이어지지 않는다. 이미지에 있던 파일을 수정할 때도 copy-on-write로 쓰기 레이어에 사본을 남기는 방식이다. 이 사본은 해당 컨테이너 삭제와 함께 사라진다.


## 볼륨: 컨테이너 바깥에서 독립적으로 존재하는 저장소


[볼륨](https://docs.docker.com/engine/storage/volumes/)은 Docker가 호스트 파일 시스템에 관리하는 별도 공간으로, 컨테이너의 생명주기와 독립적이다.


```bash
docker volume create mydata
docker run -v mydata:/data --name worker python:3.11 \
  bash -c "echo result > /data/output.txt"
docker rm worker
docker run -v mydata:/data python:3.11 cat /data/output.txt
# "result" 출력 — 파일이 살아 있다
```


컨테이너를 교체해도 볼륨 안의 파일은 유지된다. 학습 체크포인트, 데이터셋, 로그처럼 컨테이너보다 오래 살아야 하는 데이터는 볼륨이나 별도 영속 저장소에 두는 구성을 검토한다. 볼륨 유지와 백업은 별개의 조건이다. `docker volume rm mydata`를 실행하면 볼륨도 삭제되므로 보존 기간은 볼륨 관리 정책에 달려 있다.


bind mount(`-v /host/path:/container/path`)도 비슷한 역할을 하지만, 호스트의 특정 경로를 직접 지정한다는 점에서 Docker가 관리하는 named volume과 구분된다. 개발 중 소스 코드를 컨테이너에 실시간으로 반영하고 싶을 때 주로 쓰인다.


## 호스트 GPU: 컨테이너가 빌려 쓰는 장치


GPU는 호스트 머신의 물리 장치이므로 컨테이너가 사라져도 당연히 그대로 남는다. NVIDIA GPU를 지원하는 Docker 환경에서는 호스트 드라이버와 NVIDIA Container Toolkit 등 런타임 설정을 확인한 뒤 `--gpus` 옵션으로 노출할 장치를 지정할 수 있다. 아래 태그 자리는 실제 환경과 호환되는 이미지로 바꿔야 한다.


```bash
docker run --gpus all nvidia/cuda:<환경에-맞는-태그> nvidia-smi
```


이 명령은 호스트의 NVIDIA 드라이버를 통해 GPU 접근을 제공한다. NVIDIA Container Toolkit이 호스트 드라이버와 컨테이너 런타임 사이를 중개한다. 컨테이너가 종료되면 그 안의 GPU 작업도 종료되고 자원 사용 상태가 달라진다.


물리 GPU와 호스트 드라이버는 컨테이너 삭제 후에도 호스트에 남는다. 네트워크 포트도 마찬가지로, `-p 8080:80`으로 포워딩을 설정해도 호스트의 네트워크 스택 자체는 컨테이너와 무관하게 유지된다.


## 저장 영역별 수명 비교


![K23-01.png](/images/notion/tech-k23/image-1.png)


그림 1. 이미지 레이어, 컨테이너 레이어, 볼륨, GPU의 관계 (설명용 개념도)


![K23-02.png](/images/notion/tech-k23/image-2.png)


그림 2. 기존 컨테이너를 삭제하고 새 컨테이너가 같은 볼륨을 읽는 과정. 직접 작성한 설명용 시나리오


이미지 레이어는 읽기 전용으로 공유되고, 컨테이너 쓰기 레이어는 정지 뒤에도 남지만 삭제하면 사라진다. 볼륨은 별도 생명주기로 관리된다. 호스트 장치와 컨테이너 작업의 수명까지 나누어 보니 교체 때 유지할 데이터와 복구 수단을 따로 정리할 수 있었다.


## 후속 검토


동일 볼륨의 동시 마운트에서 생기는 파일 잠금과 쓰기 충돌은 후속 주제로 남겼다. `docker commit`으로 쓰기 레이어를 이미지로 보관하는 방식도 Dockerfile 기반 빌드와 비교해 재현 조건을 살펴볼 수 있다.


---


**참고 자료**

- Docker Docs, "Storage drivers." [https://docs.docker.com/engine/storage/drivers/](https://docs.docker.com/engine/storage/drivers/)
- Docker Docs, "Understanding the image layers." [https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/](https://docs.docker.com/get-started/docker-concepts/building-images/understanding-image-layers/)
- Docker Docs, "Volumes." [https://docs.docker.com/engine/storage/volumes/](https://docs.docker.com/engine/storage/volumes/)

## 함께 읽기


이어 읽을 글: [설치 구성과 서비스 실행 단계](https://blog.namuori.net/posts/tech-s12/), [스마트팜 서비스 코드와 연구 자료의 저장소 구성](https://blog.namuori.net/posts/tech-03-03/), [음원 분리 모델의 학습 코드와 실행 환경](https://blog.namuori.net/posts/tech-09-02/), [AI 컨테이너 개발 환경과 설치 도구 정리](https://blog.namuori.net/posts/tech-10-01/)
