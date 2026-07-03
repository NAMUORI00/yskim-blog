import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  pkg: new URL("../package.json", import.meta.url),
  graph: new URL("../src/components/KnowledgeGraph.astro", import.meta.url),
  graphScript: new URL("../static/js/knowledge-graph.js", import.meta.url),
  post: new URL("../src/pages/posts/[slug].astro", import.meta.url),
  home: new URL("../src/pages/index.astro", import.meta.url),
  css: new URL("../static/css/site.css", import.meta.url),
};

test("knowledge graph no longer ships the three.js scene dependency", async () => {
  const pkg = JSON.parse(await readFile(files.pkg, "utf8"));

  assert.equal(pkg.dependencies.three, undefined);
});

test("knowledge graph keeps only data-backed nodes and edges with pointer focus animation", async () => {
  const script = await readFile(files.graphScript, "utf8");

  assert.match(script, /const nodes = rawNodes\.map/);
  assert.match(script, /const links = \(data\.links \|\| \[\]\)/);
  assert.match(script, /pointerInfluence/);
  assert.match(script, /animateFocus/);
  assert.doesNotMatch(script, /createRadialGradient|twinkle|lineDashOffset|orbit|grid/);
});

test("knowledge graph renders the 2d canvas without a 3d island", async () => {
  const graph = await readFile(files.graph, "utf8");

  assert.doesNotMatch(graph, /BlogGraphScene|client:visible/);
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

  assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.doesNotMatch(css, /\.knowledge-scene/);
  assert.match(css, /\.knowledge-graph-canvas/);
  assert.match(css, /\.knowledge-graph-canvas\s*\{[^}]*touch-action:\s*pan-y/s);
});
