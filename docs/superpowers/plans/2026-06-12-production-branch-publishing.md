# Production Branch Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep `main` as the project branch and publish generated public content from a dedicated `production` branch in the single public `NAMUORI00/yskim-blog` repository.

**Architecture:** GitHub Actions fetches Notion content, validates and builds it, commits generated content and generated images to `production`, then deploys that artifact to Cloudflare Pages as the `production` branch. The legacy private content repository path is removed from the active build path.

**Tech Stack:** GitHub Actions, Hugo, Node.js scripts, Notion API, Cloudflare Pages via Wrangler.

---

## Task 1: Pin the Branch Contract With Tests

**Files:**

- Create: `tests/production-workflow.test.mjs`
- Modify: `tests/notion-setup.test.mjs`

- [x] **Step 1: Add workflow contract tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("workflow deploys generated builds as the production branch", async () => {
  const workflow = await readFile(new URL("../.github/workflows/validate-and-build.yml", import.meta.url), "utf8");

  assert.match(workflow, /production_branch:/);
  assert.match(workflow, /default: production/);
  assert.match(workflow, /PUBLISH_BRANCH:/);
  assert.match(workflow, /wrangler pages deploy public/);
  assert.match(workflow, /--branch "\$\{PUBLISH_BRANCH\}"/);
});
```

- [x] **Step 2: Add private-repo removal test**

```js
test("workflow no longer fetches the legacy private content repository", async () => {
  const workflow = await readFile(new URL("../.github/workflows/validate-and-build.yml", import.meta.url), "utf8");
  const hugoConfig = await readFile(new URL("../hugo.yaml", import.meta.url), "utf8");

  assert.doesNotMatch(workflow, /repository_dispatch/);
  assert.doesNotMatch(workflow, /CONTENT_REPO_TOKEN/);
  assert.doesNotMatch(workflow, /yskim-blog-private/);
  assert.doesNotMatch(hugoConfig, /contentRepo:/);
});
```

- [x] **Step 3: Run the tests and verify they fail**

Run: `npm test`
Expected: FAIL because the current workflow still deploys `main` and still supports `yskim-blog-private`.

## Task 2: Make Notion the Only Active Content Source

**Files:**

- Modify: `.github/workflows/validate-and-build.yml`
- Modify: `.github/scripts/fetch-content.sh`
- Modify: `scripts/fetch-content.ps1`
- Modify: `hugo.yaml`
- Modify: `scripts/notion-setup.mjs`

- [x] **Step 1: Remove active private content checkout from GitHub Actions**

Keep `workflow_dispatch`, `schedule`, `pull_request`, and `push` triggers. Remove `repository_dispatch` and the private repository checkout steps. Set default content source to `notion`.

- [x] **Step 2: Commit generated content to production**

After validation and Hugo build, upload generated content as an artifact. Add a `publish-production` job with `contents: write` that checks out the triggering commit, downloads generated content, force-adds `content/`, `static/images/`, and generated data, commits the result, and pushes `HEAD:production` with `--force-with-lease`.

- [x] **Step 3: Deploy as production**

Make the deploy job depend on the branch publication job and pass `--branch "${PUBLISH_BRANCH}"` to Wrangler.

## Task 3: Update Docs for the New Operating Model

**Files:**

- Modify: `README.md`
- Modify: `docs/cloudflare-pages.md`
- Modify: `docs/notion-publishing.md`
- Modify: `docs/content-repo-dispatch.md`
- Modify: `docs/obsidian-publishing.md`

- [x] **Step 1: Document the branch contract**

Document `main` as source code only and `production` as generated deploy state.

- [x] **Step 2: Document legacy repository retirement**

State that `yskim-blog-private` and `blog_renew` are archive candidates after the Notion production deployment passes.

## Task 4: Verify and Publish

**Files:**

- No new files expected.

- [x] **Step 1: Run local verification**

Run: `npm test`, markdown lint, content validation when content is present, Pages Functions build, and Hugo build.

- [ ] **Step 2: Push project changes to main**

Commit the workflow and documentation changes to `main`.

- [x] **Step 3: Connect Notion DB to the read-only integration**

Use the Notion DB UI to add integration `BLOG` to the CMS database connections. This is required before Notion API fetch can pass.

- [ ] **Step 4: Run production workflow**

Run a manual workflow with Notion source and deployment enabled. Confirm it updates `production` and deploys to Cloudflare Pages.

- [ ] **Step 5: Rename/archive legacy repositories**

After production deploy passes, rename unnecessary repositories with an `-archive` suffix, starting with `yskim-blog-private` and `blog_renew`.
