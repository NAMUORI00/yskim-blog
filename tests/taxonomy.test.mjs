import test from "node:test";
import assert from "node:assert/strict";

import {
  adjacentPosts,
  buildTaxonomy,
  categoryTags,
  cleanTerms,
  extractPostLinks,
  pageHref,
  paginate,
  POSTS_PER_PAGE,
  relatedPosts,
  slugifyTerm,
  UNCATEGORIZED_ID,
} from "../src/lib/taxonomy.mjs";

function entry(slug, { date = "2026-01-01", categories = ["노트"], tags = [], draft = false, body = "", title = slug, notion_id } = {}) {
  return { id: `${slug}.md`, body, data: { slug, title, date: new Date(date), draft, categories, tags, summary: `${title} 요약`, cover: "", notion_id } };
}

test("slugs keep the existing URL rule (lowercase, whitespace to dashes)", () => {
  assert.equal(slugifyTerm("연구 노트"), "연구-노트");
  assert.equal(slugifyTerm("Design"), "design");
  assert.equal(slugifyTerm("  Astro  Blog "), "astro-blog");
});

test("cleanTerms drops empty values and merges variants that share a URL", () => {
  assert.deepEqual(cleanTerms(["Design", "design", " design ", "", "   ", null, "UX"]), [
    { slug: "design", label: "Design" },
    { slug: "ux", label: "UX" },
  ]);
});

test("drafts never reach the taxonomy, even when the collection query lets them through", () => {
  const taxonomy = buildTaxonomy([
    entry("public", { tags: ["shared"], date: "2026-02-01" }),
    entry("secret", { tags: ["hidden-topic"], categories: ["비공개"], draft: true }),
  ]);

  assert.deepEqual(taxonomy.posts.map((post) => post.slug), ["public"]);
  assert.equal(taxonomy.tagById.has("hidden-topic"), false);
  assert.equal(taxonomy.categoryById.has("비공개"), false);
});

test("duplicate tags across posts become one topic with the newest post's label", () => {
  const taxonomy = buildTaxonomy([
    entry("old", { tags: ["design"], date: "2026-01-01" }),
    entry("new", { tags: ["Design", "Design"], date: "2026-03-01" }),
    entry("mid", { tags: [" design", "Astro"], date: "2026-02-01" }),
  ]);
  const design = taxonomy.tagById.get("design");

  assert.equal(taxonomy.tags.filter((tag) => tag.slug === "design").length, 1);
  assert.equal(design.label, "Design");
  assert.equal(design.url, "/tags/design/");
  assert.deepEqual(design.posts, ["new", "mid", "old"]);
  assert.equal(design.count, 3);
  assert.deepEqual(taxonomy.bySlug.get("new").tagIds, ["design"]);
});

test("posts without a category are grouped without inventing a category page", () => {
  const taxonomy = buildTaxonomy([entry("loose", { categories: [], tags: [] }), entry("filed", { categories: ["운영 노트"] })]);
  const loose = taxonomy.categoryById.get(UNCATEGORIZED_ID);

  assert.deepEqual(taxonomy.bySlug.get("loose").categoryIds, [UNCATEGORIZED_ID]);
  assert.equal(loose.url, null);
  assert.equal(loose.count, 1);
  assert.equal(taxonomy.categories.at(-1).id, UNCATEGORIZED_ID);
  assert.equal(taxonomy.categoryById.get("운영-노트").url, "/categories/운영-노트/");
});

test("body links to published posts become relations; drafts, self links, and other sites do not", () => {
  const taxonomy = buildTaxonomy(
    [
      entry("a", {
        body: [
          "[next](/posts/b/) and [encoded](/posts/2026%EB%85%84%206%EC%9B%94/)",
          "[self](/posts/a/) [draft](/posts/hidden/) [elsewhere](https://example.com/posts/b/)",
          '<a href="https://blog.namuori.net/posts/c/">absolute</a>',
          "[mention](https://www.notion.so/Some-page-0123456789abcdef0123456789abcdef)",
        ].join("\n"),
      }),
      entry("b"),
      entry("c"),
      entry("2026년 6월"),
      entry("d", { notion_id: "01234567-89ab-cdef-0123-456789abcdef" }),
      entry("hidden", { draft: true }),
    ],
    { siteUrl: "https://blog.namuori.net" },
  );

  assert.deepEqual(taxonomy.linksFrom.get("a").sort(), ["2026년 6월", "b", "c", "d"].sort());
  assert.deepEqual(taxonomy.linksTo.get("b"), ["a"]);
  assert.equal(taxonomy.links.some((link) => link.target === "a" || link.target === "hidden"), false);
});

