# Obsidian Publishing Workflow

This public repository is the Hugo publishing layer. Obsidian remains the authoring environment, and GitHub pull requests are the review gate before Cloudflare Pages deploys the site.

## Content path

Published posts live in `content/posts`.

Use one Markdown file per public post:

- Korean original: `content/posts/my-note.md`
- English translation: `content/posts/my-note.en.md`

Both files should use the same `slug` and `translationKey` when they are translations of the same note.

## Required frontmatter

```yaml
---
title: "Post title"
date: 2026-06-08
draft: false
slug: "post-slug"
categories:
  - 연구 노트
tags:
  - notes
summary: "Short summary for lists and previews."
canonical: ""
translationKey: "post-slug"
comments: true
---
```

`categories` drive the left Tistory-style sidebar. `tags` remain looser cross-links. `comments: true` enables the comment area when a configured provider exists.

## Export rules

Before opening a pull request:

- Remove Obsidian-only fields such as `publish`.
- Convert wikilinks like `[[Note]]` to normal Markdown links or plain text.
- Convert embeds like `![[image.png]]` to Markdown image syntax.
- Place public images under `static/images` and reference them as `/images/...`.
- Keep draft or private material out of this repository.

The validation script enforces these rules:

```powershell
.\scripts\validate-content.ps1
```

## Pull request gate

Every content pull request should pass:

```powershell
.\scripts\validate-content.ps1
npx --yes markdownlint-cli2 "**/*.md" "#public"
hugo --gc --minify --cleanDestinationDir
```

Cloudflare Pages previews should be checked for the post page, the post list, the category page, mobile layout, images, code blocks, and comments area.
