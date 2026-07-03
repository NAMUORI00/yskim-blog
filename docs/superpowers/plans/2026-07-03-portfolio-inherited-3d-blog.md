# Portfolio-Inherited 3D Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `blog.namuori.net` so it inherits the `namuori.net` portfolio color, typography, and knowledge-graph language while preserving the current Notion content pipeline and all existing blog functions.

**Architecture:** Keep the Astro/Svelte application structure and the Notion-to-content flow intact. Move graph construction into a small reusable module, keep the existing 2D canvas graph as fallback, and add a lazy Three.js Svelte island as a progressive enhancement. Use portfolio-derived semantic CSS tokens so light and dark mode share the same component structure.

**Tech Stack:** Astro 6, Svelte 5, Node test runner, Cloudflare Pages functions, existing static CSS/JS, new `three` runtime dependency.

---

## Scope Contract

The user approved broad design changes. Do not change:

- Notion database/content management model.
- Content fetch scripts.
- Cloudflare Pages/GitHub deployment behavior.
- RSS, robots, comments, reactions, media proxy, embeds, math, Mermaid, affiliate disclosure, reading progress, and back-to-top behavior.

Design changes are allowed across:

- CSS tokens, typography, spacing, borders, cards, rails, and responsive layout.
- Home, archive, category, tag, page, and post visual hierarchy.
- Knowledge graph visuals, including a new 3D enhancement layer.

## File Structure

- Modify `package.json` and `package-lock.json`: add `three`.
- Create `tests/design-tokens.test.mjs`: protects portfolio palette and font token inheritance.
- Create `tests/knowledge-graph-data.test.mjs`: protects graph data generation outside Astro rendering.
- Create `tests/design-preservation.test.mjs`: protects Notion/content-management and feature imports.
- Create `src/lib/knowledge-graph-data.mjs`: pure graph builder used by Astro and tests.
- Create `src/components/BlogGraphScene.svelte`: Three.js enhancement island.
- Modify `src/components/KnowledgeGraph.astro`: use graph builder, render 2D fallback and 3D enhancement.
- Modify `src/pages/index.astro`: richer portfolio-inherited home surface while preserving about content and recent posts.
- Modify `src/pages/posts/index.astro`, `src/pages/categories/[category].astro`, `src/pages/tags/[tag].astro`: archive scanning classes and metadata.
- Modify `src/layouts/Base.astro`: font preconnect/stylesheet links only; preserve theme bootstrap and script loading.
- Modify `static/css/site.css`: portfolio token remap, typography, shell, page, card, graph, and responsive design.
- Modify `src/styles/enhance.css`: motion, focus, reduced-motion, and 3D scene transitions.

---

### Task 1: Portfolio Tokens And Typography Contract

**Files:**

- Create: `tests/design-tokens.test.mjs`
- Modify: `static/css/site.css`
- Modify: `src/layouts/Base.astro`

- [ ] **Step 1: Write the failing design token test**

Create `tests/design-tokens.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cssUrl = new URL("../static/css/site.css", import.meta.url);
const baseUrl = new URL("../src/layouts/Base.astro", import.meta.url);

test("site css inherits the portfolio light and dark color tokens", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /--bg:\s*#f7f7f3;/);
  assert.match(css, /--panel:\s*#ffffff;/);
  assert.match(css, /--line:\s*#deded6;/);
  assert.match(css, /--text:\s*#171a17;/);
  assert.match(css, /--accent:\s*#275f47;/);
  assert.match(css, /--accent-soft:\s*#e7f1ea;/);

  assert.match(css, /--bg:\s*#171a17;/);
  assert.match(css, /--panel:\s*#20251f;/);
  assert.match(css, /--line:\s*#343b33;/);
  assert.match(css, /--text:\s*#f0eee8;/);
  assert.match(css, /--accent:\s*#74c69d;/);
  assert.match(css, /--accent-soft:\s*#1f3328;/);
});

test("site css defines the portfolio typography roles", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /--font-sans:\s*"Pretendard Variable"/);
  assert.match(css, /--font-serif:\s*"Noto Serif KR"/);
  assert.match(css, /--font-mono:\s*"JetBrains Mono"/);
  assert.match(css, /body\s*\{[\s\S]*font-family:\s*var\(--font-sans\)/);
  assert.match(css, /\.eyebrow[\s\S]*font-family:\s*var\(--font-mono\)/);
});

test("base layout loads external fonts without changing theme bootstrap", async () => {
  const base = await readFile(baseUrl, "utf8");

  assert.match(base, /cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard/);
  assert.match(base, /fonts\.googleapis\.com/);
  assert.match(base, /localStorage\.getItem\("yskim-theme"\)/);
  assert.match(base, /document\.documentElement\.dataset\.theme = theme/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/design-tokens.test.mjs
```

