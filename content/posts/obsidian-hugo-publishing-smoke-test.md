---
title: "Obsidian to Hugo Publishing Smoke Test"
date: 2026-06-08
draft: false
slug: "obsidian-hugo-publishing-smoke-test"
tags:
  - meta
  - workflow
summary: "A small public post used to verify the Hugo build and deployment path."
canonical: ""
---
This post verifies the first version of the public Hugo build.

The public repository contains the deployable site source, generated content, and validation checks. Private drafting and publishing operations stay outside this repository.

```powershell
.\scripts\validate-content.ps1
hugo --gc --minify
```
