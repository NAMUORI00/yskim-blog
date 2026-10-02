import test from "node:test";
import assert from "node:assert/strict";

import { buildBlogGraph, indexGraph } from "../src/lib/knowledge-graph-data.mjs";
import {
  boxesOverlap,
  chooseYaw,
  CORE_CLEARANCE,
  defaultCamera,
  domainLabelMisses,
  fitView,
  forwardCamera,
  layoutGlobe,
  neighborhood,
  PITCH_LIMITS,
  projectPoint,
  RAIL_ASPECT,
  RAIL_WIDTHS,
  toCamera,
} from "../src/lib/graph/globe-layout.mjs";
import { CANVAS_PADDING, computeGlobeScene, navigateDomains } from "../src/lib/graph/globe-scene.mjs";
import { buildTaxonomy } from "../src/lib/taxonomy.mjs";

function entry(slug, categories, tags, date = "2026-01-01", body = "") {
  return { id: slug, body, data: { slug, title: `${slug} 글`, date: new Date(date), categories, tags, summary: "" } };
}

function blog() {
  const entries = [];
  const categories = ["개발", "일기", "운영 노트", "읽기"];
  categories.forEach((category, c) => {
    for (let i = 0; i < 5; i += 1) {
      entries.push(entry(`${c}-${i}`, [category], [`t${c}-${i % 3}`, i % 2 ? "공통" : `t${c}-x`], `2026-0${c + 1}-1${i}`));
    }
  });
  return indexGraph(buildBlogGraph(buildTaxonomy(entries), { identity: { name: "KIM", handle: "namuori" } }));
}

const railView = (layout, width = RAIL_WIDTHS[1]) => fitView(layout, width, Math.round(width * RAIL_ASPECT), CANVAS_PADDING.rail);

test("the globe layout is deterministic", () => {
  const graph = blog();
  const a = layoutGlobe(graph);
  const b = layoutGlobe(graph);

  assert.deepEqual([...a.positions], [...b.positions]);
  assert.equal(a.yaw, b.yaw);
});

test("the centre stays empty for Me and clusters sit out on the shell", () => {
  const layout = layoutGlobe(blog());

  for (const [id, point] of layout.positions) {
    assert.ok(Math.hypot(point.x, point.y, point.z) >= CORE_CLEARANCE * 0.66, `${id} is too close to the centre`);
  }
  for (const [id, center] of layout.centers) {
    assert.ok(Math.hypot(center.x, center.y, center.z) > 0.45, `cluster ${id} collapsed into the centre`);
  }
});

test("turning or tilting never pushes a star out of the rail frame", () => {
  const layout = layoutGlobe(blog());
  for (const width of RAIL_WIDTHS) {
    const view = railView(layout, width);
    for (const pitch of [PITCH_LIMITS[0], 0.34, PITCH_LIMITS[1]]) {
      for (let step = 0; step < 24; step += 1) {
        const camera = { yaw: (step / 24) * Math.PI * 2, pitch, zoom: 1, panX: 0, panY: 0 };
        for (const point of layout.positions.values()) {
          const p = projectPoint(view, camera, layout, point);
          assert.ok(p.x >= -0.5 && p.x <= view.width + 0.5 && p.y >= -0.5 && p.y <= view.height + 0.5, "star left the frame");
        }
      }
    }
  }
});

test("the first view fits every category name at each rail width", () => {
  const graph = blog();
  const layout = layoutGlobe(graph);

  assert.equal(domainLabelMisses(graph, layout, layout.yaw), 0);
});

test("on an article page the article's category turns to the near side", () => {
  const graph = blog();
  const layout = layoutGlobe(graph);
  for (const domain of graph.domains) {
    const yaw = layout.facing.get(domain.id);
    const center = layout.centers.get(domain.id);
    assert.ok(toCamera(center, yaw, 0.34).z > 0, `${domain.id} faces away`);
  }
  assert.equal(chooseYaw(graph, layout, { prefer: "일기" }), layout.facing.get("일기"));
});

test("opening a category brings its cluster to the front and centre", () => {
  const graph = blog();
  const layout = layoutGlobe(graph);
  const view = railView(layout);
  for (const domain of graph.domains) {
    const camera = forwardCamera(layout, domain.id);
    const point = projectPoint(view, camera, layout, layout.centers.get(domain.id));
    assert.ok(Math.abs(point.x - view.cx) < 1, `${domain.id} is not centred`);
    assert.ok(toCamera(layout.centers.get(domain.id), camera.yaw, camera.pitch).z > 0);
  }
});