Expected: FAIL. At least one assertion reports that `#f7f7f3`, `#171a17`, or the font links are missing.

- [ ] **Step 3: Add portfolio font loading to `Base.astro`**

In `src/layouts/Base.astro`, insert these links after the viewport meta and before the inline theme script:

```astro
    <link rel="preconnect" href="https://cdn.jsdelivr.net" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css"
    />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Serif+KR:wght@500;600;700&display=swap"
    />
```

Do not change the existing inline theme bootstrap, `theme.js`, `embeds.js`, or layout component order.

- [ ] **Step 4: Replace the theme token blocks in `site.css`**

In `static/css/site.css`, keep the layout sizing `:root` block and add font variables inside it:

```css
  --font-sans: "Pretendard Variable", Pretendard, "Nanum Gothic", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
  --font-serif: "Noto Serif KR", Georgia, serif;
  --font-mono: "JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, SFMono-Regular, monospace;
```

Replace the light theme block with:

```css
:root,
html.theme-light,
body.theme-light {
  color-scheme: light;
  --bg: #f7f7f3;
  --panel: #ffffff;
  --panel-soft: #f2f5ef;
  --surface-muted: #f3f3f1;
  --panel-glass: rgba(255, 255, 255, 0.86);
  --panel-glass-soft: rgba(255, 255, 255, 0.68);
  --text: #171a17;
  --heading: #171a17;
  --muted: #626a60;
  --faint: #8a9286;
  --line: #deded6;
  --border: var(--line);
  --line-soft: #ecece5;
  --line-strong: #c9cec2;
  --shadow-soft: 0 14px 36px -28px rgba(23, 26, 23, 0.28);
  --accent: #275f47;
  --accent-strong: #17402f;
  --accent-light: #3f8a65;
  --accent-soft: #e7f1ea;
  --accent-border: #cddfd2;
  --success: #3f8a65;
  --warning: #a36b1f;
  --danger: #8a3434;
  --code-bg: #f4e5e5;
  --code-text: #7c2948;
  --code-border: #eadce2;
  --code-block-bg: #f3f3f1;
  --code-block-text: #171a17;
  --code-block-border: #deded6;
  --grid-line: rgba(39, 95, 71, 0.018);
  --grid-line-soft: rgba(39, 95, 71, 0.012);
}
```

Replace the dark theme block with:

```css
:root[data-theme="dark"],
html.theme-dark,
body.theme-dark {
  color-scheme: dark;
  --bg: #171a17;
  --panel: #20251f;
  --panel-soft: #1f3328;
  --surface-muted: #232923;
  --panel-glass: rgba(32, 37, 31, 0.9);
  --panel-glass-soft: rgba(32, 37, 31, 0.72);
  --text: #f0eee8;
  --heading: #f0eee8;
  --muted: #a7b0a4;
  --faint: #7f8a7c;
  --line: #343b33;
  --border: var(--line);
  --line-soft: #293128;
  --line-strong: #4a5548;
  --shadow-soft: 0 18px 44px -30px rgba(0, 0, 0, 0.7);
  --accent: #74c69d;
  --accent-strong: #95d8b4;
  --accent-light: #95d8b4;
  --accent-soft: #1f3328;
  --accent-border: #375444;
  --success: #95d8b4;
  --warning: #f5be6a;
  --danger: #ff9a9a;
  --code-bg: #3a2424;
  --code-text: #ffc3d6;
  --code-border: #56323f;
  --code-block-bg: #111511;
  --code-block-text: #f0eee8;
  --code-block-border: #343b33;
  --grid-line: rgba(116, 198, 157, 0.026);
  --grid-line-soft: rgba(116, 198, 157, 0.014);
}
```

