import test from "node:test";
import assert from "node:assert/strict";

import { buildBlogGraph, indexGraph } from "../src/lib/knowledge-graph-data.mjs";
import {
  buildFloorMap,
  computeFloorScene,
  floorViewport,
  focusPath,
  layerCounts,
  layoutFloorPlan,
  minimumLayerGap,
  navigateFloor,
} from "../src/lib/graph/floor-layout.mjs";
import { boxesOverlap } from "../src/lib/graph/globe-layout.mjs";
import { buildTaxonomy } from "../src/lib/taxonomy.mjs";

function entry(slug, categories, tags, date = "2026-01-01", body = "") {
  return { id: slug, body, data: { slug, title: `${slug} 글 제목`, date: new Date(date), categories, tags, summary: "" } };
}

function sample() {
  return indexGraph(
    buildBlogGraph(
      buildTaxonomy([
        entry("a", ["개발"], ["astro", "css"], "2026-05-01", "[b](/posts/b/)"),
        entry("b", ["개발"], ["astro"], "2026-04-01"),
        entry("c", ["개발"], ["notion", "css"], "2026-03-01"),
        entry("d", ["개발"], [], "2026-02-01"),
        entry("e", ["개발", "일기"], ["notion"], "2026-01-15"),
        entry("f", ["일기"], ["일상"], "2026-01-01"),
      ]),
      {},
    ),
  );
}

test("an opened category has three layers: itself, its topics, and every post filed under it", () => {
  const map = buildFloorMap(sample(), "개발");

  assert.deepEqual(layerCounts(map), { category: 1, topic: 3, post: 5 });
  assert.deepEqual(map.nodes.filter((node) => node.layer === "post").map((node) => node.id), ["post:a", "post:b", "post:c", "post:d", "post:e"]);
  assert.equal(map.byId.has("topic:일상"), false);
  assert.deepEqual(map.below.get("topic:astro"), ["post:a", "post:b"]);
  assert.deepEqual(map.above.get("post:d"), ["category:개발"]);
  assert.deepEqual(map.sideLinks, [{ source: "post:a", target: "post:b" }]);
  assert.equal(map.byId.get("topic:css").count, 2);
});

test("the plan is deterministic, bounded, and keeps neighbours apart", () => {
  const map = buildFloorMap(sample(), "개발");
  const plan = layoutFloorPlan(map);

  assert.deepEqual([...plan], [...layoutFloorPlan(map)]);
  for (const [id, point] of plan) {
    assert.ok(Math.abs(point.u) <= 0.93 && Math.abs(point.v) <= 0.9, `${id} is off the plane`);
  }
  assert.ok(minimumLayerGap(map, plan, "topic") >= 0.2);
  assert.ok(minimumLayerGap(map, plan, "post") >= 0.15);
});

test("posts sit under their topics; untagged posts wait in the front strip", () => {
  const map = buildFloorMap(sample(), "개발");
  const plan = layoutFloorPlan(map);
  const topicU = (ids) => ids.reduce((sum, id) => sum + plan.get(id).u, 0) / ids.length;

  assert.ok(Math.abs(plan.get("post:b").u - plan.get("topic:astro").u) < 0.45);
  assert.ok(Math.abs(plan.get("post:a").u - topicU(["topic:astro", "topic:css"])) < 0.45);
  assert.ok(plan.get("post:d").v >= 0.6);
});

test("choosing a post lifts its path: its topics and the category", () => {
  const map = buildFloorMap(sample(), "개발");
  const path = focusPath(map, "post:a");

  assert.deepEqual([...path.nodes].sort(), ["category:개발", "post:a", "topic:astro", "topic:css"].sort());
  assert.ok(path.links.has("topic:astro>post:a"));
  assert.equal(focusPath(map, "nope"), null);
});

test("floor scenes keep labels apart and name the category at rest", () => {
  const map = buildFloorMap(sample(), "개발");
  const plan = layoutFloorPlan(map);
  for (const variant of ["rail", "explorer"]) {
    const view = floorViewport(variant, variant === "rail" ? 292 : 720, { counts: layerCounts(map), maxHeight: variant === "rail" ? 320 : 520 });
    for (const focusId of [null, "post:a", "topic:notion", "category:개발"]) {
      const scene = computeFloorScene({ map, plan, view, variant, focusId, currentId: "post:b", density: variant === "rail" ? "quiet" : "rich" });
      if (!focusId) {
        assert.ok(scene.labels.has("category:개발"));
        assert.equal(scene.states.get("post:b"), "current");
      }
      const boxes = [...scene.labels.values()].map((label) => label.box);
      for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) assert.equal(boxesOverlap(boxes[i], boxes[j]), false);
      if (focusId === "post:a") {
        assert.equal(scene.states.get("post:a"), "focus");
        assert.equal(scene.states.get("topic:astro"), "path");
        assert.equal(scene.states.get("post:d"), "dim");
        assert.ok(scene.threads.length >= 3);
        assert.ok(scene.sideThreads.some((thread) => thread.active));
      }
    }
  }
});

test("the rail view stays within the frame height", () => {
  const map = buildFloorMap(sample(), "개발");
  const view = floorViewport("rail", 292, { counts: layerCounts(map), maxHeight: 300 });

  assert.ok(view.height <= 300 + 1);
  assert.ok(view.centers.category < view.centers.topic && view.centers.topic < view.centers.post);
});

test("keyboard moves along a plane and between planes through links", () => {
  const map = buildFloorMap(sample(), "개발");
  const plan = layoutFloorPlan(map);
  const view = floorViewport("rail", 292, { counts: layerCounts(map) });
  const { positions } = computeFloorScene({ map, plan, view, variant: "rail" });
  const base = new Map([...positions].map(([id, position]) => [id, position.base]));

  const up = navigateFloor(map, base, "post:a", "ArrowUp");
  assert.ok(["topic:astro", "topic:css"].includes(up));
  assert.equal(navigateFloor(map, base, "topic:astro", "ArrowUp"), "category:개발");
  assert.ok(map.below.get("topic:astro").includes(navigateFloor(map, base, "topic:astro", "ArrowDown")));
  const row = map.nodes.filter((node) => node.layer === "post").map((node) => node.id).sort((a, b) => base.get(a).x - base.get(b).x);
  assert.equal(navigateFloor(map, base, row[0], "ArrowRight"), row[1]);
  assert.equal(navigateFloor(map, base, row[0], "ArrowLeft"), row[0]);
  assert.equal(navigateFloor(map, base, row[1], "Home"), row[0]);
});

test("a category with a single untagged post still opens", () => {
  const graph = indexGraph(buildBlogGraph(buildTaxonomy([entry("solo", ["메모"], [])]), {}));
  const map = buildFloorMap(graph, "메모");
  const plan = layoutFloorPlan(map);
  const view = floorViewport("rail", 252, { counts: layerCounts(map) });
  const scene = computeFloorScene({ map, plan, view, variant: "rail" });

  assert.deepEqual(layerCounts(map), { category: 1, topic: 0, post: 1 });
  assert.deepEqual(scene.titles.map((title) => title.layer), ["category", "post"]);
  assert.equal(buildFloorMap(graph, "없음"), null);
});
