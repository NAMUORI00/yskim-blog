# yskim-blog

Public Hugo blog source for `yskim blog`.

This repository contains only the deployable static-site source: Hugo configuration, layouts, published Markdown content, static assets, and CI checks. Draft notes, vault paths, private export automation, and local publishing operations live in the private operations repository.

## Local preview

Install Hugo extended `0.162.1`, then run:

```powershell
hugo server -D
```

Production build:

```powershell
.\scripts\validate-content.ps1
hugo --gc --minify
```

## Cloudflare Pages

Use these build settings:

- Build command: `hugo --gc --minify`
- Output directory: `public`
- Production branch: `main`
- Environment variable: `HUGO_VERSION=0.162.1`

Pull requests should pass GitHub Actions before being connected or promoted through Cloudflare Pages.
