# Managed Blog And Site Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved B schema so Posts DB is optimized for publishing and Site DB is optimized for reusable site slots.

**Architecture:** Keep the current split Notion source model. The fetcher reads canonical B-schema columns first while preserving generated frontmatter contracts used by Astro. Notion DB schema and rows are migrated in place under `퍼블리시 중인 페이지` -> `블로그 DB 관리`.

**Tech Stack:** Astro, Node test runner, Notion Public API through `ntn`, GitHub Actions, Cloudflare Pages.

---

## Task 1: Add Schema Mapping Tests

**Files:**

- Modify: `tests/notion-content.test.mjs`

- [ ] Add a test that maps Posts DB `PublishedAt`, `Excerpt`, `CanonicalUrl`, and `CommentsEnabled` into the existing generated post shape.
- [ ] Add a test that maps Site DB `Key`, `Kind`, `Slot`, `Label`, `Value`, `URL`, `Order`, `IconKey`, and `Config` into static page frontmatter.
- [ ] Run the focused tests and verify they fail before implementation.

## Task 2: Implement Fetcher Mapping

**Files:**

- Modify: `scripts/notion-content.mjs`

- [ ] Add B-schema default mappings for Posts and Site DBs.
- [ ] Keep generated Markdown/frontmatter output stable for existing Astro pages.
- [ ] Normalize Site DB fields into custom frontmatter so profile, links, footer, and home UI still work without relying only on raw `Meta`.
- [ ] Run focused tests until green.

## Task 3: Update Documentation

**Files:**

- Modify: `README.md`
- Modify: `docs/notion-publishing.md`

- [ ] Replace the old shared-column table with Posts-specific and Site-specific B schema descriptions.
- [ ] Document that `Config` is the escape hatch and ordinary site content should prefer typed columns.

## Task 4: Migrate Notion

**Notion targets:**

- Posts data source: `8526917e-2f1f-41a5-8563-e0fb2e2353d1`
- Site data source: `4156be91-e3b4-459a-a9c2-a40eef49f257`

- [ ] Rename Posts `Date` to `PublishedAt`, `Summary` to `Excerpt`, `Canonical` to `CanonicalUrl`, and `Comments` to `CommentsEnabled` when present.
- [ ] Add missing Posts columns `Cover`, `Featured`, and `Series`.
- [ ] Rename Site `Slug` to `Key`, `Meta` to `Config`, and `Summary` to `Value`.
- [ ] Add missing Site columns `Kind`, `Slot`, `Label`, `URL`, `Order`, and `IconKey`.
- [ ] Populate existing Site rows so `home`, `profile`, `links`, and footer/legal pages keep their current behavior.
- [ ] Update the `블로그 DB 관리` page descriptions.

## Task 5: Verify And Deploy

- [ ] Run `npm test`.
- [ ] Run `npx markdownlint-cli2 "README.md" "docs/**/*.md"`.
- [ ] Run `npm run build`.
- [ ] Run a GitHub Actions dry-run with `deploy=false`.
- [ ] Push to `main`, watch the production deploy, and verify live URLs on `blog.namuori.net`.