Update `body`, `code`, `pre`, `.eyebrow`, `.profile-kicker`, `.sidebar-title`, `.rail-section-title`, date `time`, and counters to use `var(--font-sans)` or `var(--font-mono)` according to the spec.

- [ ] **Step 5: Run the token test and commit**

Run:

```powershell
node --test tests/design-tokens.test.mjs
npm test
```

Expected: both commands PASS.

Commit:

```powershell
git add src/layouts/Base.astro static/css/site.css tests/design-tokens.test.mjs
git commit -m "style: inherit portfolio theme tokens"
```

---

### Task 2: Reusable Knowledge Graph Data

**Files:**

- Create: `src/lib/knowledge-graph-data.mjs`
- Create: `tests/knowledge-graph-data.test.mjs`
- Modify: `src/components/KnowledgeGraph.astro`

- [ ] **Step 1: Write the graph data tests**

Create `tests/knowledge-graph-data.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/knowledge-graph-data.test.mjs
```

Expected: FAIL with module-not-found for `src/lib/knowledge-graph-data.mjs`.

- [ ] **Step 3: Create the pure graph builder**

Create `src/lib/knowledge-graph-data.mjs`:

```js
const stripHandle = (handle) => String(handle || "namuori").replace(/^@+/, "");

export function buildKnowledgeGraph({ posts, handle, currentSlug, postUrl, tagUrl, slugifyTerm }) {
  const nodes = [];
  const links = [];
  const seen = new Set();

  const addNode = (node) => {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      nodes.push(node);
    }
  };

  const rootSlug = slugifyTerm(stripHandle(handle));
  const rootId = `profile:${rootSlug}`;
  addNode({ id: rootId, label: handle, type: "main", url: "/" });

  for (const post of posts) {
    const postId = `post:${post.data.slug}`;
    addNode({
      id: postId,
      label: post.data.title,
      type: "post",
      url: postUrl(post.data.slug),
      active: post.data.slug === currentSlug,
    });
    links.push({ source: rootId, target: postId });

    for (const tag of post.data.tags) {
      const tagId = `tag:${slugifyTerm(tag)}`;
      addNode({ id: tagId, label: tag, type: "tag", url: tagUrl(tag) });
      links.push({ source: postId, target: tagId });
    }
  }

  return { nodes, links };
}

export function createVisualGraphSubset(graph, { maxNodes = 72 } = {}) {
  if (graph.nodes.length <= maxNodes) return graph;

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const link of graph.links) {
    degree.set(link.source, (degree.get(link.source) || 0) + 1);
    degree.set(link.target, (degree.get(link.target) || 0) + 1);
  }

  const keep = new Set();
  const root = graph.nodes.find((node) => node.type === "main");
  const active = graph.nodes.find((node) => node.active);
  if (root) keep.add(root.id);
  if (active) keep.add(active.id);

  if (active) {
    for (const link of graph.links) {
      if (link.source === active.id) keep.add(link.target);
      if (link.target === active.id) keep.add(link.source);
    }
  }

  const remaining = graph.nodes
    .filter((node) => !keep.has(node.id))
    .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.id.localeCompare(b.id));

  for (const node of remaining) {
    if (keep.size >= maxNodes) break;
    keep.add(node.id);
  }

  const nodes = [...graph.nodes.filter((node) => keep.has(node.id))];
  const links = graph.links.filter((link) => keep.has(link.source) && keep.has(link.target));

  for (const nodeId of keep) {
    if (!nodesById.has(nodeId)) {
      throw new Error(`Missing graph node ${nodeId}`);
    }
  }

  return { nodes, links };
}
```

- [ ] **Step 4: Update `KnowledgeGraph.astro` to use the builder**

Replace the local `nodes`, `links`, `seen`, and loop construction in `src/components/KnowledgeGraph.astro` with:

