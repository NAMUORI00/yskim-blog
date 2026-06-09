# yskim-blog

Public Hugo site source for **나무가든**.

This repository owns the theme, layouts, build scripts, Cloudflare Functions, and deployment configuration. All Hugo content (`content/`, `static/images/`) is managed in the private repository `NAMUORI00/yskim-blog-private` and fetched at build time.

Each post is published in the language it was written in. Author name, avatar, and bio come from the GitHub profile at build time.

## Publishing flow

1. Write and edit notes in Obsidian.
2. Export public-ready Markdown and images to `yskim-blog-private`.
3. Open a pull request in the private content repository.
4. After merge to `main`, the private repo workflow triggers a public site rebuild.
5. GitHub Actions fetches content, validates frontmatter, builds Hugo, and deploys to Cloudflare Pages.
6. Cloudflare Pages serves the production site.

See `docs/obsidian-publishing.md` for frontmatter rules and `docs/content-repo-dispatch.md` for token and dispatch setup.

## Local preview

Install Hugo extended `0.162.1`, authenticate with GitHub (`gh auth login`), then run:

```powershell
.\scripts\fetch-content.ps1
.\scripts\fetch-github-profile.ps1
hugo server -D
```

Production build:

```powershell
.\scripts\fetch-content.ps1
.\scripts\fetch-github-profile.ps1
.\scripts\validate-content.ps1
hugo --gc --minify --cleanDestinationDir
```

Do not commit fetched `content/` or `static/images/` to this repository.

## Comments

Post pages support two comment modes:

- GitHub-style comments through Giscus and GitHub Discussions.
- Anonymous comments through Cloudflare Pages Functions, Turnstile, and D1.

GitHub-style comments are enabled through the `General` discussion category. Anonymous comments stay disabled until the Cloudflare D1 and Turnstile settings are configured. See `docs/comments.md`.

## Cloudflare Pages

Production deploys are handled by GitHub Actions (`.github/workflows/validate-and-build.yml`) using `cloudflare/pages-action`.

Required GitHub Actions secrets:

- `CONTENT_REPO_TOKEN`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Cloudflare Pages should use the **None** framework preset with an empty build command. See `docs/cloudflare-pages.md` for dashboard settings and the deployment flow.

Pull requests run the build and validation jobs only. Production deploy runs on `main` push and `content-updated` repository dispatch.
