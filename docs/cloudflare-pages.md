# Cloudflare Pages Setup

This public repository is designed for Cloudflare Pages with GitHub integration.

## Build settings

- Framework preset: Hugo
- Build command: `hugo --gc --minify`
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

Private Obsidian vault paths and export automation are intentionally excluded from this public repository.