```astro
---
import { SITE, ASSET_VERSION } from "../config";
import { getPublishedPosts, postUrl, tagUrl, slugifyTerm } from "../lib/posts";
import { buildKnowledgeGraph, createVisualGraphSubset } from "../lib/knowledge-graph-data.mjs";

const allPosts = await getPublishedPosts();
const match = Astro.url.pathname.match(/^\/posts\/([^/]+)\/?$/);
const currentSlug = match ? decodeURIComponent(match[1]) : undefined;

const fullGraph = buildKnowledgeGraph({
  posts: allPosts,
  handle: SITE.handle,
  currentSlug,
  postUrl,
  tagUrl,
  slugifyTerm,
});
const graphObject = createVisualGraphSubset(fullGraph, { maxNodes: 72 });
const graph = JSON.stringify(graphObject);
const hasGraph = graphObject.nodes.length > 1;
---
```

Keep the current rendered HTML for this task. Do not import `BlogGraphScene` until Task 3 so this task remains buildable.

- [ ] **Step 5: Run tests/build and commit**

Run:

```powershell
node --test tests/knowledge-graph-data.test.mjs
npm test
npm run build
```

Expected: all commands PASS.

Commit:

```powershell
git add src/lib/knowledge-graph-data.mjs src/components/KnowledgeGraph.astro tests/knowledge-graph-data.test.mjs
git commit -m "refactor: share blog knowledge graph data"
```

---

### Task 3: Three.js Graph Enhancement

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/design-preservation.test.mjs`
- Create: `src/components/BlogGraphScene.svelte`
- Modify: `src/components/KnowledgeGraph.astro`
- Modify: `static/css/site.css`
- Modify: `src/styles/enhance.css`

- [ ] **Step 1: Write preservation and 3D contract tests**

Create `tests/design-preservation.test.mjs`:

```js
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
  assert.match(home, /await render\(about\)/);
  assert.match(home, /getPublishedPosts\(\)/);
  assert.match(home, /<PostCard/);
});

test("css defines stable scene dimensions and fallback layering", async () => {
  const css = await readFile(files.css, "utf8");

  assert.match(css, /\.knowledge-scene/);
  assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css, /\.knowledge-scene__canvas/);
  assert.match(css, /\.knowledge-graph-canvas/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
node --test tests/design-preservation.test.mjs
```

Expected: FAIL with module-not-found for `BlogGraphScene.svelte` or missing `three` dependency.

- [ ] **Step 3: Install Three.js**

Run:

```powershell
npm install three
```

Expected: `package.json` and `package-lock.json` change, and `package.json` contains a `three` entry under `dependencies`.

- [ ] **Step 4: Create `BlogGraphScene.svelte`**

Create `src/components/BlogGraphScene.svelte`:

```svelte
<script>
  import { onMount } from "svelte";

  export let graph = { nodes: [], links: [] };
  export let label = "지식 그래프 3D 레이어";

  let canvas;
  let status = "idle";

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cssColor = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  onMount(() => {
    let disposed = false;
    let frame = 0;
    let cleanup = () => {};

    const start = async () => {
      if (!canvas || prefersReducedMotion()) {
        status = "reduced";
        return;
      }

      try {
        const THREE = await import("three");
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 9);

        const root = new THREE.Group();
        scene.add(root);

        const materialFor = (node) => {
          const color =
            node.type === "main"
              ? cssColor("--accent-strong", "#17402f")
              : node.active
                ? cssColor("--accent", "#275f47")
                : node.type === "tag"
                  ? cssColor("--muted", "#626a60")
                  : cssColor("--text", "#171a17");
          return new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: node.active ? 0.96 : 0.76,
          });
        };

        const nodeMap = new Map();
        const countByLevel = new Map();
        const nextIndex = new Map();
        const levelOf = (node) => (node.type === "main" ? 0 : node.type === "post" ? 1 : 2);
        for (const node of graph.nodes) {
          const level = levelOf(node);
          countByLevel.set(level, (countByLevel.get(level) || 0) + 1);
        }

        for (const node of graph.nodes) {
          const level = levelOf(node);
          const index = nextIndex.get(level) || 0;
          nextIndex.set(level, index + 1);
          const total = countByLevel.get(level) || 1;
          const angle = level === 0 ? -Math.PI / 2 : -Math.PI / 2 + (Math.PI * 2 * index) / total;
          const radius = level === 0 ? 0 : level === 1 ? 2.15 : 3.45;
          const depth = level === 0 ? 0.35 : level === 1 ? 0 : -0.55;
          const size = node.type === "main" ? 0.16 : node.active ? 0.13 : 0.095;
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 18, 18), materialFor(node));
          mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, depth);
          mesh.userData = { id: node.id, url: node.url };
          root.add(mesh);
          nodeMap.set(node.id, mesh);
        }

        const linkMaterial = new THREE.LineBasicMaterial({
          color: cssColor("--accent", "#275f47"),
          transparent: true,
          opacity: 0.18,
        });
        for (const link of graph.links) {
          const source = nodeMap.get(link.source);
          const target = nodeMap.get(link.target);
          if (!source || !target) continue;
          const geometry = new THREE.BufferGeometry().setFromPoints([
            source.position.clone(),
            target.position.clone(),
          ]);
          root.add(new THREE.Line(geometry, linkMaterial));
        }

        const resize = () => {
          const rect = canvas.getBoundingClientRect();
          const width = Math.max(1, rect.width);
          const height = Math.max(1, rect.height);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };

        const refreshTheme = () => {
          for (const node of graph.nodes) {
            const mesh = nodeMap.get(node.id);
            if (mesh) mesh.material = materialFor(node);
          }
          linkMaterial.color.set(cssColor("--accent", "#275f47"));
        };

        const animate = () => {
          if (disposed) return;
          root.rotation.z += 0.0018;
          root.rotation.x = Math.sin(performance.now() / 4200) * 0.08;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(animate);
        };

        const openFocusedNode = (event) => {
          const active = graph.nodes.find((node) => node.active);
          if (active?.url && event.detail === 2) window.location.href = active.url;
        };

        resize();
        refreshTheme();
        animate();
        status = "ready";

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        window.addEventListener("yskim:theme-change", refreshTheme);
        canvas.addEventListener("click", openFocusedNode);

        cleanup = () => {
          cancelAnimationFrame(frame);
          resizeObserver.disconnect();
          window.removeEventListener("yskim:theme-change", refreshTheme);
          canvas.removeEventListener("click", openFocusedNode);
          renderer.dispose();
          for (const child of root.children) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          }
        };
      } catch {
        status = "fallback";
      }
    };

    start();

    return () => {
      disposed = true;
      cleanup();
    };
  });
