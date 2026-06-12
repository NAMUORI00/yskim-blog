# Notion Publishing Workflow

This is the lightweight migration target for moving blog content management from Obsidian/private GitHub content to public Notion pages.

## Goal

Keep `yskim-blog` as the public Hugo and Cloudflare Pages repository. Replace only the content fetch layer so public Notion content becomes Hugo-ready Markdown before the existing validation, category path organization, Hugo build, comments, reactions, and deployment steps run.

## Repository roles

- `yskim-blog`: public site source, theme, build scripts, validation, Cloudflare Functions, deployment.
- `yskim-blog-private`: legacy content source during migration. After cutover, keep it only as an archive or temporary fallback.
- `hugo-git-publisher`: legacy Obsidian-to-Hugo publisher. It should not be required for the Notion publishing path.
- `obsidian-ide-ai-agent`: separate Obsidian AI workflow. It is not part of the Notion blog publishing path.

## Preferred Notion shape

Use one public Notion database or public index page as the source of published posts.

Each published post should provide these fields, either as database properties or clearly parseable page metadata:

- title
- slug
- date
- publish
- category
- tags
- summary
- cover
- canonical
- comments

The simplest stable version is a public Notion database with one row per post and the post body in the row page.

## Data flow

1. Fetch the configured Notion public page or database.
2. Convert published pages to Hugo Markdown under `content/posts`.
3. Download usable public images to `static/images/notion/<slug>/`.
4. Write `data/content-source.yaml` with `provider: notion`, source URL, and fetch time.
5. Run the existing category path organizer so posts become `content/posts/<category-slug>/<slug>.md`.
6. Run the existing content validation.
7. Build and deploy Hugo as before.

Public URLs should stay slug-based, for example `/posts/my-note/`.

## Validation rules

Keep the current Hugo-facing validation boundary:

- required frontmatter must exist;
- `comments` must be `true` or `false`;
- category and tag lists must be present;
- generated image references must point to files under `static/images`;
- source-only fields and unsupported Notion blocks should fail the build instead of silently rendering broken content.

The Obsidian-specific checks can remain during transition, but the long-term rule should become source-neutral: generated Markdown must be Hugo-ready.

## Rollout

1. Add a Notion fetcher behind a content source config while keeping the current private repo fetcher as fallback.
2. Test with one Notion smoke post that matches the existing smoke-test post shape.
3. Switch GitHub Actions to the Notion source.
4. Verify production home, category page, post page, reactions, and Giscus comments in the browser.
5. Mark `yskim-blog-private` and `hugo-git-publisher` as legacy for blog publishing once Notion is stable.

## Needed before implementation

- The public Notion source URL.
- Whether the source is a Notion database/table or a normal page with child links.
