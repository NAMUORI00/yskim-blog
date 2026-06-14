# Cloudflare Pages Setup

This repository deploys to Cloudflare Pages through GitHub Actions and
`wrangler pages deploy`. The Cloudflare dashboard hosts the Pages project and
domain, but production builds do not run inside Cloudflare's native Git build
pipeline.

## Branch contract

- `main`: source branch for the Astro project, tests, scripts, functions, and
  docs.
- `production`: generated branch containing public Notion-derived content and
  generated images. GitHub Actions updates this branch before each production
  deploy.

The workflow deploys with `--branch "${PUBLISH_BRANCH}"`, which defaults to
`production`.

## Cloudflare dashboard settings

- Framework preset: **None** (build runs in GitHub Actions, not Cloudflare)
- Build command: leave empty
- Build output directory: leave empty or `dist` (ignored when deploying from
  Actions)
- Production branch: `production`
- Native GitHub builds: disconnected or disabled

GitHub Actions builds the Astro site, uploads `dist/`, commits generated source
content to `production`, and deploys with the pinned Wrangler CLI from
`package-lock.json`.

## GitHub Actions secrets

Register these in GitHub -> `yskim-blog` -> Settings -> Secrets and variables
-> Actions:

| Secret                  | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `NOTION_TOKEN`          | Read-only Notion integration token for content fetch               |
| `CLOUDFLARE_API_TOKEN`  | Deploy to Cloudflare Pages (Account + Cloudflare Pages Edit)       |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id for Pages deploy                             |

`GITHUB_TOKEN` is provided automatically and is used to update the
`production` branch.

Register these repository variables in the same settings area:

| Variable             | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| `CONTENT_SOURCE`     | Set to `notion`                                           |
| `NOTION_DATABASE_ID` | Private Notion CMS database id used by the Notion fetcher |
| `NOTION_STATUS`      | Optional Notion status filter. Defaults to `Published`    |
| `PUBLISH_BRANCH`     | Optional deploy branch. Defaults to `production`          |

`NOTION_MEDIA_MODE` is an optional variable: `download` (default) self-hosts
media, while `proxy` serves heavy media from Notion via the media Function.
See `docs/media-hosting.md`.

## Deployment flow

1. Push project changes to `main`, wait for the scheduled run, or start the
   workflow manually.
2. GitHub Actions fetches `Status=Published` Notion rows and regenerates
   content from scratch.
3. The build validates generated Markdown, checks Pages Functions, fetches the
   GitHub profile, and builds the Astro site.
4. The `publish-production` job commits generated `content/`, `static/images/`,
   `static/files/`, `data/content-source.yaml`, and `data/github.yaml` to
   `production`.
5. The `deploy` job deploys the built `dist/` artifact to Cloudflare Pages as
   the `production` branch.

Pull requests run the build and validation jobs only. They do not update
`production` and do not deploy.

## Manual GitHub Actions runs

The workflow can be started from GitHub Actions with these inputs:

- `content_source=configured`: use the default single-repository Notion CMS
  source.
- `content_source=notion`: explicitly run the Notion CMS source.
- `notion_status`: override the Notion status filter for testing, for example
  `Ready`. Production should use `Published`.
- `production_branch`: override the generated deploy branch. Keep this as
  `production` unless testing a temporary branch.
- `deploy`: publish the generated branch and deploy after validation. Disable
  this for a dry run.

## Custom domain checklist

- Add the custom domain in Cloudflare Pages.
- Point DNS to the Pages project as instructed by Cloudflare.
- Update `site` in `astro.config.mjs` from `https://blog.namuori.net` if the
  final domain changes.
- Check canonical URLs, redirects, and the 404 page after the first production
  deploy.

## Comment bindings

Anonymous comments require Pages Functions bindings after the code is deployed:

- `COMMENTS_DB`: D1 database binding for comment rows.
- `TURNSTILE_SECRET_KEY`: encrypted secret used for server-side Turnstile
  validation.
- `COMMENTS_ADMIN_TOKEN`: encrypted secret used by the moderation API.
- `COMMENTS_AUTO_APPROVE`: optional plain variable. Keep unset or `false` for
  review-before-publish.

The project already commits a `wrangler.toml` (with the `MEDIA_CACHE` KV binding
for the media proxy). Add the `COMMENTS_DB` D1 binding there, or in the
Cloudflare dashboard under the Pages project settings. Database IDs are not
secrets and may be committed; do not commit Turnstile secrets or moderation
tokens.
