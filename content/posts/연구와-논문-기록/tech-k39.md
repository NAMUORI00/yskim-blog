---
title: "논문 원본 파일과 문서 빌드 과정"
date: 2025-12-10
draft: false
slug: "tech-k39"
categories:
  - "연구와 논문 기록"
tags:
  - "workflow"
summary: "논문 PDF를 만드는 입력 파일과 빌드 순서를 정리했다. 본문 외에 그림, 참고문헌, 스타일이 최종 문서에 함께 들어간다. 작은 파일 묶음으로 각 자료가 연결되는 단계와 다시 실행할 조건을 살펴봤다."
cover: ""
canonical: ""
comments: false
notion_id: "3f4dcd44-779f-81d0-a542-ee316fea1988"
generated_by: "notion"
---
## 논문 빌드의 입력 파일 구성


논문 PDF를 만드는 입력 파일과 빌드 순서를 정리했다. 본문 외에 그림, 참고문헌, 스타일이 최종 문서에 함께 들어간다. 작은 파일 묶음으로 각 자료가 연결되는 단계와 다시 실행할 조건을 살펴봤다.


그림이나 참고문헌의 수정은 본문의 번호와 페이지 배치에도 영향을 줄 수 있다. 원고 파일만 볼 때 빠지는 의존성을 이 관계로 정리했다.


## 입력 파일들: 원고, 그림, 참고문헌


작은 논문 프로젝트의 파일 구조를 예로 들면 이렇다.


```javascript
paper/
├── main.tex          # 본문 원고
├── figures/
│   ├── fig1.pdf      # 실험 결과 그래프
│   └── fig2.png      # 시스템 구조도
├── references.bib    # 참고문헌 데이터베이스
└── ieee.bst          # 인용 스타일
```


`main.tex`에는 본문과 함께 그림 삽입 명령(`\includegraphics{figures/fig1.pdf}`)과 인용 명령(`\cite{kim2024}`)이 섞여 있다. `references.bib`는 참고문헌의 제목, 저자, 연도, 저널 정보를 구조화된 형식으로 담고 있다.


다음 서지 항목은 문법 설명을 위한 가상 자료다.


```javascript
@article{kim2024,
  author  = {Kim, Soo},
  title   = {A Method for Sensor Calibration},
  journal = {Journal of Measurements},
  year    = {2024},
  volume  = {12},
  pages   = {34--42}
}
```


기본 BibTeX 흐름에서는 본문에서 인용한 항목이 문헌 목록에 들어간다. `\nocite{...}`로 인용 표시 없이 포함하도록 지정하는 예외도 있다. 인용과 문헌 목록의 연결은 빌드 과정에서 자동으로 이루어진다.


## 빌드 단계: 컴파일, 참조 해소, 반복


LaTeX으로 논문을 빌드하는 과정은 한 번의 컴파일로 끝나지 않는다. 보조 파일이 없는 상태에서 pdfLaTeX와 BibTeX를 쓰는 전형적인 순서는 다음과 같다. biblatex와 Biber를 쓰는 구성은 명령과 중간 파일이 달라진다.

1. **`pdflatex main.tex`**: 본문을 처리하되, 인용(`\cite`)과 상호참조(`\ref`)는 `?`로 표시
2. **`bibtex main`**: `.aux` 파일에서 인용 키를 읽고, `.bib`에서 해당 항목을 찾아 `.bbl` 파일에 정리
3. **`pdflatex main.tex`**: 생성된 `.bbl`을 읽어 참고문헌 목록을 본문에 반영
4. **`pdflatex main.tex`**: 참고문헌 추가로 밀린 페이지 번호와 상호참조 번호를 확정

첫 번째 컴파일에서 `\cite{kim2024}`는 아직 번호를 모르기 때문에 `[?]`로 출력된다. BibTeX이 `.aux` 파일에 기록된 인용 키를 읽고 `.bbl` 파일로 정리한 뒤, 두 번째 컴파일에서 이 정보가 반영된다. 세 번째 컴파일이 필요한 이유는 참고문헌이 추가되면서 페이지가 밀릴 수 있기 때문이다.


<pre class="mermaid">flowchart TD
    TEX[/&quot;main.tex&lt;br/&gt;본문 원고&quot;/] --&gt; C1(&quot;1차 컴파일&lt;br/&gt;pdflatex&quot;)
    BIB[/&quot;references.bib&lt;br/&gt;문헌 DB&quot;/] --&gt; BT(&quot;BibTeX&lt;br/&gt;참조 해소&quot;)
    C1 --&gt;|&quot;.aux 파일&lt;br/&gt;인용 키 목록&quot;| BT
    BT --&gt;|&quot;.bbl 파일&lt;br/&gt;정리된 문헌&quot;| C2(&quot;2차 컴파일&lt;br/&gt;pdflatex&quot;)
    FIG[/&quot;figures/&lt;br/&gt;그림 파일&quot;/] --&gt; C1
    C2 --&gt; C3(&quot;3차 컴파일&lt;br/&gt;pdflatex&quot;)
    C3 --&gt; PDF[&quot;최종 PDF&quot;]</pre>


