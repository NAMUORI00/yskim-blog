import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  home: new URL("../src/pages/index.astro", import.meta.url),
  posts: new URL("../src/pages/posts/index.astro", import.meta.url),
  category: new URL("../src/pages/categories/[category].astro", import.meta.url),
  tag: new URL("../src/pages/tags/[tag].astro", import.meta.url),
  postCard: new URL("../src/components/PostCard.astro", import.meta.url),
  css: new URL("../static/css/site.css", import.meta.url),
};

function ruleContaining(css, selector) {
  const rules = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
  const rule = rules.find((candidate) => candidate.slice(0, candidate.indexOf("{")).includes(selector));
  assert.ok(rule, `Missing CSS rule containing ${selector}`);
  return rule;
}

function mediaBlock(css, query) {
  const start = css.indexOf(query);
  assert.ok(start >= 0, `Missing media block ${query}`);

  const open = css.indexOf("{", start);
  assert.ok(open >= 0, `Missing media block body for ${query}`);

  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }

  assert.fail(`Unclosed media block ${query}`);
}

test("home page separates the visual hero from conditional Notion about rendering", async () => {
  const home = await readFile(files.home, "utf8");

  assert.match(home, /<section class="home-hero" aria-labelledby="home-title">/);
  assert.match(home, /<p class="eyebrow">NAMUORI\.LOG<\/p>/);
  assert.match(home, /const homePage = findPage\("home"\)/);
  assert.match(home, /const readmePage = findPage\("readme"\) \?\? findPage\("about"\)/);
  assert.match(home, /<h1 id="home-title">\{heroTitle\}<\/h1>/);
  assert.match(home, /class="home-hero__metrics"/);
  assert.match(home, /<div class="home-hero__signal" aria-hidden="true">/);
  assert.match(home, /class="signal-node signal-node--tag"/);
  assert.match(home, /\{ReadmeContent && readmePage && \(\s*<article class="readme-card post home-readme"/s);
  assert.match(home, /<ReadmeContent \/>/);
  assert.match(home, /<p class="eyebrow">Recent Notes<\/p>/);
});

test("archive pages expose scannable heading metadata without changing feeds", async () => {
  const [posts, category, tag] = await Promise.all([
    readFile(files.posts, "utf8"),
    readFile(files.category, "utf8"),
    readFile(files.tag, "utf8"),
  ]);

  assert.match(posts, /<header class="page-heading archive-heading">/);
  assert.match(posts, /<p class="eyebrow">Archive<\/p>/);
  assert.match(posts, /<p class="page-header-count">\{posts\.length\} entries<\/p>/);
  assert.match(posts, /posts\.map\(\(p\) =>/);

  assert.match(category, /<header class="page-heading archive-heading">/);
  assert.match(category, /<p class="eyebrow">Category<\/p>/);
  assert.match(category, /<p>카테고리 · \{posts\.length\}개의 글<\/p>/);
  assert.match(category, /posts\.map\(\(p\) =>/);

  assert.match(tag, /<header class="page-heading archive-heading">/);
  assert.match(tag, /<p class="eyebrow">Tag<\/p>/);
  assert.match(tag, /<p>태그 · \{posts\.length\}개의 글<\/p>/);
  assert.match(tag, /posts\.map\(\(p\) =>/);
});

test("post cards cap visible tags while keeping the scanning body structure", async () => {
  const card = await readFile(files.postCard, "utf8");

  assert.match(card, /<div class="post-card-body">/);
  assert.match(card, /<div class="post-card-meta">/);
  assert.match(card, /<h2 class="post-card-title">\{title\}<\/h2>/);
  assert.match(card, /\{summary && <p class="post-card-summary">\{summary\}<\/p>\}/);
  assert.match(card, /tags\.slice\(0,\s*6\)\.map\(\(t\) => <li>\{t\}<\/li>\)/);
});

test("site css adds home hero and archive structure with tablet overrides", async () => {
  const css = await readFile(files.css, "utf8");
  const contentColumnIndex = css.indexOf(".content-column {");
  const heroIndex = css.indexOf(".home-hero {");
  const homeHeroRule = ruleContaining(css, ".home-hero");
  const homeHeroTitleRule = ruleContaining(css, ".home-hero h1");

  assert.ok(contentColumnIndex >= 0, "Missing content-column rule");
  assert.ok(heroIndex > contentColumnIndex, "Home hero styles should follow content-column");
  assert.match(homeHeroRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(180px,\s*280px\)/);
  assert.match(homeHeroRule, /min-height:\s*clamp\(320px,\s*48vh,\s*520px\)/);
  assert.match(homeHeroRule, /background:\s*var\(--panel\)/);
  assert.doesNotMatch(homeHeroRule, /radial-gradient/);
  assert.match(homeHeroTitleRule, /font-size:\s*3\.25rem/);
  assert.doesNotMatch(homeHeroTitleRule, /vw|clamp\(/);
  assert.match(ruleContaining(css, ".home-hero__copy"), /max-width:\s*var\(--content-width\)/);
  assert.match(ruleContaining(css, ".home-hero__metrics"), /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(ruleContaining(css, ".home-readme__header"), /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(180px,\s*240px\)/);
  assert.match(ruleContaining(css, ".signal-orbit"), /border-radius:\s*999px/);
  assert.match(ruleContaining(css, ".archive-heading"), /background:\s*var\(--panel\)/);
  assert.match(mediaBlock(css, "@media (max-width: 1200px)"), /\.home-hero h1\s*\{[\s\S]*?font-size:\s*2\.75rem/s);
  assert.match(mediaBlock(css, "@media (max-width: 900px)"), /\.home-hero h1\s*\{[\s\S]*?font-size:\s*2\.25rem/s);
  assert.match(mediaBlock(css, "@media (max-width: 600px)"), /\.home-hero h1\s*\{[\s\S]*?font-size:\s*1\.9rem/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.home-hero\s*\{[\s\S]*?grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.home-hero__signal\s*\{[\s\S]*?max-width:\s*220px/s);
});
