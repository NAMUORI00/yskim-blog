# Cloudflare Pages Setup

This public repository is designed for Cloudflare Pages with GitHub integration.

## Build settings

- Framework preset: Hugo
- Build command: `hugo --gc --minify --cleanDestinationDir`
- Build output directory: `public`
- Production branch: `main`
- Environment variable: `HUGO_VERSION=0.162.1`

Add the same `HUGO_VERSION` value to both Production and Preview environments so pull request previews use the same Hugo version as production.

## Deployment flow

1. Push a content or code branch to GitHub.
2. Open a pull request.
3. Wait for GitHub Actions and Cloudflare Pages preview to finish.
4. Review the preview URL for layout, mobile rendering, images, code blocks, and metadata.
5. Merge to `main` only after the preview and checks are acceptable.

## Custom domain checklist

- Add the custom domain in Cloudflare Pages.
- Point DNS to the Pages project as instructed by Cloudflare.
- Update `baseURL` in `hugo.yaml` from `https://example.com/` to the final domain.
- Check canonical URLs, redirects, and the 404 page after the first production deploy.

Private Obsidian vault paths and export automation are intentionally excluded from this public repository. This repository receives only public-ready Markdown through pull requests.

The deployed site is multilingual:

- Korean default: `/`
- English translations: `/en/`
- Post translation pairs share the same `slug` and `translationKey`.

## Comment bindings

Anonymous comments require Pages Functions bindings after the code is deployed:

- `COMMENTS_DB`: D1 database binding for comment rows.
- `TURNSTILE_SECRET_KEY`: encrypted secret used for server-side Turnstile validation.
- `COMMENTS_ADMIN_TOKEN`: encrypted secret used by the moderation API.
- `COMMENTS_AUTO_APPROVE`: optional plain variable. Keep unset or `false` for review-before-publish.

Configure the D1 binding with `scripts/setup-cloudflare-comments.ps1`, or add it manually in the Cloudflare dashboard under the Pages project settings. A generated `wrangler.toml` may be committed because the D1 database ID is not a secret; do not commit Turnstile secrets or moderation tokens.