</script>

<div class="knowledge-scene" data-state={status} aria-label={label}>
  <canvas bind:this={canvas} class="knowledge-scene__canvas" aria-hidden="true"></canvas>
</div>
```

- [ ] **Step 5: Render the scene in `KnowledgeGraph.astro`**

Add this import to `src/components/KnowledgeGraph.astro`:

```astro
import BlogGraphScene from "./BlogGraphScene.svelte";
```

Update the rendered graph section in `src/components/KnowledgeGraph.astro`:

```astro
{hasGraph && (
  <section class="sidebar-card sidebar-graph-card">
    <div class="knowledge-graph-heading">
      <p class="sidebar-title">지식 그래프</p>
      <span>{graphObject.nodes.length} nodes</span>
    </div>
    <div class="sidebar-graph-canvas" data-knowledge-graph>
      <BlogGraphScene graph={graphObject} client:visible />
      <template class="knowledge-graph-data">{graph}</template>
      <canvas class="knowledge-graph-canvas" aria-hidden="true"></canvas>
    </div>
  </section>
  <script src={`/js/knowledge-graph.js?v=${ASSET_VERSION}`} is:inline defer></script>
)}
```

- [ ] **Step 6: Add graph scene CSS**

Add to `static/css/site.css` near the existing graph CSS:

```css
.sidebar-graph-canvas {
  isolation: isolate;
}

.knowledge-scene {
  position: absolute;
  inset: 0;
  z-index: 1;
  aspect-ratio: 1 / 1;
  opacity: 0.72;
  pointer-events: none;
}

