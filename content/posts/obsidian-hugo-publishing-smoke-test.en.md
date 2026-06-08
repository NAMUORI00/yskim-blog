---
title: "Obsidian to Hugo Publishing Smoke Test"
date: 2026-06-08
draft: false
slug: "obsidian-hugo-publishing-smoke-test"
tags:
  - meta
  - workflow
  - hugo
summary: "A small public post used to verify the Obsidian-to-Hugo publication path."
canonical: ""
translationKey: "obsidian-hugo-publishing-smoke-test"
---

This post verifies the first version of the public Hugo build.

The public repository contains only deployable site source, public content, and validation checks. Private drafts, Obsidian vault paths, and export automation stay in the private operations repository.

```powershell
.\scripts\validate-content.ps1
hugo --gc --minify
```

Korean is the primary language for this site. English pages are published as secondary translations under `/en/`.
