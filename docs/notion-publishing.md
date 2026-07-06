# Notion Publishing Workflow

This is the lightweight production target for managing blog content in a private Notion database while keeping Hugo and Cloudflare Pages in the public `yskim-blog` repository.

## Goal

Keep `yskim-blog` as the only active publishing repository. Notion-managed content becomes Hugo-ready Markdown before validation, category path organization, Hugo build, comments, and deployment run.

Notion is the CMS and editorial workspace. Hugo remains the owned static rendering layer. Do not embed Notion pages or scrape Notion public HTML.

## Branch roles

- `main`: public project source, theme, build scripts, validation, Cloudflare Functions, docs, and tests.
- `production`: generated public content branch. GitHub Actions force-adds generated `content/`, `static/images/`, and generated data here before deploying.
- Legacy blog repositories such as `yskim-blog-private` and `blog_renew` should be renamed with an `-archive` suffix after production deploy is verified.

## Source of truth

Notion is the single source of truth for post content and selected static
pages such as the home intro and profile pages.

Generated Markdown and images under `content/posts`, Notion-generated files in
`content/pages`, and `static/images/notion` are build artifacts. Do not edit
generated Markdown by hand; the next Notion fetch will overwrite it. Avoid
two-way sync between Notion and repo Markdown.

On `main`, generated `content/` and `static/images/` stay ignored. On `production`, GitHub Actions force-adds them so the exact deployed state is auditable in Git.

## Preferred Notion shape

Use two private Notion databases shared with a read-only Notion integration.
The databases themselves do not need to be public, because they may contain
drafts and unpublished notes.

Each post row should provide these database properties:

- `Status`: only `Published` rows are exported.
- `Title`
- `Slug`
- `PublishedAt`
- `Category`
- `Tags`
- `Excerpt`
- `Cover`
- `CanonicalUrl`
- `CommentsEnabled`
- `Featured`
- `Series`

The simplest stable version is one Notion database row per post, with the post
body in the row page.

Site rows use typed slot properties instead of the post schema. `Kind=Page` or
`Kind=Profile` rows are exported as generated static pages. `Kind=Link` rows
with `Slot=sidebar.links` are folded into the generated `links` page
frontmatter. The home route reads `Key=home` for the intro copy.

## Data flow

1. Query all Notion database rows where `Status` is `Published`.
2. Fetch page blocks for every published row.
3. Convert blocks to Markdown with a proven converter such as `notion-to-md`.
4. Download Notion-hosted images and file assets, then rewrite Markdown paths.
5. Preserve equations and post-process unsupported or lossy blocks.
6. Generate Hugo frontmatter and Markdown under `content/posts` for posts.
7. Generate Notion-managed static pages under `content/pages` for `Type=Page`.
8. Fully replace generated post, generated page, and Notion image artifacts on
   every build.
9. Write `data/content-source.yaml` with `provider: notion`, database id,
   exported post/page counts, and fetch time.
10. Run the existing category path organizer so posts become
   `content/posts/<category-slug>/<slug>.md`.
11. Run the existing content validation.
12. Commit generated source artifacts to the `production` branch.
13. Deploy the built `public/` artifact to Cloudflare Pages as the
    `production` branch.

Public URLs should stay slug-based, for example `/posts/my-note/`.

## Images and files

Never write Notion API image URLs directly into Markdown. Notion file URLs are temporary presigned URLs and can expire roughly an hour after they are issued.

During the fetch step:

- download page covers, image blocks, and supported file assets;
- save them under `static/images/notion/<slug>/`;
- generate stable filenames;
- rewrite Markdown references to `/images/notion/<slug>/<file>`;
- fail validation if an image or file cannot be downloaded.

The current Hugo pipeline generates these files during build, stores them on the `production` branch, and includes them in the Cloudflare Pages artifact. Cloudflare R2 can be added later if the image set becomes too large or should be shared across builds.

## Block conversion

Notion block conversion is lossy, so the fetcher must treat unsupported blocks explicitly.

Use `notion-to-md` or another maintained Notion block converter as the base. Do not hand-roll the whole block converter. Add post-processing for the blocks that matter to this blog:

- `equation` blocks and inline equations must become KaTeX-compatible Markdown such as `$$...$$` or inline math.
- `callout` blocks should become a stable Hugo shortcode or styled blockquote.
- `toggle` blocks should become a details/summary shortcode or fail if unsupported.
- `column_list` and `column` blocks should degrade to normal sequential content unless a custom shortcode is added.
- `synced_block` should resolve to the synced content when available or fail visibly.
- `embed` blocks render as a responsive `<iframe>` for YouTube/Vimeo, and fall back to explicit links for other providers.
- `video` blocks render as a responsive `<iframe>` player for YouTube/Vimeo, or a native `<video>` player for Notion-hosted uploads and direct file URLs (the file is downloaded to `static/files/notion/<slug>/` and self-hosted).
- `audio` blocks render as a native `<audio>` player with the file self-hosted the same way.

Hugo must include KaTeX or MathJax support before ML/math-heavy Notion posts are considered production-ready.