.knowledge-scene__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.knowledge-graph-canvas {
  position: relative;
  z-index: 2;
}
```

Add to `src/styles/enhance.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .knowledge-scene {
    display: none;
  }
}
```

- [ ] **Step 7: Run tests and commit**

Run:

```powershell
node --test tests/design-preservation.test.mjs
npm test
npm run build
```

Expected: all commands PASS.

Commit:

```powershell
git add package.json package-lock.json src/components/BlogGraphScene.svelte src/components/KnowledgeGraph.astro static/css/site.css src/styles/enhance.css tests/design-preservation.test.mjs
git commit -m "feat: add three dimensional graph enhancement"
```

---

### Task 4: Home And Archive Visual Structure

**Files:**

- Modify: `src/pages/index.astro`
- Modify: `src/pages/posts/index.astro`
- Modify: `src/pages/categories/[category].astro`
- Modify: `src/pages/tags/[tag].astro`
- Modify: `src/components/PostCard.astro`
- Modify: `static/css/site.css`

- [ ] **Step 1: Update the home markup while preserving Notion about rendering**

In `src/pages/index.astro`, keep the imports and data loading. Replace the rendered body inside `<Base>` with:

```astro
<section class="home-hero" aria-labelledby="home-title">
  <div class="home-hero__copy">
    <p class="eyebrow">NAMUORI.LOG</p>
    <h1 id="home-title">{SITE.title}</h1>
    <p class="summary">{SITE.description}</p>
    {gh.bio && <p class="profile-bio profile-bio--about">{gh.bio}</p>}
    <div class="hero-actions">
      <a class="primary-link" href="/posts/">{UI.allPosts}</a>
      <a class="text-link" href={SITE.portfolio} target="_blank" rel="noopener noreferrer">
        {UI.navPortfolio} ↗
      </a>
    </div>
  </div>
  <div class="home-hero__signal" aria-hidden="true">
    <span class="signal-orbit signal-orbit--one"></span>
    <span class="signal-orbit signal-orbit--two"></span>
    <span class="signal-node signal-node--root"></span>
    <span class="signal-node signal-node--post"></span>
    <span class="signal-node signal-node--tag"></span>
  </div>
</section>

{AboutContent && (
  <article class="readme-card post home-readme">
    <div class="filebar">
      <span></span><span></span><span></span>
      <strong>README.md</strong>
      <em>{SITE.handle}</em>
    </div>
    <div class="post-inner">
      <div class="content">
        <AboutContent />
      </div>
    </div>
  </article>
)}

{posts.length > 0 && (
  <section class="post-feed post-feed--home">
    <div class="section-heading">
      <div>
        <p class="eyebrow">Recent Notes</p>
        <h2>{UI.recent}</h2>
      </div>
      <a class="section-link" href="/posts/">{UI.allPosts}</a>
    </div>
    <div class="post-list">
      {posts.map((p) => (
        <PostCard
          href={postUrl(p.data.slug)}
          title={p.data.title}
          date={p.data.date}
          category={p.data.categories[0]}
          summary={p.data.summary}
          cover={p.data.cover || undefined}
          tags={p.data.tags}
        />
      ))}
    </div>
  </section>
)}
```

- [ ] **Step 2: Add archive metadata classes without changing data flow**

In `src/pages/posts/index.astro`, replace the header with:

```astro
  <header class="page-heading archive-heading">
    <p class="eyebrow">Archive</p>
    <h1>{UI.allPosts}</h1>
    <p>공개 발행된 노트와 글.</p>
    <p class="page-header-count">{posts.length} entries</p>
  </header>
```

In `src/pages/categories/[category].astro`, replace the header with:

```astro
  <header class="page-heading archive-heading">
    <p class="eyebrow">Category</p>
    <h1>{name}</h1>
    <p>카테고리 · {posts.length}개의 글</p>
  </header>
```

In `src/pages/tags/[tag].astro`, replace the header with:

```astro
  <header class="page-heading archive-heading">
    <p class="eyebrow">Tag</p>
    <h1>#{name}</h1>
    <p>태그 · {posts.length}개의 글</p>
  </header>
```

- [ ] **Step 3: Strengthen `PostCard.astro` scanning structure**

Keep the existing props. Replace the card body with:

```astro
  <div class="post-card-body">
    <div class="post-card-meta">
      <time datetime={dateStr}>{dateStr}</time>
      {category && <span class="post-card-category">{category}</span>}
    </div>
    <h2 class="post-card-title">{title}</h2>
    {summary && <p class="post-card-summary">{summary}</p>}
    {tags.length > 0 && (
      <ul class="tags post-card-tags" aria-label="Tags">
        {tags.slice(0, 6).map((t) => <li>{t}</li>)}
      </ul>
    )}
  </div>
