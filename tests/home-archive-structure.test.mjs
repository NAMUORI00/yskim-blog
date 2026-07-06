import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  home: new URL("../src/pages/index.astro", import.meta.url),
  posts: new URL("../src/pages/posts/index.astro", import.meta.url),
  category: new URL("../src/pages/categories/[category].astro", import.meta.url),
  tag: new URL("../src/pages/tags/[tag].astro", import.meta.url),
  postCard: new URL("../src/components/PostCard.astro", import.meta.url),
  postListWindow: new URL("../src/components/PostListWindow.astro", import.meta.url),
  search: new URL("../src/pages/search.astro", import.meta.url),
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

test("home page renders one Notion-managed intro without readme or recent posts", async () => {
  const home = await readFile(files.home, "utf8");

  assert.match(home, /<section class="home-hero" aria-labelledby="home-title">/);
  assert.match(home, /<article class="readme-card home-intro-window" aria-label="나무가든 소개" data-content-window>/);
  assert.match(home, /class="filebar home-intro-window__bar"/);
  assert.doesNotMatch(home, /data-window-action="move"/);
  assert.doesNotMatch(home, /filebar-control--move/);
  assert.match(home, /<p class="eyebrow">NAMUORI\.LOG<\/p>/);
  assert.match(home, /const homePage = findPage\("home"\)/);
  assert.match(home, /const HomeContent = homePage \? \(await render\(homePage\)\)\.Content : null/);
  assert.match(home, /<h1 id="home-title">\{heroTitle\}<\/h1>/);
  assert.doesNotMatch(home, /homeSource|home-hero__metrics|<dt>Source<\/dt>|<dt>Pages<\/dt>|<dt>Categories<\/dt>/);
  assert.match(home, /<aside class="readme-card home-grove-window" aria-label="나무 애니메이션 창" data-content-window>/);
  assert.match(home, /class="filebar home-grove-window__bar"/);
  assert.match(home, /<strong>garden\.motion<\/strong>/);
  assert.match(home, /<div class="home-hero__grove" aria-hidden="true">/);
  assert.match(home, /class="grove-leaf grove-leaf--float grove-leaf--drift-four"/);
  assert.doesNotMatch(home, /readmePage|ReadmeContent|home-readme/);
  assert.doesNotMatch(home, /Recent Notes|post-feed--home|<PostCard|getPublishedPosts/);
});

test("archive pages render post lists inside content-window controls", async () => {
  const [posts, category, tag, postListWindow, search] = await Promise.all([
    readFile(files.posts, "utf8"),
    readFile(files.category, "utf8"),
    readFile(files.tag, "utf8"),
    readFile(files.postListWindow, "utf8"),
    readFile(files.search, "utf8"),
  ]);

  assert.match(posts, /<PostListWindow label="아카이브" title=\{UI\.allPosts\} posts=\{posts\} \/>/);
  assert.doesNotMatch(posts, /archive-heading|page-header-count|<header/);
  assert.match(category, /<PostListWindow label="카테고리" title=\{name\} posts=\{posts\} \/>/);
  assert.doesNotMatch(category, /archive-heading|<header/);
  assert.match(tag, /<PostListWindow label="태그" title=\{name\} posts=\{posts\} \/>/);
  assert.doesNotMatch(tag, /archive-heading|<header/);
  assert.match(postListWindow, /<article class="readme-card archive-window" aria-label=\{`\$\{label\}: \$\{title\}`\} data-content-window>/);
  assert.match(postListWindow, /<strong>\{label\}: \{title\}<\/strong>/);
  assert.match(postListWindow, /data-window-action="close"/);
  assert.match(postListWindow, /data-window-action="minimize"/);
  assert.match(postListWindow, /data-window-action="maximize"/);
  assert.match(postListWindow, /posts\.map\(\(p\) =>/);
  assert.match(search, /class="readme-card search-window"/);
  assert.match(search, /data-search-input/);
  assert.match(search, /slug: post\.data\.slug/);
  assert.match(search, /item\.slug/);
  assert.match(search, /index instanceof HTMLTemplateElement \? index\.content\.textContent : index\.textContent/);
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
  assert.match(homeHeroRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(150px,\s*220px\)/);
  assert.match(homeHeroRule, /gap:\s*var\(--space-4\)/);
  assert.match(homeHeroRule, /min-height:\s*clamp\(280px,\s*38vh,\s*420px\)/);
  assert.match(homeHeroRule, /align-items:\s*start/);
  assert.match(homeHeroRule, /overflow:\s*hidden/);
  assert.match(homeHeroRule, /background:\s*transparent/);
  assert.match(ruleContaining(css, "body.has-window-drag-mode .home-hero"), /overflow:\s*visible/);
  assert.doesNotMatch(homeHeroRule, /radial-gradient/);
  assert.match(homeHeroTitleRule, /font-size:\s*2\.2rem/);
  assert.match(homeHeroTitleRule, /font-family:\s*var\(--font-sans\)/);
  assert.doesNotMatch(homeHeroTitleRule, /vw|clamp\(/);
  assert.match(ruleContaining(css, ".home-hero__copy"), /max-width:\s*var\(--content-width\)/);
  assert.match(ruleContaining(css, ".home-intro-window"), /margin-bottom:\s*0/);
  assert.match(ruleContaining(css, ".home-intro-window"), /align-self:\s*start/);
  assert.match(ruleContaining(css, ".home-grove-window"), /align-self:\s*start/);
  assert.doesNotMatch(ruleContaining(css, ".home-grove-window"), /grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
  assert.match(ruleContaining(css, ".home-grove-window"), /padding:\s*0/);
  assert.match(ruleContaining(css, ".home-grove-window__body"), /display:\s*grid/);
  assert.match(ruleContaining(css, ".home-grove-window__body"), /min-height:\s*0/);
  assert.match(ruleContaining(css, ".home-grove-window__body"), /padding:\s*var\(--space-4\)\s*var\(--space-3\)/);
  assert.match(ruleContaining(css, ".home-hero__grove"), /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /\.grove-trunk\s*\{[^}]*background:\s*linear-gradient\(180deg,\s*var\(--accent-light\),\s*var\(--accent-strong\)\)/s);
  assert.match(css, /\.grove-leaf\s*\{[^}]*border-radius:\s*100% 0 100% 0/s);
  assert.match(ruleContaining(css, ".archive-window__bar"), /min-height:\s*32px/);
  assert.doesNotMatch(ruleContaining(css, ".filebar strong"), /text-overflow:\s*ellipsis|white-space:\s*nowrap/);
  assert.match(ruleContaining(css, ".filebar strong"), /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.archive-window__feed\s*\{[^}]*padding:\s*var\(--space-4\)/s);
  assert.match(css, /\.search-panel\s*\{[^}]*display:\s*grid/s);
  assert.doesNotMatch(css, /home-readme__|signal-orbit|archive-heading|home-hero__metrics/);
  assert.match(mediaBlock(css, "@media (max-width: 1200px)"), /\.home-hero h1\s*\{[\s\S]*?font-size:\s*1\.9rem/s);
  assert.match(mediaBlock(css, "@media (max-width: 900px)"), /\.home-hero h1\s*\{[\s\S]*?font-size:\s*1\.7rem/s);
  assert.match(mediaBlock(css, "@media (max-width: 600px)"), /\.home-hero h1\s*\{[\s\S]*?font-size:\s*1\.55rem/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.home-hero\s*\{[\s\S]*?grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.home-grove-window\s*\{[\s\S]*?max-width:\s*260px/s);
});
