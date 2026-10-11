---
title: "설치 구성과 서비스 실행 단계"
date: 2025-10-16
draft: false
slug: "tech-s12"
categories:
  - "인프라와 개발 도구"
tags:
  - "workflow"
summary: "AI-Container-Suite와 ComfyUI 래퍼에서 설치와 실행의 책임을 나누어 읽었다. 패키지 설치, 컨테이너 시작, 장치 연결, 요청 준비는 서로 다른 단계에 놓여 있었다. 이미지 빌드 이후에도 남는 실행 조건을 구성 파일에서 정리했다."
cover: ""
canonical: ""
comments: false
notion_id: "3dcdcd44-779f-814a-8730-df8322257e29"
generated_by: "notion"
math: true
---
AI-Container-Suite와 ComfyUI 래퍼에서 설치와 실행의 책임을 나누어 읽었다. 패키지 설치, 컨테이너 시작, 장치 연결, 요청 준비는 서로 다른 단계에 놓여 있었다. 이미지 빌드 이후에도 남는 실행 조건을 구성 파일에서 정리했다.


## 패키지를 넣는 시점과 프로세스를 시작하는 시점


AI-Container-Suite의 [Dockerfile](https://github.com/NAMUORI00/AI-Container-Suite/blob/e3e0c65c8a796d1bdb3dceeff6a47a78a374c6e1/.devcontainer/Dockerfile)을 보면, `nvidia/cuda:12.1.0-cudnn8-devel-ubuntu22.04` 베이스 이미지 위에 시스템 패키지를 설치하고, Miniconda를 내려받아 Conda 환경을 생성하고, pip 패키지까지 설치하는 과정이 전부 `RUN` 명령으로 진행된다.


이 단계들은 이미지 빌드에 배치되어 있다. 빌드 캐시가 재사용되면 매번 실행되는 것은 아니며, 같은 Dockerfile도 고정되지 않은 외부 의존성이 바뀌면 다른 결과가 나올 수 있다. 이번에는 파일 구성을 확인했으며, 실제 빌드 성공 여부는 별도 실행으로 점검해야 한다.


ComfyUI 래퍼(저장소 접근 권한 필요)는 다른 방식을 택했다. Dockerfile에서는 `pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime` 베이스 위에 ComfyUI 소스를 clone하고 requirements.txt를 설치한 뒤 컨테이너 시작 스크립트를 복사하는 것까지만 처리한다.


커스텀 노드(ComfyUI-Manager, Civicomfy, ComfyUI-Lora-Manager 등)의 설치는 컨테이너 시작 스크립트 안의 `install_node()` 함수에서 컨테이너 시작 때 검사된다. 대상 디렉토리가 이미 있으면 건너뛰고, 없으면 소스와 의존성 설치를 시도한다. 이 스크립트는 일부 설치 실패를 경고로 남기고 진행한다. 디렉토리만 만들어진 채 설치가 실패했다면 다음 시작에서 건너뛸 수도 있으므로, 서비스 시작 로그만으로 모든 확장 설치가 끝났다고 판단할 수 없다.


패키지를 준비하는 시점이 두 구성에서 달랐다. AI-Container-Suite는 해당 설치를 빌드 단계에 두고, ComfyUI 래퍼는 이미지 빌드 뒤 첫 실행에서 추가 설치를 처리한다.


![readable-S12-01.png](/images/notion/tech-s12/image-1.png)


그림 1. ComfyUI 래퍼의 빌드와 시작 단계 구분. 설치 실패 경고 후에도 시작을 시도할 수 있어 포트가 열린 것과 확장 동작 확인을 구분해야 한다. 출처: 저장소 Dockerfile, 컨테이너 시작 스크립트를 바탕으로 직접 구성.


## 볼륨 마운트: 호스트 파일과 컨테이너 경로 사이의 책임


ComfyUI 래퍼의 컨테이너 실행 설정은 호스트의 `./data/models`를 컨테이너의 `/opt/ComfyUI/models`에 마운트한다. 모델 가중치, 입력 이미지, 출력 결과, 커스텀 노드 전부가 호스트 디렉토리에 남아 컨테이너를 다시 만들어도 유지되도록 구성되어 있다.


```yaml
volumes:
  - ./data/models:/opt/ComfyUI/models
  - ./data/input:/opt/ComfyUI/input
  - ./data/output:/opt/ComfyUI/output
  - ./data/custom_nodes:/opt/ComfyUI/custom_nodes
```


모델 파일의 확인 범위는 호스트 파일, 실제 마운트 경로, 접근 권한, 하위 경로와 인식 형식으로 나누었다. 파일이 보이지 않는 원인을 빈 디렉토리 하나로 좁히지는 않았다.


바인드 마운트가 이미지 안의 같은 경로를 가리면 이미지에 있던 파일도 보이지 않을 수 있다. Dockerfile의 VOLUME은 이미지 메타데이터로 실행 시 볼륨 생성에 관여하며, 호스트의 특정 폴더를 연결하는 바인드 마운트는 Compose 설정에서 따로 지정한다.


AI-Container-Suite는 VS Code DevContainer 방식이라 작업 디렉토리(`/workspace`)가 호스트 프로젝트 폴더와 연결되지만, Conda 환경(`/opt/conda`)과 시스템 패키지는 이미지 레이어에 들어 있어 호스트에서 직접 접근할 필요가 없다. 영속 데이터의 책임이 어느 쪽에 있는지가 두 구성에서 다르게 배치되어 있다.


## GPU 접근: 호스트 드라이버와 컨테이너 CUDA 런타임


ComfyUI 래퍼에는 드라이버와 CUDA 버전을 고려해 이미지를 골랐다는 주석이 남아 있다. 다만 주석의 호환성 설명을 현재의 일반 규칙으로 그대로 옮기지는 않았다. `nvidia-smi`의 CUDA Version은 드라이버가 지원하는 CUDA 버전을 나타낸다. 설치된 Toolkit 버전은 별도로 확인한다.


NVIDIA 문서는 같은 메이저 버전 안의 minor compatibility와 기능, PTX 제약을 따로 설명한다. “535 드라이버이면 CUDA 12.2까지만 가능하다” 같은 한 줄 판단으로는 충분하지 않다. [CUDA 호환성 문서](https://docs.nvidia.com/deploy/cuda-compatibility/minor-version-compatibility.html).


Compose의 GPU 예약 설정은 호스트 장치와 Docker 런타임 구성을 전제로 한다. 저장소 주석에는 `--compatibility`가 필요하다고 적혀 있지만, 현재 Docker 공식 예제는 이 플래그 없이 `docker compose up`으로 GPU 예약을 사용한다.


해당 주석을 모든 Compose 버전의 필수 조건으로 설명할 수 없다. [Docker GPU 예약 문서](https://docs.docker.com/compose/how-tos/gpu-support/).


AI-Container-Suite의 NVIDIA 환경 변수는 런타임에서 해석하는 설정이다. GPU 사용 조건을 장치 노출, 실행 권한, 호스트 드라이버, 컨테이너 라이브러리와 프레임워크 빌드로 나누어 읽었다. 장치 접근 이후 모델을 올릴 메모리도 별도로 확인할 항목이다.


![readable-S12-02.png](/images/notion/tech-s12/image-2.png)


그림 2. GPU 장치 노출과 프레임워크, 모델 실행을 나눈 설명용 의존 관계. 실제 호출 순서나 특정 호스트의 검증 결과를 나타내지는 않는다. 출처: NVIDIA, Docker 문서를 바탕으로 직접 구성.


## Conda 환경: 빌드 시 생성, 실행 시 활성화


AI-Container-Suite의 Dockerfile에서 `conda env create -f /tmp/environment.yml` 명령으로 `pytorch_env` 환경을 생성한 뒤, `~/.bashrc`에 `conda activate pytorch_env`를 추가하는 구문이 보인다.


그런데 같은 Dockerfile의 뒤쪽 `RUN` 단계에서는 `. $CONDA_DIR/etc/profile.d/conda.sh && conda activate pytorch_env`를 매번 명시적으로 적고 있다. 일반적인 비대화형 RUN 셸은 bashrc 설정을 그대로 실행하지 않고, 한 RUN의 셸 활성화 상태가 다음 RUN에 유지되지 않기 때문이다. 사용하는 셸과 최종 실행 사용자도 확인해야 한다.


같은 저장소의 CUDA 11.8 변형은 베이스 이미지를 `nvidia/cuda:11.8.0-cudnn8-devel-ubuntu22.04`로 바꾸고, [학습 환경의 패키지 설정](https://github.com/NAMUORI00/AI-Container-Suite/blob/e3e0c65c8a796d1bdb3dceeff6a47a78a374c6e1/.devcontainer/cuda-11.8/environment.yml)에서 `pytorch=2.0.*`과 `pytorch-cuda=11.8`을 지정한다.


Dockerfile 구조는 거의 같지만 `COPY` 경로만 `.devcontainer/cuda-11.8/environment.yml`을 가리킨다. CUDA 버전별로 Dockerfile과 학습 환경의 패키지 설정을 한 쌍씩 관리하는 방식이다.


두 파일을 함께 보면서 베이스 이미지와 환경 안의 프레임워크, CUDA 패키지를 대응시켰다. 버전 문자열의 차이만으로 실행 실패를 확정할 수는 없었다. 실제 로딩 라이브러리와 드라이버 호환성은 런타임 확인 범위로 남았다.


## 서비스 미응답 시 계층별 점검 순서


구성에서 읽은 단계를 실제 확인에 사용할 항목으로 정리했다.

1. **이미지 빌드**: `docker build`의 종료 결과와 `RUN` 단계 패키지 설치 로그
2. **컨테이너 시작**: `docker compose up` 이후 상태와 entrypoint 실행 기록
3. **런타임 설치**: entrypoint의 추가 설치(git clone, pip install) 결과
4. **볼륨 마운트**: 모델 등 호스트 파일과 접근 권한(`user: ${UID:-1000}:${GID:-1000}`)
5. **GPU 접근**: 호스트 드라이버, 컨테이너 CUDA의 호환성과 Container Toolkit 설치 상태
6. **서비스 포트**: 내부 listen 포트와 docker-compose 포트 매핑

이미지 빌드는 Dockerfile, 런타임 설치는 entrypoint, 볼륨은 호스트, GPU 연결은 드라이버와 Container Toolkit에 대응시켰다. 각 로그가 어느 단계까지 확인한 결과인지 구분하는 기준이다.


프로세스 시작 이후의 외부 응답에는 포트 바인딩, 방화벽, 리버스 프록시가 더해진다. 이 네트워크 경로와 함께, 시작 시 설치를 허용할 범위와 빌드에 고정할 범위를 다음 비교 항목으로 남겼다.


**참고**

- [Compose Deploy Specification -- Docker Docs](https://docs.docker.com/reference/compose-file/deploy/)
- [GPU support in Docker Compose -- Docker Docs](https://docs.docker.com/compose/how-tos/gpu-support/)
- [Dev Container metadata reference -- containers.dev](https://containers.dev/implementors/json_reference/)
- [ComfyUI 래퍼 컨테이너 시작 스크립트](https://github.com/NAMUORI00/ComfyUI/blob/088f323a309092541d51fc7456013efcd412b52a/entrypoint.sh) (저장소 접근 권한 필요): 시작 시 설치 검사와 실패 처리

## 함께 읽기


먼저 읽을 글: [컨테이너 이미지와 데이터 저장 구조](https://blog.namuori.net/posts/tech-k23/), [HTTP 요청과 응답, 인증과 인가 정리](https://blog.namuori.net/posts/tech-k24/)


이어 읽을 글: [스마트팜 서비스 코드와 연구 자료의 저장소 구성](https://blog.namuori.net/posts/tech-03-03/), [추론 UI와 GPU 커널의 역할 정리](https://blog.namuori.net/posts/tech-05-03/), [Nanotron의 병렬 학습과 배치 구성](https://blog.namuori.net/posts/tech-06-03/), [음원 분리 모델의 학습 코드와 실행 환경](https://blog.namuori.net/posts/tech-09-02/)