```

This keeps all routing and content intact while preventing long tag lists from resizing cards unpredictably.

- [ ] **Step 4: Add home and archive CSS**

Add to `static/css/site.css` after `.content-column`:

```css
.home-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 280px);
  gap: var(--space-6);
  align-items: center;
  min-height: clamp(320px, 48vh, 520px);
  margin-bottom: var(--space-5);
  padding: var(--space-7);
  overflow: hidden;
  background:
    radial-gradient(circle at 82% 30%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 34%),
    var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-soft);
}

.home-hero__copy {
  position: relative;
  z-index: 2;
  display: grid;
  gap: var(--space-4);
  max-width: var(--content-width);
}

.home-hero h1 {
  margin: 0;
  color: var(--heading);
  font-family: var(--font-serif);
  font-size: clamp(2rem, 4vw, 4.2rem);
  line-height: 1.05;
}

.home-hero__signal {
  position: relative;
  aspect-ratio: 1 / 1;
  min-width: 0;
}

.signal-orbit,
.signal-node {
  position: absolute;
  border-radius: 999px;
}

.signal-orbit {
  inset: 12%;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
}

.signal-orbit--two {
  inset: 28%;
  border-color: color-mix(in srgb, var(--accent-light) 34%, transparent);
}

.signal-node {
  width: 18px;
  height: 18px;
  background: var(--accent);
  box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent) 12%, transparent);
}

.signal-node--root { left: 48%; top: 46%; }
.signal-node--post { right: 18%; top: 22%; background: var(--accent-light); }
.signal-node--tag { left: 16%; bottom: 22%; background: var(--muted); }

.archive-heading {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}
```

Add to the `@media (max-width: 900px)` block:

```css
  .home-hero {
    grid-template-columns: 1fr;
    min-height: auto;
    padding: var(--space-5);
  }

  .home-hero__signal {
    max-width: 220px;
    width: 70%;
    margin: 0 auto;
  }
```

- [ ] **Step 5: Run tests/build and commit**

Run:

```powershell
npm test
npm run build
```

Expected: both commands PASS.

Commit:

```powershell
git add src/pages/index.astro src/pages/posts/index.astro src/pages/categories/[category].astro src/pages/tags/[tag].astro src/components/PostCard.astro static/css/site.css
git commit -m "style: reshape blog home and archives"
```

---

### Task 5: Shell, Rails, Motion, And Responsive Polish

**Files:**

- Modify: `static/css/site.css`
- Modify: `src/styles/enhance.css`
- Modify: `src/components/ProfileRail.astro`
- Modify: `src/components/Sidebar.astro`

- [ ] **Step 1: Update rail headings and semantic labels**

In `src/components/ProfileRail.astro`, change the profile aside label:

```astro
<aside class="profile-rail" aria-label="Profile and categories">
```

In `src/components/Sidebar.astro`, change the aside label:

```astro
<aside class="blog-sidebar" aria-label="Blog context">
```

No data fetching, URLs, or component imports change.

- [ ] **Step 2: Add 1:3:6 shell CSS refinements**

In `static/css/site.css`, refine these existing selectors:

```css
.top-bar {
  background: var(--panel-glass);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(14px);
}

.profile-rail,
.sidebar-card,
.readme-card,
.post-card,
.archive-heading {
  border-color: var(--line);
  box-shadow: var(--shadow-soft);
}

.profile-rail,
.sidebar-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 44%, transparent), transparent 42%),
    var(--panel);
}

.post-card {
  min-height: 148px;
}

.post-card-meta,
.post-card-category,
.page-header-count,
.filebar,
.sidebar-post time {
  font-family: var(--font-mono);
}