## Validation rules

Keep the current Hugo-facing validation boundary:

- required frontmatter must exist;
- `comments` must be `true` or `false`;
- category and tag lists must be present;
- generated image references must point to files under `static/images`;
- generated Markdown must not contain temporary Notion file URLs;
- source-only fields and unsupported Notion blocks should fail the build instead of silently rendering broken content;
- math blocks should be preserved in renderable KaTeX or MathJax-compatible syntax.

The Obsidian-specific checks can remain during transition, but the long-term rule should become source-neutral: generated Markdown must be Hugo-ready.

## Build trigger and deletion behavior

Use GitHub Actions `workflow_dispatch` plus scheduled cron polling. A Notion webhook can be added later, but manual dispatch plus polling is simpler and stable enough for static publishing.

Every build should perform a full regeneration from `Status = Published`.

Do not do partial updates at first. Full rebuild keeps unpublished, deleted, or renamed Notion posts from lingering in the generated site.

## Rollout

1. Create a private Notion blog database and share it with a read-only integration.
2. Add a Notion fetcher behind the content source config.
3. Test with one Notion smoke post that includes a normal image and an equation.
4. Add KaTeX or MathJax support to Hugo and verify rendered math.
5. Switch GitHub Actions to the Notion source with manual dispatch and cron polling.
6. Publish generated artifacts to `production` and deploy that branch to Cloudflare Pages.
7. Verify production home, category page, post page, Giscus comments, images, and equations in the browser.
8. Rename legacy repositories with an `-archive` suffix once Notion is stable.

## Needed before implementation

- Notion integration token stored as a GitHub Actions secret.
- Split Notion database ids for Posts and Site content.
- Exact database property names for the managed Posts DB and Site DB schemas.

## Current CMS setup

The Notion CMS databases are configured outside this public repository under
`퍼블리시 중인 페이지` -> `블로그 DB 관리`. The structure uses two databases:

- Posts DB: public blog posts.
- Site DB: home intro, profile, address, links, privacy, disclaimer, contact,
  and other non-post content.

Posts DB columns:

- `Title`: public post title.
- `Status`: publish state. `Published` rows are exported.
- `Slug`: URL slug and generated Markdown filename.
- `PublishedAt`: publication date used for sorting and frontmatter.
- `Category`: primary category used by archive URLs and the graph.
- `Tags`: tag list used by post metadata and the graph.
- `Excerpt`: list-card and meta-description summary.
- `Cover`: optional cover image.
- `CanonicalUrl`: optional canonical URL.
- `CommentsEnabled`: per-post comment toggle.
- `Featured`: optional editorial marker for future featured surfaces.
- `Series`: optional series label for grouped writing.

Site DB columns:

- `Title`: editor-facing row title.
- `Status`: publish state. `Published` rows are exported.
- `Key`: stable static page or component key such as `home`, `profile`,
  `links`, `privacy`, `disclaimer`, `contact`, `portfolio`, or `github`.
- `Kind`: row role. Use `Page`, `Profile`, `Link`, `Text`, `Footer`, or
  `Navigation`.
- `Slot`: rendering slot such as `home.main`, `sidebar.profile`,
  `sidebar.links`, or `footer.links`.
- `Label`: display label.
- `Value`: short value, intro, link note, or generated page summary.
- `URL`: optional internal or external URL.
- `Order`: numeric display order for slot rows.
- `IconKey`: optional icon hint such as `portfolio`, `github`, `mail`, or
  `link`.
- `Config`: YAML frontmatter extension for exceptional structured values only.
  Prefer typed columns for ordinary labels, links, order, and slots.

GitHub Actions expects these values:

- repository variables `NOTION_POSTS_DATABASE_ID` and `NOTION_SITE_DATABASE_ID`;
- repository secret `NOTION_TOKEN`;
- repository variable `CONTENT_SOURCE=notion`;
- optional repository variable `NOTION_STATUS=Published` if the default should be explicit.
- optional repository variable `PUBLISH_BRANCH=production` if the default should be explicit.

Do not commit the Notion token. Keep generated Markdown and images out of source control.

The database page link, such as `https://namuori00.notion.site/2e8cf325d81c4acdb302800e2dcfc4df`, identifies the database for a person. It does not grant API access by itself. For GitHub Actions to read the database, connect the read-only Notion integration from the database page's Share/Connections menu and store that integration token as the GitHub secret `NOTION_TOKEN`.

Run this helper to check the current GitHub-side setup and print the next command:

```powershell
npm run check:notion
```

The existing Notion page titled `Markdown` from the old publishing notes has been duplicated into the new CMS and moved to `Published` after the Notion fetcher, image/file rewriting, math rendering, and unsupported-block checks passed end to end.

Use the GitHub Actions manual workflow inputs to test the Notion source before cutover:

- `content_source=notion`
- `notion_status=Ready` for pre-publication validation rows, or `Published` for production content.
- `deploy=false` for a dry run.

After the Notion source passes with real data, keep `CONTENT_SOURCE=notion`, keep the production status filter at `Published`, and use the scheduled workflow as the polling deploy path.
