# Private content repo dispatch

Published Markdown and images live in the private repository `NAMUORI00/yskim-blog-private`. The public site repository `NAMUORI00/yskim-blog` fetches `content/` and `static/images/` at build time through GitHub Actions.

## Secrets

### Public repo (`yskim-blog`)

| Secret                  | Purpose                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `CONTENT_REPO_TOKEN`    | Read access to `yskim-blog-private` for GitHub Actions content checkout      |
| `CLOUDFLARE_API_TOKEN`  | Deploy the built site to Cloudflare Pages                                    |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id for Pages deploy                                       |

Create a fine-grained PAT or classic PAT with **Contents: Read** on `yskim-blog-private`.

Register `CONTENT_REPO_TOKEN`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` in GitHub → `yskim-blog` → Settings → Secrets and variables → Actions.

Cloudflare Pages project environment variables for build-time content fetch are no longer required.

### Private repo (`yskim-blog-private`)

| Secret                       | Purpose                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `PUBLIC_REPO_DISPATCH_TOKEN` | Trigger a rebuild of the public site after content changes  |

Create a PAT with permission to call `repository_dispatch` on `yskim-blog`.

Register it in GitHub → `yskim-blog-private` → Settings → Secrets and variables → Actions.

## Private repo workflow

Add this file to `yskim-blog-private`:

`.github/workflows/trigger-public-build.yml`

```yaml
name: Trigger public site build

on:
  push:
    branches:
      - main
    paths:
      - content/**
      - static/images/**

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger public site rebuild
        env:
          GH_TOKEN: ${{ secrets.PUBLIC_REPO_DISPATCH_TOKEN }}
        run: |
          gh api repos/NAMUORI00/yskim-blog/dispatches \
            -f event_type=content-updated
```

When content is pushed to `main`, the public repository workflow runs with the `repository_dispatch` trigger, rebuilds the site with the latest fetched content, and deploys to Cloudflare Pages.
