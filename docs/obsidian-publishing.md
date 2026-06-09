# Obsidian Publishing Workflow

Obsidian remains the authoring environment. Public-ready Markdown and images are committed to the private repository `NAMUORI00/yskim-blog-private`. The public site repository fetches that content during GitHub Actions builds.

Do not commit `content/` or `static/images/` to the public `yskim-blog` repository.

## Content path

Published posts live in the private repo under `content/posts`.

Use one Markdown file per public post, for example `content/posts/my-note.md`. Each file is published in the language it was written in.

Images belong in `static/images/` in the private repo and are referenced as `/images/...`.

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
cover: ""
canonical: ""
comments: true
---
```

`categories` drive the left Tistory-style sidebar. `tags` remain looser cross-links. `comments: true` enables the comment area when a configured provider exists.

Optional `cover` adds a list-card thumbnail when set to a public path such as `/images/posts/my-note/cover.jpg`. Leave it empty to show a text-only preview card.

## Export rules

Before opening a pull request in `yskim-blog-private`:

- Remove Obsidian-only fields such as `publish`.
- Convert wikilinks like `[[Note]]` to normal Markdown links or plain text.
- Convert embeds like `![[image.png]]` to Markdown image syntax.
- Place public images under `static/images` and reference them as `/images/...`.
- Keep draft or private material out of the content repository.

The validation script in the public site repository enforces these rules after content is fetched.

Local Windows check:

```powershell
.\scripts\validate-content.ps1
```

GitHub Actions runs the equivalent bash script:

```bash
bash .github/scripts/validate-content.sh
```

## Pull request gate

Every content pull request in `yskim-blog-private` should pass the public site checks locally or through the triggered public rebuild.

Local Windows:

```powershell
.\scripts\fetch-content.ps1
.\scripts\fetch-github-profile.ps1
.\scripts\validate-content.ps1
npx --yes markdownlint-cli2 "content/**/*.md"
hugo --gc --minify --cleanDestinationDir
```

GitHub Actions runs the same pipeline with `.github/scripts/*.sh`, then deploys on `main`.

After merge to `main`, the private repository should trigger a public site rebuild. See `docs/content-repo-dispatch.md` for PAT and workflow setup.

Review the production site after GitHub Actions deploy finishes. Check the post page, the post list, the category page, mobile layout, images, code blocks, and comments area.