_그림 1. LaTeX + BibTeX 빌드에서 컴파일이 여러 번 필요한 이유 (설명용 예제)_


Pandoc을 사용하면 이 과정이 단일 명령으로 축약된다. [Pandoc 공식 문서](https://pandoc.org/MANUAL.html)에 따르면 `--citeproc` 옵션을 켜면 Pandoc이 내부적으로 인용 해소를 처리한다.


```javascript
pandoc main.md --citeproc --bibliography=references.bib --csl=ieee.csl -o paper.pdf
```


사용자는 명령 한 번을 실행하지만 PDF 엔진과 문서 조건에 따라 내부 처리는 여러 단계가 될 수 있다. LaTeX 엔진을 쓰면 해당 엔진 설치도 필요하다. citeproc은 인용 처리를 맡으며, 인용 키를 문헌 DB에서 찾아 번호를 매기는 과정 자체는 동일하게 일어난다.


## 산출물과 중간 파일 구분


LaTeX 빌드가 끝나면 디렉터리에 여러 파일이 쌓인다.


| 파일               | 역할            | 버전 관리 대상     |
| ---------------- | ------------- | ------------ |
| `main.tex`       | 입력 — 본문 원고    | O            |
| `references.bib` | 입력 — 참고문헌     | O            |
| `figures/*.pdf`  | 입력 — 그림       | O            |
| `main.aux`       | 중간 — 인용 키와 라벨 | X            |
| `main.bbl`       | 중간 — 정리된 문헌   | 제출 규칙에 따라 보존 |
| `main.log`       | 중간 — 컴파일 로그   | X            |
| `main.pdf`       | 최종 산출물        | 선택           |


출력을 다시 만들려면 입력뿐 아니라 템플릿, 글꼴, 엔진, 패키지 환경도 필요하다. 중간 파일은 보통 이력에서 제외하며 `.gitignore`의 `*.aux`, `*.log`가 그 예다. 최종 PDF의 추적 여부는 빌드 환경의 재현 가능성과 산출물 보관 목적에 따라 결정할 항목이다.


## 원본 변경과 재빌드 범위


변경 종류에 따라 필요한 빌드 단계가 다르다.


<pre class="mermaid">flowchart TB
    T[/본문, 그림, 문헌 변경/] --&gt; B[빌드 실행]
    B --&gt; Q{문헌 입력 변경?}
    Q --&gt;|예| R[BibTeX 또는 Biber]
    Q --&gt;|아니오| L[LaTeX 실행]
    R --&gt; L
    L --&gt; C{참조 재실행 경고?}
    C --&gt;|있음| L
    C --&gt;|없음| P[/PDF와 로그 확인/]</pre>


_그림 2. 입력 의존성과 재실행 경고를 확인하며 출력을 안정시키는 과정. 직접 작성한 설명용 예제_


오타 수정도 줄바꿈과 페이지를 바꿀 수 있어 파일 종류만으로 컴파일 횟수가 정해지지는 않는다. 참고문헌 입력과 참조 경고를 기준으로 필요한 처리를 다시 실행하는 흐름으로 읽었다.


[Overleaf의 BibTeX 가이드](https://www.overleaf.com/learn/latex/Bibliography_management_with_bibtex)에서도 이 컴파일 순서를 동일하게 설명한다.


`latexmk`은 이 의존 관계를 자동으로 판단해서 필요한 단계만 반복 실행한다. `latexmk -pdf main.tex`을 실행하면 참조가 확정될 때까지 컴파일을 알아서 반복한다. Makefile을 직접 작성하는 경우에는 이 의존 관계를 명시적으로 규칙에 넣어야 한다.


## 후속 정리


공동 저자가 같은 `.tex`를 수정할 때의 충돌과 코드로 생성하는 그림의 보관 범위는 후속 주제다. matplotlib, TikZ 원본만으로 빌드 때 재생성할지, 그림 파일도 함께 이력에 남길지 실행 환경과 산출물 확인 목적을 기준으로 비교할 수 있다.


---


**참고 자료**

- [Pandoc User's Guide](https://pandoc.org/MANUAL.html): `--citeproc` 옵션과 참고문헌 처리
- [Overleaf — Bibliography management with BibTeX](https://www.overleaf.com/learn/latex/Bibliography_management_with_bibtex): BibTeX 컴파일 순서와 워크플로우
- [Pandoc Citations](https://pandoc.org/demo/example33/9-citations.html): CSL 기반 인용 형식 설정

## 함께 읽기


먼저 읽을 글: [Git 포크, 브랜치와 변경 이력 비교](https://blog.namuori.net/posts/tech-k25/)
