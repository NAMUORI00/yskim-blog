---
title: "Hugo Git Publisher 설치"
date: 2026-06-08
draft: false
publish: true
slug: "hugo-git-publisher-installer"
translationKey: "hugo-git-publisher-installer"
tags:
  - obsidian
  - hugo
  - github
summary: "Obsidian에서 Hugo 블로그 repo로 글을 내보내고 GitHub로 발행하기 위한 Windows 설치 페이지입니다."
---

이 페이지는 Obsidian 플러그인 **Hugo Git Publisher**와 필요한 Windows 의존성을 설치하기 위한 다운로드 지점입니다.

## 설치

1. 아래 버튼 링크를 눌러 설치 파일을 내려받습니다.
2. 다운로드한 `install.cmd`를 실행합니다.
3. 창에서 vault 경로와 Hugo public repo 경로를 확인합니다.
4. GitHub 로그인이 필요하면 브라우저 인증을 완료합니다.
5. Obsidian을 재시작합니다.

[Windows 설치 파일 다운로드](/downloads/hugo-git-publisher/install.cmd)

## 설치되는 항목

- Git
- GitHub CLI
- Node.js LTS / npm
- Obsidian 플러그인 `Hugo Git Publisher`

플러그인은 GitHub 토큰을 저장하지 않습니다. GitHub 인증은 GitHub CLI의 `gh auth login --web` 흐름을 사용합니다.

## 수동 다운로드

- [PowerShell 설치 스크립트](/downloads/hugo-git-publisher/install.ps1)
- [플러그인 manifest](/downloads/hugo-git-publisher/manifest.json)
- [플러그인 main.js](/downloads/hugo-git-publisher/main.js)
- [기본 설정 예시](/downloads/hugo-git-publisher/data.example.json)

## 기본 경로

설치 스크립트는 기본값으로 다음 경로를 제안합니다.

```text
Obsidian vault:
G:\내 드라이브\Obsidian_Note\yskim_note

Hugo public repo:
%USERPROFILE%\Documents\Projects\yskim-blog-public
```

다른 PC에서 사용할 때는 실행 중 표시되는 프롬프트에서 경로만 바꾸면 됩니다.