test("extractPostLinks ignores plain text that only looks like a path", () => {
  const links = extractPostLinks("see /posts/b/ in the text", { slugs: new Set(["b"]) });
  assert.deepEqual(links, []);
});

test("extractPostLinks reads reference-style links and autolinks on this site", () => {
  const body = ["[ref]: /posts/b/", "<https://blog.namuori.net/posts/c/>", "[same](</posts/d/#section>)", "[query](/posts/e/?ref=1)"].join("\n");
  const links = extractPostLinks(body, { slugs: new Set(["b", "c", "d", "e"]), siteUrl: "https://blog.namuori.net" });

  assert.deepEqual(links.sort(), ["b", "c", "d", "e"]);
});

test("related posts come from shared tags, the category, and body links — with reasons", () => {
  const taxonomy = buildTaxonomy([
    entry("current", { tags: ["astro", "notion"], categories: ["개발"], date: "2026-05-01", body: "[see](/posts/linked/)" }),
    entry("two-tags", { tags: ["astro", "notion"], categories: ["일기"], date: "2026-04-01" }),
    entry("same-category", { tags: ["etc"], categories: ["개발"], date: "2026-03-01" }),
    entry("linked", { tags: ["other"], categories: ["일기"], date: "2026-02-01" }),
    entry("unrelated", { tags: ["zzz"], categories: ["일기"], date: "2026-01-01" }),
  ]);
  const related = relatedPosts(taxonomy, "current", { limit: 4 });

  assert.deepEqual(related.map((item) => item.post.slug), ["two-tags", "linked", "same-category"]);
  assert.deepEqual(related[0].sharedTags.map((tag) => tag.slug), ["astro", "notion"]);
  assert.equal(related[1].linked, "to");
  assert.equal(related[2].sameCategory, true);
  assert.equal(related.some((item) => item.post.slug === "unrelated"), false);
});

test("uncategorized posts are not related to each other by category alone", () => {
  const taxonomy = buildTaxonomy([entry("x", { categories: [] }), entry("y", { categories: [] })]);
  assert.deepEqual(relatedPosts(taxonomy, "x"), []);
});

test("adjacent posts follow publishing order", () => {
  const taxonomy = buildTaxonomy([entry("first", { date: "2026-01-01" }), entry("second", { date: "2026-02-01" }), entry("third", { date: "2026-03-01" })]);

  assert.deepEqual(
    Object.fromEntries(Object.entries(adjacentPosts(taxonomy, "second")).map(([key, post]) => [key, post?.slug ?? null])),
    { newer: "third", older: "first" },
  );
  assert.equal(adjacentPosts(taxonomy, "third").newer, null);
});

test("category topics are counted per category", () => {
  const taxonomy = buildTaxonomy([
    entry("a", { categories: ["개발"], tags: ["astro", "css"] }),
    entry("b", { categories: ["개발"], tags: ["astro"] }),
    entry("c", { categories: ["일기"], tags: ["astro"] }),
  ]);

  assert.deepEqual(categoryTags(taxonomy, "개발").map(({ tag, count }) => [tag.slug, count]), [
    ["astro", 2],
    ["css", 1],
  ]);
});

test("pagination keeps five posts per page and page one at the list URL", () => {
  const pages = paginate(Array.from({ length: 12 }, (_, index) => index));

  assert.equal(POSTS_PER_PAGE, 5);
  assert.deepEqual(pages.map((page) => page.length), [5, 5, 2]);
  assert.deepEqual(paginate([]), [[]]);
  assert.equal(pageHref("/posts/", 1), "/posts/");
  assert.equal(pageHref("/posts/", 3), "/posts/page/3/");
  assert.equal(pageHref("/tags/astro/", 2), "/tags/astro/page/2/");
});
