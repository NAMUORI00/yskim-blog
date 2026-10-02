import test from "node:test";
import assert from "node:assert/strict";

import { articleContext, buildBlogGraph, indexGraph, selectGlobeNodes, shortLabel } from "../src/lib/knowledge-graph-data.mjs";
import { buildKnowledgeMapPayload, parseKnowledgeMapPayload } from "../src/lib/graph/payload.mjs";
import { buildTaxonomy, UNCATEGORIZED_ID } from "../src/lib/taxonomy.mjs";

function entry(slug, { date = "2026-01-01", categories = ["노트"], tags = [], draft = false, body = "", title = slug } = {}) {
  return { id: slug, body, data: { slug, title, date: new Date(date), draft, categories, tags, summary: `${title} 요약` } };
}

function graphOf(entries, options) {
  return indexGraph(buildBlogGraph(buildTaxonomy(entries, options), { identity: { name: "KIM", handle: "@namuori" } }));
}

const sample = () => [
  entry("astro-notes", { categories: ["개발"], tags: ["Astro", "notion"], date: "2026-03-01", body: "[diary](/posts/diary/)" }),
  entry("css-notes", { categories: ["개발"], tags: ["astro", "css"], date: "2026-02-01" }),
  entry("diary", { categories: ["일기"], tags: ["notion", "일상"], date: "2026-01-01" }),
  entry("draft-idea", { categories: ["비밀"], tags: ["unreleased"], draft: true }),
];

test("categories become clusters with the real number of published posts", () => {
  const graph = graphOf(sample());

  assert.deepEqual(graph.domains.map((domain) => [domain.key, domain.label, domain.count]), [
    ["category:개발", "개발", 2],
    ["category:일기", "일기", 1],
  ]);
  assert.deepEqual(graph.domainById.get("개발").posts, ["post:astro-notes", "post:css-notes"]);
  assert.deepEqual(graph.domainById.get("개발").topics, ["topic:astro", "topic:css", "topic:notion"]);
  assert.equal(graph.identity.handle, "namuori");
});

test("posts and topics are the stars; edges are only tags and body links", () => {
  const graph = graphOf(sample());

  // Topics follow the tag list order (Korean collation: Hangul first).
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["post:astro-notes", "post:css-notes", "post:diary", "topic:일상", "topic:astro", "topic:css", "topic:notion"],
  );
  assert.deepEqual(
    graph.links.map((link) => `${link.relation}:${link.source}>${link.target}`),
    [
      "tagged:post:astro-notes>topic:astro",
      "tagged:post:astro-notes>topic:notion",
      "tagged:post:css-notes>topic:astro",
      "tagged:post:css-notes>topic:css",
      "tagged:post:diary>topic:notion",
      "tagged:post:diary>topic:일상",
      "linked:post:astro-notes>post:diary",
    ],
  );
});

test("drafts leave no star, topic, cluster, or link behind", () => {
  const graph = graphOf(sample());
  const payload = JSON.stringify(buildKnowledgeMapPayload(buildTaxonomy(sample()), {}));

  assert.equal(graph.byId.has("post:draft-idea"), false);
  assert.equal(graph.byId.has("topic:unreleased"), false);
  assert.equal(graph.domainById.has("비밀"), false);
  assert.doesNotMatch(payload, /draft-idea|unreleased|비밀/);
});

test("case and spacing variants of a tag are one topic with one edge per post", () => {
  const graph = graphOf([entry("one", { tags: ["Design", "design", " design "] }), entry("two", { tags: ["DESIGN"] })]);

  assert.deepEqual(graph.nodes.filter((node) => node.kind === "topic").map((node) => [node.id, node.label, node.count]), [["topic:design", "Design", 2]]);
  assert.equal(graph.links.filter((link) => link.source === "post:one").length, 1);
});

test("a topic sits with the category that uses it most, but keeps every category it appears in", () => {
  const graph = graphOf([
    entry("a", { categories: ["일기"], tags: ["notion"] }),
    entry("b", { categories: ["개발"], tags: ["notion"] }),
    entry("c", { categories: ["개발"], tags: ["notion"] }),
  ]);
  const notion = graph.byId.get("topic:notion");

  assert.equal(notion.domain, "개발");
  assert.deepEqual([...notion.categories].sort(), ["개발", "일기"]);
});

