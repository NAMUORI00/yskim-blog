import test from "node:test";
import assert from "node:assert/strict";

import { buildKnowledgeGraph, createVisualGraphSubset } from "../src/lib/knowledge-graph-data.mjs";

const postUrl = (slug) => `/posts/${slug}/`;
const categoryUrl = (category) => `/categories/${category.toLowerCase()}/`;
const tagUrl = (tag) => `/tags/${tag.toLowerCase()}/`;
const slugifyTerm = (term) => term.toLowerCase().replaceAll(" ", "-");

function post(slug, title, tags, categories = ["일상"]) {
  return {
    data: {
      slug,
      title,
      categories,
      tags,
    },
  };
}

test("buildKnowledgeGraph creates root, category, post, and tag nodes with stable links", () => {
  const graph = buildKnowledgeGraph({
    posts: [
      post("first", "First Post", ["Astro", "Design"]),
      post("second", "Second Post", ["Design"]),
    ],
    handle: "@namuori",
    currentSlug: "second",
    postUrl,
    categoryUrl,
    tagUrl,
    slugifyTerm,
  });

  assert.deepEqual(graph.nodes.map((node) => node.id), [
    "profile:namuori",
    "category:일상",
    "post:first",
    "tag:astro",
    "tag:design",
    "post:second",
  ]);
  assert.equal(graph.nodes.find((node) => node.id === "post:second").active, true);
  assert.deepEqual(graph.links, [
    { source: "profile:namuori", target: "category:일상" },
    { source: "category:일상", target: "post:first" },
    { source: "post:first", target: "tag:astro" },
    { source: "post:first", target: "tag:design" },
    { source: "category:일상", target: "post:second" },
    { source: "post:second", target: "tag:design" },
  ]);
});

test("buildKnowledgeGraph normalizes missing or blank handles to a stable profile node", () => {
  for (const handle of [undefined, "", "@"]) {
    const graph = buildKnowledgeGraph({
      posts: [],
      handle,
      currentSlug: undefined,
      postUrl,
      categoryUrl,
      tagUrl,
      slugifyTerm,
    });

    assert.deepEqual(graph.nodes[0], {
      id: "profile:namuori",
      label: "@namuori",
      type: "main",
      url: "/",
    });
  }
});

test("buildKnowledgeGraph keeps explicit handle labels while normalizing root ids", () => {
  const graph = buildKnowledgeGraph({
    posts: [],
    handle: "@namuori",
    currentSlug: undefined,
    postUrl,
    categoryUrl,
    tagUrl,
    slugifyTerm,
  });

  assert.deepEqual(graph.nodes[0], {
    id: "profile:namuori",
    label: "@namuori",
    type: "main",
    url: "/",
  });
});

test("buildKnowledgeGraph deduplicates repeated tag links on a post", () => {
  const graph = buildKnowledgeGraph({
    posts: [post("first", "First Post", ["Design", "design", "Design"])],
    handle: "@namuori",
    currentSlug: undefined,
    postUrl,
    categoryUrl,
    tagUrl,
    slugifyTerm,
  });

  assert.deepEqual(graph.nodes.map((node) => node.id), ["profile:namuori", "category:일상", "post:first", "tag:design"]);
  assert.deepEqual(graph.links, [
    { source: "profile:namuori", target: "category:일상" },
    { source: "category:일상", target: "post:first" },
    { source: "post:first", target: "tag:design" },
  ]);
});

test("createVisualGraphSubset keeps root, active category, active post, and connected tags", () => {
  const posts = Array.from({ length: 80 }, (_, index) =>
    post(`post-${index}`, `Post ${index}`, [`tag ${index}`, "shared"]),
  );
  const graph = buildKnowledgeGraph({
    posts,
    handle: "@namuori",
    currentSlug: "post-42",
    postUrl,
    categoryUrl,
    tagUrl,
    slugifyTerm,
  });

  const subset = createVisualGraphSubset(graph, { maxNodes: 40 });
  const ids = new Set(subset.nodes.map((node) => node.id));

  assert.equal(subset.nodes.length <= 40, true);
  assert.equal(ids.has("profile:namuori"), true);
  assert.equal(ids.has("category:일상"), true);
  assert.equal(ids.has("post:post-42"), true);
  assert.equal(ids.has("tag:tag-42"), true);
  assert.equal(ids.has("tag:shared"), true);
  assert.equal(subset.links.every((link) => ids.has(link.source) && ids.has(link.target)), true);
});

test("createVisualGraphSubset treats root, active category, and active post as protected when cap is too small", () => {
  const graph = buildKnowledgeGraph({
    posts: [post("active", "Active Post", ["alpha", "beta", "gamma"])],
    handle: "@namuori",
    currentSlug: "active",
    postUrl,
    categoryUrl,
    tagUrl,
    slugifyTerm,
  });

  const subset = createVisualGraphSubset(graph, { maxNodes: 1 });

  assert.deepEqual(subset.nodes.map((node) => node.id), ["profile:namuori", "category:일상", "post:active"]);
  assert.deepEqual(subset.links, [
    { source: "profile:namuori", target: "category:일상" },
    { source: "category:일상", target: "post:active" },
  ]);
});

test("createVisualGraphSubset hard-caps active posts with many connected tags", () => {
  const activeTags = ["zeta", "shared", "alpha", "beta", "gamma", "delta"];
  const graph = buildKnowledgeGraph({
    posts: [
      post("active", "Active Post", activeTags),
      ...Array.from({ length: 6 }, (_, index) => post(`related-${index}`, `Related ${index}`, ["shared"])),
    ],
    handle: "@namuori",
    currentSlug: "active",
    postUrl,
    categoryUrl,
    tagUrl,
    slugifyTerm,
  });

  const subset = createVisualGraphSubset(graph, { maxNodes: 4 });
  const ids = new Set(subset.nodes.map((node) => node.id));

  assert.equal(subset.nodes.length, 4);
  assert.equal(ids.has("profile:namuori"), true);
  assert.equal(ids.has("category:일상"), true);
  assert.equal(ids.has("post:active"), true);
  assert.equal(ids.has("tag:shared"), true);
  assert.equal(subset.links.every((link) => ids.has(link.source) && ids.has(link.target)), true);
});

test("createVisualGraphSubset caps graph without an active post", () => {
  const graph = buildKnowledgeGraph({
    posts: Array.from({ length: 30 }, (_, index) => post(`post-${index}`, `Post ${index}`, [`tag ${index}`])),
    handle: "@namuori",
    currentSlug: undefined,
    postUrl,
    categoryUrl,
    tagUrl,
    slugifyTerm,
  });

  const subset = createVisualGraphSubset(graph, { maxNodes: 10 });
  const ids = new Set(subset.nodes.map((node) => node.id));

  assert.equal(subset.nodes.length, 10);
  assert.equal(ids.has("profile:namuori"), true);
  assert.equal(subset.links.every((link) => ids.has(link.source) && ids.has(link.target)), true);
});
