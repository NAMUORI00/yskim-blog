# yskim-blog

Public Hugo site source for **나무가든**.

This repository owns the theme, layouts, build scripts, Cloudflare Functions,
comment UI, validation, and deployment configuration. It is also the only
GitHub repository used for production publishing.

## Branch model

- `main`: project source only. Hugo layouts, scripts, tests, docs, functions,
  and client assets live here.
- `production`: generated deploy state. GitHub Actions recreates public
  `content/`, Notion-hosted images, and generated data here before deploying.

Do not edit generated Markdown or Notion images by hand. Notion is the source
of truth for post content.

## Publishing flow

1. Write and edit posts in the private Notion CMS database.
2. Mark a post `Published`.
3. GitHub Actions runs on manual dispatch, schedule, or `main` push.
4. The workflow fetches Notion content, downloads images, validates Markdown,
   builds Hugo, and commits generated artifacts to `production`.
5. Wrangler deploys the built `public/` artifact to Cloudflare Pages as the
   `production` branch.

See `docs/notion-publishing.md` for Notion rules and
`docs/cloudflare-pages.md` for deployment settings.

## Local preview

Install Hugo extended `0.162.1`, authenticate with GitHub (`gh auth login`),
and provide `NOTION_TOKEN` and `NOTION_DATABASE_ID`.

```powershell
$env:CONTENT_SOURCE = "notion"
.\scripts\fetch-content.ps1
.\scripts\fetch-github-profile.ps1
hugo server -D
```

Production build:

```powershell
$env:CONTENT_SOURCE = "notion"
.\scripts\fetch-content.ps1
.\scripts\fetch-github-profile.ps1
.\scripts\validate-content.ps1
hugo --gc --minify --cleanDestinationDir
```

Generated `content/` and `static/images/` are ignored on `main`. They are
force-added only by the production publishing workflow.

## Comments

Post pages support:

- GitHub-authenticated comments through Giscus and GitHub Discussions.
- Optional anonymous comments through Cloudflare Pages Functions, Turnstile,
  and D1.

GitHub comments are enabled through the `General` discussion category.
Anonymous comments stay disabled until the Cloudflare D1 and Turnstile settings
are configured. See `docs/comments.md`.

## Cloudflare Pages

Production deploys are handled by GitHub Actions
(`.github/workflows/validate-and-build.yml`) using `wrangler pages deploy`.

Required GitHub Actions secrets:

- `NOTION_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Required repository variables:

- `CONTENT_SOURCE=notion`
- `NOTION_DATABASE_ID`
- `NOTION_STATUS=Published`
- `PUBLISH_BRANCH=production` (optional; workflow default is `production`)

Cloudflare Pages should keep native Git builds disconnected. GitHub Actions is
the production build path.