test("uncategorized posts get a cluster without a category page", () => {
  const graph = graphOf([entry("loose", { categories: [], tags: ["x"] })]);
  const domain = graph.domainById.get(UNCATEGORIZED_ID);

  assert.equal(domain.uncategorized, true);
  assert.equal(domain.url, null);
  assert.equal(graph.byId.get("post:loose").domain, UNCATEGORIZED_ID);
});

test("the current article's context comes from the same metadata as the map", () => {
  const graph = graphOf(sample());
  const context = articleContext(graph, "post:astro-notes");

  assert.equal(context.domain.label, "개발");
  assert.deepEqual(context.topics.map((topic) => topic.label), ["Astro", "notion"]);
  assert.deepEqual(context.linksOut.map((post) => post.id), ["post:diary"]);
  assert.deepEqual(context.linksIn, []);
  // A shared tag plus a body link outranks a shared tag plus the same category.
  assert.deepEqual(context.related.map((post) => post.id), ["post:diary", "post:css-notes"]);
  assert.equal(articleContext(graph, "topic:astro"), null);
  assert.equal(articleContext(graph, null), null);
});

test("large blogs keep the requested context first, then newest posts, then common topics", () => {
  const entries = Array.from({ length: 30 }, (_, index) =>
    entry(`post-${index}`, { date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(), tags: [`only-${index}`, "shared"] }),
  );
  const graph = graphOf(entries);
  const ids = selectGlobeNodes(graph, { maxNodes: 12, keep: ["post:post-0", "topic:only-0"] });

  assert.equal(ids.length, 12);
  assert.ok(ids.includes("post:post-0"));
  assert.ok(ids.includes("topic:only-0"));
  assert.ok(ids.includes("post:post-29"));
  assert.equal(selectGlobeNodes(graph, { maxNodes: 500 }).length, graph.nodes.length);
});

test("short labels keep the first clause and trim long titles", () => {
  assert.equal(shortLabel("Astro 블로그: 구조와 배포"), "Astro 블로그");
  assert.equal(Array.from(shortLabel("아주 긴 제목이 계속 이어지는 글의 이름입니다")).length, 16);
});

test("the payload round-trips with positions for every star and a plan per category, without post bodies", () => {
  const taxonomy = buildTaxonomy(sample());
  const json = JSON.parse(JSON.stringify(buildKnowledgeMapPayload(taxonomy, { identity: { name: "KIM", handle: "namuori" } })));
  const { graph, globe, floors } = parseKnowledgeMapPayload(json);

  assert.equal(graph.nodes.length, 7);
  for (const node of graph.nodes) assert.ok(globe.positions.has(node.id), `missing position for ${node.id}`);
  assert.deepEqual([...floors.keys()], ["개발", "일기"]);
  assert.ok(floors.get("개발").has("category:개발"));
  assert.equal(JSON.stringify(json).includes("[diary](/posts/diary/)"), false);
  assert.equal("body" in json.nodes[0], false);
});

test("publishing or unpublishing a post is the only change the map needs", () => {
  const before = graphOf(sample());
  const published = graphOf([...sample(), entry("rust-intro", { categories: ["언어"], tags: ["rust", "astro"], date: "2026-04-01" })]);

  assert.equal(published.domains.length, before.domains.length + 1);
  assert.equal(published.domainById.get("언어").count, 1);
  assert.ok(published.byId.has("topic:rust"));
  assert.equal(published.byId.get("topic:astro").count, before.byId.get("topic:astro").count + 1);
  assert.ok(published.links.some((link) => link.source === "post:rust-intro" && link.target === "topic:astro"));

  const unpublished = graphOf(sample().map((item) => (item.data.slug === "diary" ? { ...item, data: { ...item.data, draft: true } } : item)));
  assert.equal(unpublished.domainById.has("일기"), false, "a category with no published posts stayed");
  assert.equal(unpublished.byId.has("topic:일상"), false, "a topic only the draft used stayed");
  assert.equal(unpublished.byId.get("topic:notion").count, 1);
  assert.equal(unpublished.links.some((link) => link.target === "post:diary"), false, "a link to the unpublished post stayed");
});

test("an empty blog produces an empty, valid map", () => {
  const { graph, globe, floors } = parseKnowledgeMapPayload(JSON.parse(JSON.stringify(buildKnowledgeMapPayload(buildTaxonomy([]), {}))));

  assert.equal(graph.nodes.length, 0);
  assert.equal(graph.domains.length, 0);
  assert.equal(globe.positions.size, 0);
  assert.equal(floors.size, 0);
});
