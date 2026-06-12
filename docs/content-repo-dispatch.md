# Legacy Private Content Dispatch

This document is retained only as migration history.

The old publishing flow used a private repository to store generated Markdown
and images, then triggered `NAMUORI00/yskim-blog` through
`repository_dispatch`. That path is no longer active.

Current production publishing uses only the public `NAMUORI00/yskim-blog`
repository:

1. Notion is the content source of truth.
2. GitHub Actions fetches Notion content.
3. Generated `content/` and `static/images/` are committed to the `production`
   branch in this repository.
4. Cloudflare Pages deploys that generated `production` state.

The old private content repository can be renamed with an `-archive` suffix
after the first Notion-backed production deploy passes.
