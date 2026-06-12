# Notion Publishing Workflow

This is the lightweight migration target for moving blog content management from Obsidian/private GitHub content to a private Notion database.

## Goal

Keep `yskim-blog` as the public Hugo and Cloudflare Pages repository. Replace only the content fetch layer so Notion-managed content becomes Hugo-ready Markdown before the existing validation, category path organization, Hugo build, comments, reactions, and deployment steps run.

Notion is the CMS and editorial workspace. Hugo remains the owned static rendering layer. Do not embed Notion pages or scrape Notion public HTML.

## Repository roles

- `yskim-blog`: public site source, theme, build scripts, validation, Cloudflare Functions, deployment.
- `yskim-blog-private`: legacy Obsidian content source during migration. After cutover, keep it only as an archive or temporary fallback.
- `obsidian-ide-ai-agent`: separate Obsidian AI workflow. It is not part of the Notion blog publishing path.

## Source of truth

Notion is the single source of truth for post content.

Generated Markdown and images under `content/posts` and `static/images/notion` are build artifacts. Do not edit generated Markdown by hand; the next Notion fetch will overwrite it. Avoid two-way sync between Notion and repo Markdown.

## Preferred Notion shape

Use one private Notion database shared with a read-only Notion integration. The database itself does not need to be public, because it may contain drafts and unpublished notes.

Each post row should provide these database properties:

- `Status`: only `Published` rows are exported.
- `Title`
- `Slug`
- `Date`
- `Category`
- `Tags`
- `Summary`
- `Cover`
- `Canonical`
- `Comments`

Optional properties such as `Series`, `Priority`, or `Featured` can be added later. The simplest stable version is one Notion database row per post, with the post body in the row page.

## Data flow

1. Query all Notion database rows where `Status` is `Published`.
2. Fetch page blocks for every published row.
3. Convert blocks to Markdown with a proven converter such as `notion-to-md`.
4. Download Notion-hosted images and file assets, then rewrite Markdown paths.
5. Preserve equations and post-process unsupported or lossy blocks.
6. Generate Hugo frontmatter and Markdown under `content/posts`.
7. Fully replace generated post and Notion image artifacts on every build.
8. Write `data/content-source.yaml` with `provider: notion`, database id, exported page count, and fetch time.
9. Run the existing category path organizer so posts become `content/posts/<category-slug>/<slug>.md`.
10. Run the existing content validation.
11. Build and deploy Hugo as before.

Public URLs should stay slug-based, for example `/posts/my-note/`.

## Images and files

Never write Notion API image URLs directly into Markdown. Notion file URLs are temporary presigned URLs and can expire roughly an hour after they are issued.

During the fetch step:

- download page covers, image blocks, and supported file assets;
- save them under `static/images/notion/<slug>/`;
- generate stable filenames;
- rewrite Markdown references to `/images/notion/<slug>/<file>`;
- fail validation if an image or file cannot be downloaded.

The current Hugo pipeline should generate these files during build and include them in the Cloudflare Pages artifact. Cloudflare R2 can be added later if the image set becomes too large or should be shared across builds.

## Block conversion

Notion block conversion is lossy, so the fetcher must treat unsupported blocks explicitly.

Use `notion-to-md` or another maintained Notion block converter as the base. Do not hand-roll the whole block converter. Add post-processing for the blocks that matter to this blog:

- `equation` blocks and inline equations must become KaTeX-compatible Markdown such as `$$...$$` or inline math.
- `callout` blocks should become a stable Hugo shortcode or styled blockquote.
- `toggle` blocks should become a details/summary shortcode or fail if unsupported.
- `column_list` and `column` blocks should degrade to normal sequential content unless a custom shortcode is added.
- `synced_block` should resolve to the synced content when available or fail visibly.
- `embed` blocks should become explicit links unless the site has a safe render hook for that provider.

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
2. Add a Notion fetcher behind a content source config while keeping the current private repo fetcher as fallback.
3. Test with one Notion smoke post that includes a normal image and an equation.
4. Add KaTeX or MathJax support to Hugo and verify rendered math.
5. Switch GitHub Actions to the Notion source with manual dispatch and cron polling.
6. Verify production home, category page, post page, reactions, Giscus comments, images, and equations in the browser.
7. Mark `yskim-blog-private` as archive or fallback-only once Notion is stable.

## Needed before implementation

- Notion integration token stored as a GitHub Actions secret.
- Notion database id.
- Exact database property names for status, slug, category, tags, summary, cover, canonical, and comments.
