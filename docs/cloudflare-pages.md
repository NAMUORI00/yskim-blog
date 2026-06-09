# Cloudflare Pages Setup

This public repository deploys to Cloudflare Pages through GitHub Actions. The Cloudflare dashboard hosts the project and custom domain, but **production builds no longer run inside Cloudflare Pages**.

## Cloudflare dashboard settings

- Framework preset: **None**
- Build command: leave empty
- Build output directory: leave empty or `public` (ignored when deploying from Actions)
- Production branch: `main`
- Disable automatic GitHub builds if Cloudflare still offers a native build hook for this project

GitHub Actions builds the site, uploads `public/`, and deploys with `cloudflare/pages-action`.

## GitHub Actions secrets

Register these in GitHub → `yskim-blog` → Settings → Secrets and variables → Actions:

| Secret                  | Purpose                                                                |
| ----------------------- | ---------------------------------------------------------------------- |
| `CONTENT_REPO_TOKEN`    | Read access to `yskim-blog-private` for private content checkout       |
| `CLOUDFLARE_API_TOKEN`  | Deploy to Cloudflare Pages (Account + Cloudflare Pages Edit)           |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id for Pages deploy                                 |

`GITHUB_TOKEN` is provided automatically for deployment status updates.

Cloudflare Pages environment variables such as `CONTENT_REPO_TOKEN` and `HUGO_VERSION` are no longer required for production builds.

## Deployment flow

1. Push a theme or code branch to the public repository, or push content to `yskim-blog-private`.
2. Open a pull request for code changes, or rely on `repository_dispatch` after content merges.
3. Wait for the GitHub Actions `build` job. Pull requests validate only; production deploy runs on `main` push and content dispatch.
4. Review the production URL after deploy, or inspect the uploaded `public-site` artifact from pull request runs.
5. Merge to `main` only after checks are acceptable.

## Custom domain checklist

- Add the custom domain in Cloudflare Pages.
- Point DNS to the Pages project as instructed by Cloudflare.
- Update `baseURL` in `hugo.yaml` from `https://example.com/` to the final domain.
- Check canonical URLs, redirects, and the 404 page after the first production deploy.

Private Obsidian vault paths and export automation are intentionally excluded from this public repository. Public-ready Markdown is committed only to `yskim-blog-private`.

Author profile data (name, avatar, bio) is fetched from GitHub during the GitHub Actions build via `.github/scripts/fetch-github-profile.sh` and written to `data/github.yaml`.

Content is fetched from `yskim-blog-private` via `.github/scripts/fetch-content.sh`. See `docs/content-repo-dispatch.md` for token setup and the private-repo rebuild trigger.

## Comment bindings

Anonymous comments require Pages Functions bindings after the code is deployed:

- `COMMENTS_DB`: D1 database binding for comment rows.
- `TURNSTILE_SECRET_KEY`: encrypted secret used for server-side Turnstile validation.
- `COMMENTS_ADMIN_TOKEN`: encrypted secret used by the moderation API.
- `COMMENTS_AUTO_APPROVE`: optional plain variable. Keep unset or `false` for review-before-publish.

Configure the D1 binding with `scripts/setup-cloudflare-comments.ps1`, or add it manually in the Cloudflare dashboard under the Pages project settings. A generated `wrangler.toml` may be committed because the D1 database ID is not a secret; do not commit Turnstile secrets or moderation tokens.
