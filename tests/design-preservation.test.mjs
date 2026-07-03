import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  pkg: new URL("../package.json", import.meta.url),
  graph: new URL("../src/components/KnowledgeGraph.astro", import.meta.url),
  graphScript: new URL("../static/js/knowledge-graph.js", import.meta.url),
  embedsScript: new URL("../static/js/embeds.js", import.meta.url),
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
  assert.match(script, /hoverNode/);
  assert.match(script, /sphereVector/);
  assert.match(script, /rotateSphereVector/);
  assert.match(script, /setRotationTarget/);
  assert.match(script, /state\.targetRotationX/);
  assert.match(script, /state\.targetRotationY/);
  assert.match(script, /idleReturnTimer/);
  assert.match(script, /idleSpinPhase/);
  assert.match(script, /idlePoleBlend/);
  assert.match(script, /targetIdlePoleBlend/);
  assert.match(script, /rootNode/);
  assert.match(script, /scheduleIdleReturn/);
  assert.match(script, /state\.isIdlePoleView/);
  assert.match(script, /drawSphereWireframe/);
  assert.match(script, /drawNorthPoleWireframe/);
  assert.match(script, /polarSurfacePoint/);
  assert.match(script, /sphereDisplayPoint/);
  assert.match(script, /blendDisplayPoint/);
  assert.match(script, /lerp\(state\.idlePoleBlend,\s*state\.targetIdlePoleBlend/);
  assert.match(script, /cameraAboveNorthPole/);
  assert.match(script, /const longitude = baseAngle \+ state\.idleSpinPhase/);
  assert.match(script, /rootPole/);
  assert.match(script, /northPole/);
  assert.match(script, /wireframe/);
  assert.match(script, /latitude/);
  assert.match(script, /quadraticCurveTo/);
  assert.match(script, /const showLabel = state\.hoverNode\?\.id === node\.id/);
  assert.doesNotMatch(script, /const cancelIdleReturn = \(\) => \{[\s\S]*?state\.isIdlePoleView = false;[\s\S]*?\};/);
  assert.doesNotMatch(script, /const showLabel = node\.type === "main" \|\| node\.active/);
  assert.doesNotMatch(script, /createRadialGradient|twinkle|lineDashOffset|levelSpeed|grid/);
});

test("knowledge graph renders the 2d canvas without a 3d island", async () => {
  const graph = await readFile(files.graph, "utf8");

  assert.doesNotMatch(graph, /BlogGraphScene|client:visible/);
  assert.match(graph, /class="knowledge-graph-canvas"/);
  assert.match(graph, /<template class="knowledge-graph-data">/);
});

test("post detail keeps Notion rendering, comments, and affiliate disclosure without local-only reactions", async () => {
  const post = await readFile(files.post, "utf8");

  assert.match(post, /import \{ render \} from "astro:content"/);
  assert.match(post, /const \{ Content \} = await render\(entry\)/);
  assert.doesNotMatch(post, /Reactions|<Reactions|reactions\.js|data-post-reactions/);
  assert.match(post, /<Comments \/>/);
  assert.match(post, /<AffiliateDisclosure \/>/);
});

test("embed loader keeps Twitter widgets aligned with the active theme", async () => {
  const script = await readFile(files.embedsScript, "utf8");

  assert.match(script, /twitterTheme/);
  assert.match(script, /prepareTweets/);
  assert.match(script, /dataset\.tweetUrl/);
  assert.match(script, /twitter-widget/);
  assert.match(script, /yskim:theme-change/);
  assert.match(script, /window\.twttr\.widgets\.load/);
});

test("home keeps the Notion intro as the only home-managed content", async () => {
  const home = await readFile(files.home, "utf8");

  assert.match(home, /getCollection\("pages"/);
  assert.match(home, /findPage\("home"\)/);
  assert.match(home, /await render\(homePage\)/);
  assert.doesNotMatch(home, /findPage\("readme"\)|findPage\("about"\)/);
  assert.doesNotMatch(home, /await render\(readmePage\)/);
  assert.doesNotMatch(home, /getPublishedPosts\(\)/);
  assert.doesNotMatch(home, /<PostCard|Recent Notes|post-feed--home/);
});

test("css defines stable scene dimensions and fallback layering", async () => {
  const css = await readFile(files.css, "utf8");

  assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.doesNotMatch(css, /\.knowledge-scene/);
  assert.match(css, /\.knowledge-graph-canvas/);
  assert.match(css, /\.knowledge-graph-canvas\s*\{[^}]*touch-action:\s*pan-y/s);
});
