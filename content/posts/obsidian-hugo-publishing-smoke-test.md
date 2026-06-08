---
title: "Obsidian에서 Hugo로 발행하는 테스트"
date: 2026-06-08
draft: false
slug: "obsidian-hugo-publishing-smoke-test"
tags:
  - meta
  - workflow
  - hugo
summary: "Obsidian 초안에서 Hugo 공개 사이트로 이어지는 발행 경로를 검증하기 위한 첫 테스트 글입니다."
canonical: ""
translationKey: "obsidian-hugo-publishing-smoke-test"
---

이 글은 공개 Hugo 빌드의 첫 번째 발행 경로를 검증하기 위해 작성했습니다.

공개 저장소에는 배포 가능한 사이트 소스, 공개 콘텐츠, 검증 스크립트만 남깁니다. 개인 초안, Obsidian vault 경로, export 자동화는 비공개 운영 저장소에 보관합니다.

```powershell
.\scripts\validate-content.ps1
hugo --gc --minify
```

이 구조를 기준으로 한국어 글을 기본 원문으로 두고, 필요한 경우 `/en/` 아래에 영문 번역을 함께 발행합니다.
