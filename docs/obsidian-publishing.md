# Legacy Obsidian Publishing Workflow

This document is retained as migration context. Obsidian can still be used for
drafting, but it is no longer the production content source for this blog.

## Current rule

Notion is the source of truth for published blog content. Generated Hugo
Markdown and Notion image assets are artifacts created by GitHub Actions and
stored on the `production` branch.

Do not edit generated `content/` or `static/images/notion/` files by hand.
Edits should happen in the Notion CMS database and then be regenerated.

## Historical frontmatter shape

The generated Markdown still targets this Hugo frontmatter shape:

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

`categories` drive the sidebar and category pages. `tags` drive cross-links and
knowledge graph relationships. `comments: true` enables the configured comment
area for that post.

The first category is also the canonical generated folder parent:
`content/posts/<category-slug>/<slug>.md`. Public URLs remain slug-based, such
as `/posts/my-note/`.
