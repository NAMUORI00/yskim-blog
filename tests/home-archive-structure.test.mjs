import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) =>
  access(new URL(`../${path}`, import.meta.url)).then(
    () => true,
    () => false,
  );

test("home is a portfolio-style intro plus sections derived from published posts", async () => {
  const home = await read("src/pages/index.astro");

  assert.match(home, /<section class="home-intro" aria-labelledby="home-title">/);
  assert.match(home, /<p class="eyebrow">NAMUORI\.LOG<\/p>/);
  assert.match(home, /<h1 id="home-title">\{heroTitle\}<\/h1>/);
  assert.match(home, /const HomeContent = homePage \? \(await render\(homePage\)\)\.Content : null/);
  assert.match(home, /<PostList posts=\{recent\} level=\{3\} \/>/);
  assert.match(home, /categoryTags\(taxonomy, category\.id\)/);
  assert.doesNotMatch(home, /readme-card|filebar|data-window-action|home-grove|garden\.motion/);
});

test("archive, category, and tag lists paginate as real pages with page one at the old URL", async () => {
  for (const path of [
    "src/pages/posts/index.astro",
    "src/pages/posts/page/[page].astro",
    "src/pages/categories/[category].astro",
    "src/pages/categories/[category]/page/[page].astro",
    "src/pages/tags/[tag].astro",
    "src/pages/tags/[tag]/page/[page].astro",
  ]) {
    assert.ok(await exists(path), `missing ${path}`);
  }
  const [postsIndex, postsPage, category, tagPage] = await Promise.all([
    read("src/pages/posts/index.astro"),
    read("src/pages/posts/page/[page].astro"),
    read("src/pages/categories/[category].astro"),
    read("src/pages/tags/[tag]/page/[page].astro"),
  ]);

  assert.match(postsIndex, /paginate\(taxonomy\.posts\)/);
  assert.match(postsIndex, /base="\/posts\/"/);
  assert.match(postsIndex, /page=\{1\}/);
  assert.match(postsPage, /pages\.slice\(1\)/);
  assert.match(postsPage, /String\(index \+ 2\)/);
  assert.match(category, /params: \{ category: category\.slug \}/);
  assert.match(category, /\.filter\(\(category\) => category\.url\)/);
  assert.match(tagPage, /params: \{ tag: tag\.slug, page: String\(index \+ 2\) \}/);
});

test("pagination is plain links with the current page marked", async () => {
  const pagination = await read("src/components/Pagination.astro");

  assert.match(pagination, /\{pages > 1 && \(/);
  assert.match(pagination, /aria-current="page"/);
  assert.match(pagination, /rel="prev"/);
  assert.match(pagination, /rel="next"/);
  assert.match(pagination, /pageHref\(base, number\)/);
  assert.match(pagination, /aria-label=\{`\$\{label\} 페이지`\}/);
});

test("post rows link the title, category, and tags separately and cap tags at six", async () => {
  const card = await read("src/components/PostCard.astro");

  assert.match(card, /<article class=\{`post-card/);
  assert.match(card, /<a class="post-card-link" href=\{post\.url\}>\{post\.title\}<\/a>/);
  assert.match(card, /<a class="post-card-category" href=\{post\.category\.url\}>/);
  assert.match(card, /post\.tags\.slice\(0, 6\)/);
  assert.match(card, /<li><a href=\{tag\.url\}>\{tag\.label\}<\/a><\/li>/);
});

test("search keeps the same client index and query parameter", async () => {
  const search = await read("src/pages/search.astro");

  assert.match(search, /data-search-input/);
  assert.match(search, /slug: post\.data\.slug/);
  assert.match(search, /item\.slug/);
  assert.match(search, /params\.get\("q"\)/);
  assert.match(search, /index instanceof HTMLTemplateElement \? index\.content\.textContent : index\.textContent/);
});

test("site css lays out the home intro, post rows, facets, and pagination", async () => {
  const css = await read("static/css/site.css");

  for (const selector of [".home-intro", ".category-overview", ".post-list", ".post-card-link::after", ".facet-list", ".pagination", ".pagination__page.is-active", ".page-head"]) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
  assert.match(css, /\.home-intro h1\s*\{[^}]*font-family:\s*var\(--font-sans\)/s);
  assert.doesNotMatch(css, /filebar|readme-card|grove-|archive-window|has-window-drag-mode/);
});