test("rail scene names categories only; a hovered star adds just its own name", () => {
  const graph = blog();
  const layout = layoutGlobe(graph);
  const view = railView(layout);
  const camera = defaultCamera(layout);
  const quiet = computeGlobeScene({ graph, layout, view, camera, variant: "rail" });

  assert.deepEqual([...quiet.labels.keys()].sort(), graph.domains.map((domain) => domain.key).sort());
  const star = graph.nodes.find((node) => node.kind === "post").id;
  const hovered = computeGlobeScene({ graph, layout, view, camera, variant: "rail", starId: star });
  assert.ok(hovered.labels.has(star));
  assert.equal(hovered.labels.size, quiet.labels.size + 1);
});

test("placed labels never overlap each other or the centre", () => {
  const graph = blog();
  const layout = layoutGlobe(graph);
  for (const variant of ["rail", "explorer"]) {
    const view = variant === "rail" ? railView(layout) : fitView(layout, 760, 560, CANVAS_PADDING.explorer);
    for (let step = 0; step < 12; step += 1) {
      const camera = { ...defaultCamera(layout), yaw: layout.yaw + (step / 12) * Math.PI * 2, zoom: variant === "explorer" ? 1.6 : 1 };
      const scene = computeGlobeScene({ graph, layout, view, camera, variant, density: variant === "explorer" ? "rich" : "quiet" });
      const boxes = [...scene.labels.values()].map((label) => label.box);
      for (let i = 0; i < boxes.length; i += 1) {
        assert.equal(boxesOverlap(boxes[i], scene.core.box), false, "label covers Me");
        for (let j = i + 1; j < boxes.length; j += 1) assert.equal(boxesOverlap(boxes[i], boxes[j]), false, "labels overlap");
      }
    }
  }
});

test("the current article is marked without a halo, and previews dim the rest", () => {
  const graph = blog();
  const layout = layoutGlobe(graph);
  const view = railView(layout);
  const camera = defaultCamera(layout);
  const current = "post:0-0";
  const idle = computeGlobeScene({ graph, layout, view, camera, variant: "rail", currentId: current });

  assert.equal(idle.states.get(current), "current");
  assert.equal(idle.domains.find((item) => item.domain.id === "개발").state, "current");
  assert.equal([...idle.states.values()].filter((state) => state === "current").length, 1);

  const preview = computeGlobeScene({ graph, layout, view, camera, variant: "rail", focusId: "category:일기", currentId: current });
  assert.equal(preview.domains.find((item) => item.domain.id === "일기").state, "focus");
  assert.equal(preview.states.get("post:1-0"), "near");
  assert.ok(preview.links.some((link) => link.tier === "near"));
  assert.ok(preview.links.some((link) => link.tier === "dim"));
});

test("a category neighbourhood covers its posts and topics", () => {
  const graph = blog();
  const hood = neighborhood(graph, "category:개발", 1);
  const domain = graph.domainById.get("개발");

  for (const id of [...domain.posts, ...domain.topics]) assert.equal(hood.hops.get(id), 1);
  assert.equal(neighborhood(graph, "category:없음"), null);
});

test("a one-category, one-post blog still lays out and frames", () => {
  const graph = indexGraph(buildBlogGraph(buildTaxonomy([entry("only", ["일기"], ["하루"])]), {}));
  const layout = layoutGlobe(graph);
  const view = railView(layout);
  const scene = computeGlobeScene({ graph, layout, view, camera: defaultCamera(layout), variant: "rail", currentId: "post:only" });

  assert.equal(layout.positions.size, 2);
  assert.equal(scene.labels.has("category:일기"), true);
  assert.equal(scene.spokes.length, 1);
});

test("an empty graph gives an empty, finite layout", () => {
  const graph = indexGraph(buildBlogGraph(buildTaxonomy([]), {}));
  const layout = layoutGlobe(graph);
  const view = railView(layout);

  assert.equal(layout.positions.size, 0);
  assert.ok(Number.isFinite(view.focal) && Number.isFinite(view.cy));
});

test("arrow keys move between categories by their place on screen", () => {
  const domains = [{ key: "a" }, { key: "b" }, { key: "c" }];
  const targets = new Map([
    ["a", { x: 10, y: 50 }],
    ["b", { x: 90, y: 50 }],
    ["c", { x: 50, y: 10 }],
  ]);

  assert.equal(navigateDomains(domains, targets, "a", "ArrowRight"), "b");
  assert.equal(navigateDomains(domains, targets, "b", "ArrowLeft"), "a");
  assert.equal(navigateDomains(domains, targets, "a", "ArrowUp"), "c");
  assert.equal(navigateDomains(domains, targets, "a", "ArrowLeft"), "a");
  assert.equal(navigateDomains(domains, targets, "c", "End"), "c");
  assert.equal(navigateDomains(domains, targets, "c", "PageDown"), "a");
});
