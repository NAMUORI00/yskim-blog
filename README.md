# yskim-blog

Public Astro site source for **나무가든**.

This repository owns the layouts, components, build scripts, Cloudflare
Functions, comment UI, validation, and deployment configuration. It is the only
GitHub repository used for production publishing.

## Stack

- **Astro 6** static site (`src/`) with **Svelte 5** islands for interactivity.
- **Notion** as the CMS (single source of truth for posts and selected
  static pages).
- **Cloudflare Pages** hosting + Pages Functions (`functions/`) for comments
  and the optional media proxy.

## Branch model

- `main`: project source only. Astro layouts/components, scripts, tests, docs,
  functions, and client assets live here.
- `production`: generated deploy state. GitHub Actions recreates public
  `content/`, Notion-hosted images, and generated data here before deploying.

Do not edit generated Markdown or Notion images by hand. Notion is the source
of truth for post content and any static page generated with
`generated_by: "notion"`.

## Publishing flow

1. Write and edit posts in the private Notion CMS database.
2. Mark a post `Published`.
3. GitHub Actions runs on manual dispatch, schedule, or `main` push.
4. The workflow fetches Notion content, validates Markdown, builds the Astro
   site, and commits generated artifacts to `production`.
5. Wrangler deploys the built `dist/` artifact to Cloudflare Pages as the
   `production` branch.

See `docs/notion-publishing.md` for Notion rules and
`docs/cloudflare-pages.md` for deployment settings.

## Local development

Authenticate with GitHub (`gh auth login`) and provide `NOTION_TOKEN` and
`NOTION_DATABASE_ID` to fetch content.

```powershell
npm install
$env:CONTENT_SOURCE = "notion"
.\scripts\fetch-content.ps1
.\scripts\fetch-github-profile.ps1
npm run dev      # local preview at http://localhost:4321
```

Production build:

```powershell
$env:CONTENT_SOURCE = "notion"
.\scripts\fetch-content.ps1
.\scripts\fetch-github-profile.ps1
.\scripts\validate-content.ps1
npm run build    # outputs to dist/
```

Generated `content/` and `static/images/` are ignored on `main`. They are
force-added only by the production publishing workflow. `content/pages/`
keeps committed source pages such as privacy/contact/disclaimer, while Notion
rows with `Type=Page` can generate the home intro (`home`) or other static
pages in the same folder.

Site configuration (title, author, giscus, search-engine verification codes,
AdSense publisher id) lives in `src/config.ts`. The deployment URL is set as
`site` in `astro.config.mjs`.

## Comments

Post pages support:

- GitHub-authenticated comments through Giscus and GitHub Discussions.
- Optional anonymous comments through Cloudflare Pages Functions, Turnstile,
  and D1.

Giscus is enabled through the `General` discussion category (configured in
`src/config.ts`). Anonymous comments stay disabled until the Cloudflare D1 and
Turnstile settings are configured. See `docs/comments.md`.

## Media hosting

Heavy media (video, audio, attachments) can either be self-hosted in the build
(`download`, default) or served directly from Notion via a redirect Function
backed by KV (`proxy`). Toggle with the `NOTION_MEDIA_MODE` variable. See
`docs/media-hosting.md`.

## Cloudflare Pages

Production deploys are handled by GitHub Actions
(`.github/workflows/validate-and-build.yml`) using `wrangler pages deploy dist`.

Required GitHub Actions secrets:

- `NOTION_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Required repository variables:

- `CONTENT_SOURCE=notion`
- `NOTION_DATABASE_ID`
- `NOTION_STATUS=Published`
- `PUBLISH_BRANCH=production` (optional; workflow default is `production`)
- `NOTION_MEDIA_MODE` (`download` default, or `proxy`)

For the media `proxy` mode, the Pages project also needs a runtime
`NOTION_TOKEN` secret and the `MEDIA_CACHE` KV binding (see `wrangler.toml`).

Cloudflare Pages should keep native Git builds disconnected. GitHub Actions is
the production build path.