.rail-category-list a.is-active,
.sidebar-nav a.is-active,
.top-bar-nav a.is-active {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: var(--accent-border);
}
```

- [ ] **Step 3: Keep mobile content-first layout complete**

In `static/css/site.css`, make the mobile graph visible as a compact structural panel instead of hiding it:

```css
@media (max-width: 600px) {
  .sidebar-graph-card {
    display: grid;
  }

  .sidebar-graph-canvas {
    max-height: 240px;
  }

  .knowledge-scene {
    display: none;
  }
}
```

This satisfies the requirement that all content and functions remain available in both themes and all viewport classes.

- [ ] **Step 4: Add reduced-motion and hover polish**

In `src/styles/enhance.css`, extend the motion layer:

```css
@media (prefers-reduced-motion: no-preference) {
  .home-hero__signal {
    animation: signal-drift 18s linear infinite;
  }

  .signal-orbit {
    animation: signal-pulse 3.8s ease-in-out infinite;
  }

  .signal-orbit--two {
    animation-duration: 5.4s;
  }

  .sidebar-card:hover,
  .profile-rail:hover {
    border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
  }

  @keyframes signal-drift {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  @keyframes signal-pulse {
    0%, 100% { opacity: 0.46; transform: scale(1); }
    50% { opacity: 0.82; transform: scale(1.025); }
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Run tests/build and commit**

Run:

```powershell
npm test
npm run build
```

Expected: both commands PASS.

Commit:

```powershell
git add static/css/site.css src/styles/enhance.css src/components/ProfileRail.astro src/components/Sidebar.astro
git commit -m "style: polish portfolio inspired blog shell"
```

---

### Task 6: Browser Verification And Final Fixes

**Files:**

- Modify only files touched in Tasks 1-5 if browser verification reveals layout bugs.

- [ ] **Step 1: Run full local verification**

Run:

```powershell
npm test
npm run build
```

Expected:

- `npm test` PASS for all `tests/*.test.mjs`.
- `npm run build` PASS and writes `dist`.

- [ ] **Step 2: Start the local dev server**

Run:

```powershell
npm run dev -- --host 127.0.0.1 --port 4321
```

Expected: Astro reports a local URL at `http://127.0.0.1:4321/`.

- [ ] **Step 3: Verify required routes in the browser**

Open these routes in the in-app browser:

```text
http://127.0.0.1:4321/
http://127.0.0.1:4321/posts/
http://127.0.0.1:4321/pages/about/
http://127.0.0.1:4321/pages/contact/
http://127.0.0.1:4321/pages/privacy/
http://127.0.0.1:4321/pages/disclaimer/
http://127.0.0.1:4321/index.xml
http://127.0.0.1:4321/robots.txt
```

Also open one generated post URL, one generated category URL, and one generated tag URL from the visible site navigation.

Expected:

- All content is visible.
- Top nav, profile rail, sidebar, post cards, comments area, reactions area, and footer links are reachable.
- Light/dark toggle changes the page without flashing unreadable colors.
- The knowledge graph shows the 2D canvas fallback and, where WebGL is available, the 3D layer is nonblank.
- No text overlaps another UI element at desktop width or mobile width.

- [ ] **Step 4: Verify mobile and reduced-motion behavior**

Use browser viewport checks for:

```text
390 x 844
768 x 1024
1440 x 900
```

Expected:

- Mobile keeps content first, then profile rail, then sidebar.
- Graph remains present as a compact panel on mobile.
- `prefers-reduced-motion: reduce` hides the Three.js layer and keeps navigation readable.

- [ ] **Step 5: Fix any discovered visual defects**

For each defect, make the smallest scoped edit and re-run:

```powershell
npm test
npm run build
```

Expected: both commands PASS after each fix.

- [ ] **Step 6: Commit final verification fixes**

If Step 5 changed files, commit:

```powershell
git add static/css/site.css src/styles/enhance.css src/**/*.astro src/**/*.svelte tests/*.test.mjs package.json package-lock.json
git commit -m "fix: complete responsive blog design verification"
```

If Step 5 made no changes, do not create an empty commit.

---

## Final Acceptance Checklist

- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] Light mode uses portfolio paper/surface/green tokens.
- [ ] Dark mode uses portfolio research-desk/surface/green tokens.
- [ ] Notion content rendering remains intact.
- [ ] Posts, categories, tags, static pages, RSS, and robots remain intact.
- [ ] Comments, reactions, media proxy, embeds, math, Mermaid, reading progress, and back-to-top remain intact.
- [ ] Three.js is progressive enhancement; 2D graph and HTML navigation remain usable.
- [ ] Desktop and mobile browser verification completed.
- [ ] No visible text overlap, card nesting problem, or decorative blob/orb background was introduced.
