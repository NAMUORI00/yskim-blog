# yskim-blog

Public Hugo blog source for `yskim blog`.

This repository is the public publishing layer for notes written in Obsidian. Draft notes stay in the private vault. Published Markdown is exported or copied into `content/posts`, reviewed through GitHub pull requests, rendered by Hugo, and deployed by Cloudflare Pages.

Korean is the default language. English translations are published under `/en/` with matching `translationKey` values. The left sidebar is category-first like a Tistory skin, while the right sidebar keeps a small Obsidian-style knowledge graph.

## Publishing flow

1. Write and edit notes in Obsidian.
2. Export only public-ready Markdown to `content/posts`.
3. Open a GitHub pull request for review.
4. Let GitHub Actions validate frontmatter, links, images, Markdown, and the Hugo build.
5. Review the Cloudflare Pages preview.
6. Merge to `main` for production deployment.

See `docs/obsidian-publishing.md` for the required frontmatter and export rules.

## Local preview

Install Hugo extended `0.162.1`, then run:

```powershell
hugo server -D
```

Production build:

```powershell
.\scripts\validate-content.ps1
hugo --gc --minify --cleanDestinationDir
```

## Comments

Post pages support two comment modes:

- GitHub-style comments through Giscus and GitHub Discussions.
- Anonymous comments through Cloudflare Pages Functions, Turnstile, and D1.

GitHub-style comments are enabled through the `General` discussion category. Anonymous comments stay disabled until the Cloudflare D1 and Turnstile settings are configured. See `docs/comments.md`.

## Cloudflare Pages

Use these build settings:

- Build command: `hugo --gc --minify --cleanDestinationDir`
- Output directory: `public`
- Production branch: `main`
- Environment variable: `HUGO_VERSION=0.162.1`

Pull requests should pass GitHub Actions before being connected or promoted through Cloudflare Pages.
