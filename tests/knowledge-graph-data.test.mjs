import test from "node:test";
import assert from "node:assert/strict";

import { buildKnowledgeGraph, createVisualGraphSubset } from "../src/lib/knowledge-graph-data.mjs";

const postUrl = (slug) => `/posts/${slug}/`;
const tagUrl = (tag) => `/tags/${tag.toLowerCase()}/`;
const slugifyTerm = (term) => term.toLowerCase().replaceAll(" ", "-");

function post(slug, title, tags) {
  return {
    data: {
      slug,
      title,
      tags,
    },
  };
}

test("buildKnowledgeGraph creates root, post, and tag nodes with stable links", () => {
  const graph = buildKnowledgeGraph({
    posts: [
      post("first", "First Post", ["Astro", "Design"]),
      post("second", "Second Post", ["Design"]),
    ],
    handle: "@namuori",
    currentSlug: "second",
    postUrl,
    tagUrl,
    slugifyTerm,
  });

  assert.deepEqual(graph.nodes.map((node) => node.id), [
    "profile:namuori",
    "post:first",
    "tag:astro",
    "tag:design",
    "post:second",
  ]);
  assert.equal(graph.nodes.find((node) => node.id === "post:second").active, true);
  assert.deepEqual(graph.links, [
    { source: "profile:namuori", target: "post:first" },
    { source: "post:first", target: "tag:astro" },
    { source: "post:first", target: "tag:design" },
    { source: "profile:namuori", target: "post:second" },
    { source: "post:second", target: "tag:design" },
  ]);
});

test("createVisualGraphSubset keeps root, active post, and connected tags", () => {
  const posts = Array.from({ length: 80 }, (_, index) =>
    post(`post-${index}`, `Post ${index}`, [`tag ${index}`, "shared"]),
  );
  const graph = buildKnowledgeGraph({
    posts,
    handle: "@namuori",
    currentSlug: "post-42",
    postUrl,
    tagUrl,
    slugifyTerm,
  });

  const subset = createVisualGraphSubset(graph, { maxNodes: 40 });
  const ids = new Set(subset.nodes.map((node) => node.id));

  assert.equal(subset.nodes.length <= 40, true);
  assert.equal(ids.has("profile:namuori"), true);
  assert.equal(ids.has("post:post-42"), true);
  assert.equal(ids.has("tag:tag-42"), true);
  assert.equal(ids.has("tag:shared"), true);
  assert.equal(subset.links.every((link) => ids.has(link.source) && ids.has(link.target)), true);
});
