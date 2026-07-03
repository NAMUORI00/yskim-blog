import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  pkg: new URL("../package.json", import.meta.url),
  scene: new URL("../src/components/BlogGraphScene.svelte", import.meta.url),
  graph: new URL("../src/components/KnowledgeGraph.astro", import.meta.url),
  post: new URL("../src/pages/posts/[slug].astro", import.meta.url),
  home: new URL("../src/pages/index.astro", import.meta.url),
  css: new URL("../static/css/site.css", import.meta.url),
};

test("three is a runtime dependency and the scene imports it lazily", async () => {
  const pkg = JSON.parse(await readFile(files.pkg, "utf8"));
  const scene = await readFile(files.scene, "utf8");

  assert.equal(typeof pkg.dependencies.three, "string");
  assert.match(scene, /await import\("three"\)/);
  assert.match(scene, /prefers-reduced-motion:\s*reduce/);
  assert.match(scene, /yskim:theme-change/);
});

test("3d scene pauses when inactive and cleans up resources", async () => {
  const scene = await readFile(files.scene, "utf8");

  assert.match(scene, /IntersectionObserver/);
  assert.match(scene, /visibilitychange/);
  assert.match(scene, /cancelAnimationFrame/);
  assert.match(scene, /renderer\.dispose\(\)/);
  assert.match(scene, /child\.geometry\.dispose\(\)/);
  assert.match(scene, /disposeMaterial/);
  assert.doesNotMatch(scene, /canvas\.addEventListener\("click"/);
});

test("knowledge graph keeps the 2d canvas fallback while adding the 3d island", async () => {
  const graph = await readFile(files.graph, "utf8");

  assert.match(graph, /<BlogGraphScene/);
  assert.match(graph, /client:visible/);
  assert.match(graph, /class="knowledge-graph-canvas"/);
  assert.match(graph, /<template class="knowledge-graph-data">/);
});

test("post detail keeps Notion rendering, reactions, comments, and affiliate disclosure", async () => {
  const post = await readFile(files.post, "utf8");

  assert.match(post, /import \{ render \} from "astro:content"/);
  assert.match(post, /const \{ Content \} = await render\(entry\)/);
  assert.match(post, /<Reactions path=\{`\/posts\/\$\{d\.slug\}\/`\} \/>/);
  assert.match(post, /<Comments \/>/);
  assert.match(post, /<AffiliateDisclosure \/>/);
});

test("home still renders Notion about content and recent posts", async () => {
  const home = await readFile(files.home, "utf8");

  assert.match(home, /getCollection\("pages"/);
  assert.match(home, /findPage\("home"\)/);
  assert.match(home, /findPage\("readme"\) \?\? findPage\("about"\)/);
  assert.match(home, /await render\(readmePage\)/);
  assert.match(home, /getPublishedPosts\(\)/);
  assert.match(home, /<PostCard/);
});

test("css defines stable scene dimensions and fallback layering", async () => {
  const css = await readFile(files.css, "utf8");

  assert.match(css, /\.knowledge-scene/);
  assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /\.knowledge-scene\s*\{[^}]*z-index:\s*1/s);
  assert.match(css, /\.knowledge-scene\s*\{[^}]*pointer-events:\s*none/s);
  assert.match(css, /\.knowledge-scene__canvas/);
  assert.match(css, /\.knowledge-graph-canvas/);
  assert.match(css, /\.knowledge-graph-canvas\s*\{[^}]*z-index:\s*2/s);
});
