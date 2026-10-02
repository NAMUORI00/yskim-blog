import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("no 3D library: the globe is SVG + HTML drawn by the existing Svelte stack", async () => {
  const pkg = JSON.parse(await read("package.json"));

  assert.equal(pkg.dependencies.three, undefined);
  assert.equal(pkg.dependencies.react, undefined);
  assert.equal(typeof pkg.dependencies.svelte, "string");
});

test("post detail keeps Notion rendering, comments, math, and affiliate disclosure", async () => {
  const post = await read("src/pages/posts/[slug].astro");

  assert.match(post, /import \{ render \} from "astro:content"/);
  assert.match(post, /const \{ Content \} = await render\(entry\)/);
  assert.match(post, /<Content \/>/);
  assert.match(post, /\{d\.comments && <Comments \/>\}/);
  assert.match(post, /<AffiliateDisclosure \/>/);
  assert.match(post, /math=\{d\.math\}/);
  assert.match(post, /canonical=\{d\.canonical \|\| undefined\}/);
  assert.match(post, /breadcrumb=\{breadcrumb\}/);
  assert.doesNotMatch(post, /Reactions|<Reactions|reactions\.js|data-post-reactions/);
});

test("article view adds related posts and neighbours from the shared taxonomy", async () => {
  const [post, related] = await Promise.all([read("src/pages/posts/[slug].astro"), read("src/components/RelatedPosts.astro")]);

  assert.match(post, /relatedPosts\(taxonomy, d\.slug, \{ limit: 4 \}\)/);
  assert.match(post, /adjacentPosts\(taxonomy, d\.slug\)/);
  assert.match(post, /<RelatedPosts related=\{related\} newer=\{newer\} older=\{older\} \/>/);
  assert.match(related, /sharedTags/);
  assert.match(related, /같은 카테고리/);
  assert.match(related, /rel="prev"/);
  assert.match(related, /rel="next"/);
});

test("embed loader keeps Mermaid and Twitter widgets aligned with the active theme", async () => {
  const script = await read("static/js/embeds.js");

  assert.match(script, /mermaid@11/);
  assert.match(script, /pre\.mermaid:not\(\[data-processed\]\)/);
  assert.match(script, /twitterTheme/);
  assert.match(script, /prepareTweets/);
  assert.match(script, /yskim:theme-change/);
  assert.match(script, /window\.twttr\.widgets\.load/);
});

test("home keeps the Notion intro as the only hand-managed home content", async () => {
  const home = await read("src/pages/index.astro");

  assert.match(home, /getCollection\("pages"/);
  assert.match(home, /findPage\("home"\)/);
  assert.match(home, /await render\(homePage\)/);
  assert.doesNotMatch(home, /findPage\("readme"\)|findPage\("about"\)/);
  assert.match(home, /getTaxonomy\(\)/);
  assert.match(home, /taxonomy\.posts\.slice\(0, 5\)/);
});

test("RSS, robots, sitemap, and SEO stay wired as before", async () => {
  const [rss, robots, base, seo, config] = await Promise.all([
    read("src/pages/index.xml.ts"),
    read("src/pages/robots.txt.ts"),
    read("src/layouts/Base.astro"),
    read("src/components/Seo.astro"),
    read("astro.config.mjs"),
  ]);

  assert.match(rss, /getPublishedPosts\(\)/);
  assert.match(rss, /link: postUrl\(post\.data\.slug\)/);
  assert.match(robots, /sitemap-index\.xml/);
  assert.match(base, /<Seo \{\.\.\.seo\} \/>/);
  assert.match(base, /rel="alternate" type="application\/rss\+xml"/);
  assert.match(seo, /application\/ld\+json/);
  assert.match(config, /trailingSlash: "always"/);
  assert.match(config, /sitemap\(\)/);
  assert.match(config, /rehypeKatex/);
});

test("comments keep the giscus provider and theme sync", async () => {
  const [comments, theme] = await Promise.all([read("src/components/Comments.astro"), read("static/js/theme.js")]);

  assert.match(comments, /giscus\.app\/client\.js/);
  assert.match(comments, /data-mapping=\{g\.mapping\}/);
  assert.match(theme, /syncGiscusTheme/);
  assert.match(theme, /yskim:theme-change/);
});

test("the old window chrome and 2D canvas graph are gone from every template", async () => {
  const files = [
    "src/layouts/Base.astro",
    "src/pages/index.astro",
    "src/pages/posts/[slug].astro",
    "src/pages/pages/[slug].astro",
    "src/pages/search.astro",
    "src/components/ArchiveView.astro",
    "src/components/KnowledgeGraph.astro",
  ];
  for (const path of files) {
    const source = await read(path);
    assert.doesNotMatch(source, /data-window-action|filebar-control|data-content-window|window-controls\.js/, path);
    assert.doesNotMatch(source, /knowledge-graph\.js|knowledge-graph-canvas|garden\.motion|home-grove/, path);
  }
});

test("site css keeps every Notion block style the generator emits", async () => {
  const css = await read("static/css/site.css");

  for (const selector of [
    ".content figure.video-embed",
    ".content figure.video-file video",
    ".content figure.audio-file audio",
    ".content figure.pdf-embed",
    ".content .pdf-viewer-bar",
    ".content .file-attachment",
    ".content .bookmark-card",
    ".content figure.tweet-embed",
    ".content pre.mermaid",
    ".content .katex-display",
    ".content details",
    ".content .task-list-item",
    ".content table",
    ".content blockquote",
  ]) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
});
