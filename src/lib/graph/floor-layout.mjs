// The opened category: three stacked planes — the category, its topics (tags),
// and its posts — drawn in a 2.5D axonometric view. Ported from the portfolio's
// layered knowledge map (knowledgeMapLayout + KnowledgeMapCanvas scene). Topics
// sit in a row under the category, posts sit under the topics they carry, so
// threads between planes fall nearly straight down. Deterministic; pure.
import { estimateTextWidth } from "./globe-layout.mjs";

export const FLOOR_LAYERS = ["category", "topic", "post"];

const BOUND_U = 0.93;
const BOUND_V = 0.9;
const V_WEIGHT = 0.55;
const MIN_GAP = { category: 0, topic: 0.3, post: 0.24 };
const STRIP_V = [0.66, 0.86];
const ITERATIONS = 360;

const collator = new Intl.Collator("ko");

function hashFraction(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function centroid(points) {
  const sum = points.reduce((acc, point) => ({ u: acc.u + point.u, v: acc.v + point.v }), { u: 0, v: 0 });
  return { u: sum.u / points.length, v: sum.v / points.length };
}

export function linkKey(source, target) {
  return `${source}>${target}`;
}

/**
 * The three layers for one category of an indexed graph: the category itself,
 * the topics its posts carry, and every post filed under it (including posts
 * whose first category is another one).
 */
export function buildFloorMap(graph, domainId) {
  const domain = graph.domainById.get(domainId);
  if (!domain) return null;
  const categoryId = domain.key;
  const posts = domain.posts.map((id) => graph.byId.get(id)).filter(Boolean);
  const postIds = new Set(posts.map((post) => post.id));
  const topicIds = domain.topics.filter((id) => graph.byId.has(id));
  const nodes = [
    { id: categoryId, layer: "category", label: domain.label, title: domain.label, order: 0, count: domain.count },
    ...topicIds.map((id, order) => {
      const topic = graph.byId.get(id);
      const inCategory = posts.filter((post) => post.topics.includes(id)).length;
      return { id, layer: "topic", label: topic.label, title: topic.title, order, count: inCategory, total: topic.count ?? inCategory };
    }),
    ...posts.map((post, order) => ({ id: post.id, layer: "post", label: post.label, title: post.title, order, date: post.date })),
  ];
  const links = [];
  for (const id of topicIds) links.push({ source: categoryId, target: id });
  for (const post of posts) {
    const carried = post.topics.filter((id) => topicIds.includes(id));
    if (carried.length) for (const id of carried) links.push({ source: id, target: post.id });
    else links.push({ source: categoryId, target: post.id });
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const below = new Map(nodes.map((node) => [node.id, []]));
  const above = new Map(nodes.map((node) => [node.id, []]));
  for (const link of links) {
    below.get(link.source).push(link.target);
    above.get(link.target).push(link.source);
  }
  // Body links between posts of this category, shown as threads on the post plane.
  const sideLinks = graph.links
    .filter((link) => link.relation === "linked" && postIds.has(link.source) && postIds.has(link.target))
    .map((link) => ({ source: link.source, target: link.target }));
  return { domainId, nodes, links, sideLinks, byId, below, above };
}

export function layerCounts(map) {
  const counts = { category: 0, topic: 0, post: 0 };
  for (const node of map.nodes) counts[node.layer] += 1;
  return counts;
}

function nodesIn(map, layer) {
  return map.nodes.filter((node) => node.layer === layer);
}

/** Order topics so the ones sharing posts sit side by side (a greedy chain). */
function topicChain(map, topics) {
  const postsOf = (id) => new Set(map.below.get(id) ?? []);
  const shared = (a, b) => {
    const left = postsOf(a.id);
    let total = 0;
    for (const id of postsOf(b.id)) if (left.has(id)) total += 1;
    return total;
  };
  const remaining = [...topics].sort((a, b) => b.count - a.count || a.order - b.order);
  const chain = [];
  let current = remaining.shift();
  while (current) {
    chain.push(current);
    const last = current;
    remaining.sort((a, b) => shared(last, b) - shared(last, a) || b.count - a.count || a.order - b.order);
    current = remaining.shift();
  }
  // Put the most used topic near the middle, which keeps threads short.
  if (chain.length > 2) {
    const mid = [];
    chain.forEach((topic, index) => (index % 2 === 0 ? mid.push(topic) : mid.unshift(topic)));
    return mid;
  }
  return chain;
}

export function layoutFloorPlan(map) {
  const plan = new Map();
  const category = nodesIn(map, "category")[0];
  if (category) plan.set(category.id, { u: 0, v: -0.05 });

  const topics = topicChain(map, nodesIn(map, "topic"));
  const twoRows = topics.length > 6;
  topics.forEach((topic, index) => {
    const u = topics.length <= 1 ? 0 : -0.84 + (1.68 * index) / (topics.length - 1);
    const v = twoRows ? (index % 2 ? 0.26 : -0.34) : -0.05;
    plan.set(topic.id, { u, v });
  });

  const posts = nodesIn(map, "post");
  const anchored = new Map();
  const loose = [];
  for (const post of posts) {
    const parents = (map.above.get(post.id) ?? []).filter((id) => map.byId.get(id)?.layer === "topic").map((id) => plan.get(id)).filter(Boolean);
    if (parents.length) anchored.set(post.id, centroid(parents));
    else loose.push(post);
  }
  for (const [id, anchor] of anchored) {
    plan.set(id, { u: anchor.u + (hashFraction(`${id}:u`) - 0.5) * 0.12, v: anchor.v + 0.18 + (hashFraction(`${id}:v`) - 0.5) * 0.12 });
  }
  loose.forEach((post, index) => {
    const u = loose.length <= 1 ? 0 : -BOUND_U * 0.9 + (2 * BOUND_U * 0.9 * index) / (loose.length - 1);
    plan.set(post.id, { u, v: STRIP_V[index % 2] });
  });

  const movable = [...topics, ...posts];
  for (let step = 0; step < ITERATIONS; step += 1) {
    const cooling = 1 - step / ITERATIONS;
    const force = new Map(movable.map((node) => [node.id, { u: 0, v: 0 }]));
    const push = (id, du, dv) => {
      const current = force.get(id);
      if (current) force.set(id, { u: current.u + du, v: current.v + dv });
    };
    for (const post of posts) {
      const point = plan.get(post.id);
      const anchor = anchored.get(post.id);
      if (anchor) push(post.id, (anchor.u - point.u) * 0.1, (anchor.v + 0.18 - point.v) * 0.06);
      else push(post.id, 0, (STRIP_V[loose.indexOf(post) % 2] - point.v) * 0.1);
    }
    for (const link of map.links) {
      if (map.byId.get(link.source)?.layer !== "topic") continue;
      const a = plan.get(link.source);
      const b = plan.get(link.target);
      push(link.target, (a.u - b.u) * 0.05, 0);
      push(link.source, (b.u - a.u) * 0.006, 0);
    }
    for (const topic of topics) push(topic.id, -plan.get(topic.id).u * 0.004, 0);

    for (const layer of ["topic", "post"]) {
      const members = layer === "topic" ? topics : posts;
      const gap = MIN_GAP[layer];
      for (let i = 0; i < members.length; i += 1) {
        for (let j = i + 1; j < members.length; j += 1) {
          const a = plan.get(members[i].id);
          const b = plan.get(members[j].id);
          let du = b.u - a.u;
          let dv = (b.v - a.v) * V_WEIGHT;
          let dist = Math.hypot(du, dv);
          if (dist >= gap) continue;
          if (dist < 1e-6) {
            const angle = hashFraction(`${members[i].id}|${members[j].id}`) * Math.PI * 2;
            du = Math.cos(angle);
            dv = Math.sin(angle);
            dist = 1;
          }
          const overlap = ((gap - Math.hypot(b.u - a.u, (b.v - a.v) * V_WEIGHT)) / 2) * 0.85;
          const nu = du / dist;
          const nv = dv / dist;
          push(members[i].id, -nu * overlap, (-nv * overlap) / V_WEIGHT);
          push(members[j].id, nu * overlap, (nv * overlap) / V_WEIGHT);
        }
      }
    }

    const rate = 0.35 + 0.65 * cooling;
    for (const node of movable) {
      const point = plan.get(node.id);
      const delta = force.get(node.id);
      plan.set(node.id, {
        u: clamp(point.u + clamp(delta.u * rate, -0.06, 0.06), -BOUND_U, BOUND_U),
        v: clamp(point.v + clamp(delta.v * rate, -0.06, 0.06), -BOUND_V, BOUND_V),
      });
    }
  }
  for (const [id, point] of plan) plan.set(id, { u: Number(point.u.toFixed(3)), v: Number(point.v.toFixed(3)) });
  return plan;
}

export function minimumLayerGap(map, plan, layer) {
  const members = nodesIn(map, layer);
  let minimum = Number.POSITIVE_INFINITY;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const a = plan.get(members[i].id);
      const b = plan.get(members[j].id);
      minimum = Math.min(minimum, Math.hypot(b.u - a.u, (b.v - a.v) * V_WEIGHT));
    }
  }
  return minimum;
}

/* ── projection ──────────────────────────────────────────────── */

/** Slightly turned so the planes read as a stack. */
export const RAIL_CAMERA = { yaw: 0.28, tilt: 0.5 };
export const EXPLORER_CAMERA = { yaw: 0.34, tilt: 0.52 };
export const PLANE_HALF_DEPTH = 0.75;

function planeExtents(camera) {
  const cos = Math.cos(camera.yaw);
  const sin = Math.abs(Math.sin(camera.yaw));
  return {
    halfWidth: cos + PLANE_HALF_DEPTH * sin,
    halfHeight: (sin + PLANE_HALF_DEPTH * cos) * camera.tilt,
    depthSpan: (2 * PLANE_HALF_DEPTH * camera.tilt) / cos,
  };
}

export function computeViewport(spec) {
  const camera = spec.camera;
  const { halfWidth, halfHeight, depthSpan } = planeExtents(camera);
  const pads = spec.padTop + spec.padBottom + 2 * spec.clearance;
  let scale = Math.max(1, (spec.width - 2 * spec.padX) / (2 * halfWidth));
  if (spec.maxHeight) scale = Math.min(scale, Math.max(1, (spec.maxHeight - pads) / (2 * halfHeight + 2 * depthSpan)));
  if (spec.maxScale) scale = Math.min(scale, spec.maxScale);
  const spacing = depthSpan * scale + spec.clearance;
  const height = Math.ceil(spec.padTop + spec.padBottom + 2 * halfHeight * scale + 2 * spacing);
  const middle = spec.padTop + halfHeight * scale + spacing;
  const unfold = clamp(spec.unfold ?? 1, 0, 1);
  const gap = spacing * (0.28 + 0.72 * unfold);
  return {
    width: spec.width,
    height,
    scale,
    cx: spec.width / 2,
    centers: { category: middle - gap, topic: middle, post: middle + gap },
    spacing,
    camera,
    cos: Math.cos(camera.yaw),
    sin: Math.sin(camera.yaw),
    tilt: camera.tilt,
    rise: Math.sqrt(Math.max(0, 1 - camera.tilt * camera.tilt)),
  };
}

export function projectFloor(view, layer, point, lift = 0) {
  const x0 = point.u;
  const z0 = point.v * PLANE_HALF_DEPTH;
  const xr = x0 * view.cos + z0 * view.sin;
  const zr = -x0 * view.sin + z0 * view.cos;
  return { x: view.cx + xr * view.scale, y: view.centers[layer] + zr * view.tilt * view.scale - lift * view.rise };
}

/** Back-left, back-right, front-right, front-left. */
export function planeCorners(view, layer) {
  return [
    { u: -1, v: -1 },
    { u: 1, v: -1 },
    { u: 1, v: 1 },
    { u: -1, v: 1 },
  ].map((corner) => projectFloor(view, layer, corner));
}

/** A plane's visible thickness: the two edges meeting at its lowest corner, pushed down. */
export function slabPoints(corners, depth) {
  const bottom = corners.reduce((best, corner, index) => (corner.y > corners[best].y + 0.01 ? index : best), 0);
  const previous = corners[(bottom + corners.length - 1) % corners.length];
  const current = corners[bottom];
  const next = corners[(bottom + 1) % corners.length];
  const down = (point) => ({ x: point.x, y: point.y + depth });
  return [previous, current, next, down(next), down(current), down(previous)];
}

/* ── focus path ──────────────────────────────────────────────── */

/** The chosen node and everything above and below it through recorded links. */
export function focusPath(map, id) {
  if (!id || !map.byId.has(id)) return null;
  const nodes = new Set([id]);
  const links = new Set();
  const walk = (direction) => {
    const stack = [id];
    while (stack.length) {
      const current = stack.pop();
      for (const next of map[direction].get(current) ?? []) {
        links.add(direction === "below" ? linkKey(current, next) : linkKey(next, current));
        if (!nodes.has(next)) {
          nodes.add(next);
          stack.push(next);
        }
      }
    }
  };
  walk("below");
  walk("above");
  return { nodes, links };
}

/* ── labels ──────────────────────────────────────────────────── */

const LABEL_GAP = 4;

function sideBox(request, side) {
  const { x, y, radius, width, height } = request;
  if (side === "right") return { left: x + radius + LABEL_GAP, top: y - height / 2, width, height };
  if (side === "left") return { left: x - radius - LABEL_GAP - width, top: y - height / 2, width, height };
  if (side === "above") return { left: x - width / 2, top: y - radius - LABEL_GAP - height, width, height };
  return { left: x - width / 2, top: y + radius + LABEL_GAP, width, height };
}

function fitBox(box, side, bounds, anchorX) {
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  if (box.top < bounds.top || box.top + box.height > bottom) return null;
  if (side === "left" || side === "right") return box.left < bounds.left || box.left + box.width > right ? null : box;
  const left = clamp(box.left, bounds.left, right - box.width);
  if (left > anchorX - 2 || left + box.width < anchorX + 2) return null;
  return { ...box, left };
}

function overlapArea(a, b, pad = 0.5) {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left) + pad;
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) + pad;
  return width > 0 && height > 0 ? width * height : 0;
}

function hitsCircle(box, circle) {
  const nearestX = clamp(circle.x, box.left, box.left + box.width);
  const nearestY = clamp(circle.y, box.top, box.top + box.height);
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.r + 1;
}

/** Highest priority first; a label without a free spot is hidden unless forced. */
export function placeFloorLabels(requests, bounds, obstacles, reserved = []) {
  const placed = new Map();
  const ordered = [...requests].sort((a, b) => b.priority - a.priority || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const request of ordered) {
    let best = null;
    const blockers = [...reserved, ...[...placed.values()].map((item) => item.box)];
    const consider = (side, sideIndex, box) => {
      if (!box || (best && best.cost === 0)) return;
      let cost = 0;
      for (const other of blockers) cost += overlapArea(box, other) * 10;
      for (const obstacle of obstacles) if (obstacle.id !== request.id && hitsCircle(box, obstacle)) cost += 400;
      const ranked = cost === 0 ? 0 : cost + sideIndex;
      if (!best || ranked < best.cost) best = { side, box, cost: ranked };
    };
    request.sides.forEach((side, sideIndex) => {
      const centered = sideBox(request, side);
      consider(side, sideIndex, fitBox(centered, side, bounds, request.x));
      if (side === "left" || side === "right") {
        const nudge = request.height / 2 - 1;
        consider(side, sideIndex, fitBox({ ...centered, top: centered.top - nudge }, side, bounds, request.x));
        consider(side, sideIndex, fitBox({ ...centered, top: centered.top + nudge }, side, bounds, request.x));
        return;
      }
      for (const other of blockers) {
        const shared = Math.min(centered.top + centered.height, other.top + other.height) - Math.max(centered.top, other.top);
        if (shared <= 0) continue;
        consider(side, sideIndex, fitBox({ ...centered, left: other.left + other.width + 2 }, side, bounds, request.x));
        consider(side, sideIndex, fitBox({ ...centered, left: other.left - centered.width - 2 }, side, bounds, request.x));
      }
    });
    if (best && (best.cost === 0 || request.force)) placed.set(request.id, { id: request.id, side: best.side, box: best.box });
  }
  return placed;
}

/**
 * Which names are written on the planes. The category is always named; topics
 * are named when they fit; post titles appear on the chosen path, and in the
 * wide view wherever there is room.
 */
export function floorLabelPriority(map, node, { path, focusId, density }) {
  if (path && focusId) {
    if (node.id === focusId) return 1000;
    if (path.nodes.has(node.id)) {
      const direct = (map.above.get(focusId) ?? []).includes(node.id) || (map.below.get(focusId) ?? []).includes(node.id);
      if (node.layer === "category") return 700;
      if (node.layer === "topic") return 500 + (direct ? 50 : 0) + (node.count ?? 0);
      return 300 + (direct ? 50 : 0) - node.order * 0.01;
    }
    return node.layer === "category" ? 100 : null;
  }
  if (node.layer === "category") return 800;
  if (node.layer === "topic") return 400 + (node.count ?? 0);
  return density === "rich" ? 200 - node.order * 0.01 : null;
}

/** Title strip above each plane's left corner. */
export function planeTopAt(corners, x) {
  let top = null;
  corners.forEach((a, index) => {
    const b = corners[(index + 1) % corners.length];
    const low = Math.min(a.x, b.x);
    const high = Math.max(a.x, b.x);
    if (x < low - 0.01 || x > high + 0.01) return;
    const y = high - low < 0.01 ? Math.min(a.y, b.y) : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    top = top === null ? y : Math.min(top, y);
  });
  return top;
}

export function layerTitleBox(view, layer, width, height) {
  const corners = planeCorners(view, layer);
  const leftmost = corners.reduce((best, corner) => (corner.x < best.x ? corner : best), corners[0]);
  const left = Math.max(2, leftmost.x - 2);
  const right = left + width;
  const samples = [left, right, ...corners.map((corner) => corner.x).filter((x) => x > left && x < right)];
  const tops = samples.flatMap((x) => {
    const y = planeTopAt(corners, x);
    return y === null ? [] : [y];
  });
  const bottom = (tops.length ? Math.min(...tops) : leftmost.y) - 3;
  return { left, top: bottom - height, width, height };
}

export function titleClearance(camera, titleWidth, titleHeight) {
  const slope = Math.abs(Math.tan(camera.yaw)) * camera.tilt;
  return Math.ceil(titleHeight + 8 + slope * titleWidth);
}

/* ── scene ───────────────────────────────────────────────────── */

const LIFT = { category: 9, topic: 7, post: 6 };
const FOCUS_LIFT = 5;
export const MARK = { category: 5, topic: 3.6, post: 4 };
const TYPE = {
  rail: { category: 12, topic: 11, post: 11 },
  explorer: { category: 13, topic: 12, post: 12 },
};
export const FLOOR_HIT = {
  rail: { category: 26, topic: 18, post: 20 },
  explorer: { category: 30, topic: 22, post: 24 },
};
const TITLE_HEIGHT = 16;
const TITLE_FONT = 11.5;
const PADDING = {
  rail: { padX: 6, padTop: 24, padBottom: 10 },
  explorer: { padX: 28, padTop: 40, padBottom: 28 },
};

export const LAYER_TITLES = { category: "카테고리", topic: "주제", post: "글" };

export function layerTitleWidth(layer, count) {
  return 7 + 5 + estimateTextWidth(LAYER_TITLES[layer], TITLE_FONT, false, true) + 5 + estimateTextWidth(String(count), 11, true) + 8;
}

export function floorViewport(variant, width, { counts, maxHeight, unfold = 1 } = {}) {
  const camera = variant === "explorer" ? EXPLORER_CAMERA : RAIL_CAMERA;
  const titleWidth = Math.max(...FLOOR_LAYERS.map((layer) => layerTitleWidth(layer, counts?.[layer] ?? 0)));
  return computeViewport({
    width,
    camera,
    ...PADDING[variant],
    clearance: titleClearance(camera, titleWidth, TITLE_HEIGHT),
    maxHeight,
    unfold,
    maxScale: variant === "explorer" ? 300 : undefined,
  });
}

function boxesOverlap(a, b) {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

export function computeFloorScene({ map, plan, view, variant, focusId = null, currentId = null, density = "quiet" }) {
  const path = focusPath(map, focusId);
  const counts = layerCounts(map);
  const type = TYPE[variant] ?? TYPE.rail;
  const positions = new Map();
  for (const node of map.nodes) {
    const point = plan.get(node.id);
    if (!point) continue;
    const lift = path?.nodes.has(node.id) ? LIFT[node.layer] + (node.id === focusId ? FOCUS_LIFT : 0) : 0;
    positions.set(node.id, { base: projectFloor(view, node.layer, point), top: projectFloor(view, node.layer, point, lift), lift });
  }
  const states = new Map(
    map.nodes.map((node) => [node.id, !path ? (node.id === currentId ? "current" : "idle") : node.id === focusId ? "focus" : path.nodes.has(node.id) ? "path" : "dim"]),
  );
  const titles = FLOOR_LAYERS.filter((layer) => counts[layer] > 0).map((layer) => ({ layer, count: counts[layer], box: layerTitleBox(view, layer, layerTitleWidth(layer, counts[layer]), TITLE_HEIGHT) }));

  const requests = [];
  for (const node of map.nodes) {
    const position = positions.get(node.id);
    const priority = floorLabelPriority(map, node, { path, focusId, density });
    if (!position || priority === null) continue;
    const fontSize = type[node.layer];
    const x = position.top.x;
    const sides =
      node.layer === "category"
        ? ["above", "right", "left", "below"]
        : x > view.width * 0.64
          ? ["left", "below", "above", "right"]
          : x < view.width * 0.36
            ? ["right", "below", "above", "left"]
            : ["right", "left", "below", "above"];
    const text = node.layer === "topic" ? `#${node.label}` : node.label;
    requests.push({
      id: node.id,
      x,
      y: position.top.y,
      radius: MARK[node.layer] + 1,
      width: estimateTextWidth(text, fontSize, node.layer === "topic", node.layer === "category") + 8,
      height: Math.round(fontSize * 1.2 + 2),
      priority,
      sides,
      force: node.id === focusId || (!path && node.layer === "category"),
    });
  }
  const requested = new Set(requests.map((request) => request.id));
  const obstacles = map.nodes.flatMap((node) => {
    const position = positions.get(node.id);
    const blocks = path ? states.get(node.id) !== "dim" : node.layer === "category" || requested.has(node.id);
    return position && blocks ? [{ id: node.id, x: position.top.x, y: position.top.y, r: MARK[node.layer] }] : [];
  });
  const labels = placeFloorLabels(requests, { left: 2, top: 1, width: view.width - 4, height: view.height - 2 }, obstacles, path ? [] : titles.map((title) => title.box));
  const coveredTitles = new Set(titles.filter((title) => [...labels.values()].some((label) => boxesOverlap(label.box, title.box))).map((title) => title.layer));

  const threads = path
    ? map.links.flatMap((link) => {
        if (!path.links.has(linkKey(link.source, link.target))) return [];
        const a = positions.get(link.source)?.top;
        const b = positions.get(link.target)?.top;
        if (!a || !b) return [];
        return [{ key: linkKey(link.source, link.target), a, b, direct: link.source === focusId || link.target === focusId }];
      })
    : [];
  const sideThreads = map.sideLinks.flatMap((link) => {
    const a = positions.get(link.source)?.top;
    const b = positions.get(link.target)?.top;
    if (!a || !b) return [];
    const active = Boolean(path && (link.source === focusId || link.target === focusId));
    return [{ key: linkKey(link.source, link.target), a, b, active }];
  });

  return { path, counts, positions, states, titles, coveredTitles, requests, labels, threads, sideThreads, type };
}

/* ── keyboard ────────────────────────────────────────────────── */

export function isFloorKey(key) {
  return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key);
}

/**
 * ←→ along the same plane (screen order), ↑↓ to the plane above/below (a linked
 * node when there is one), Home/End to the ends of the plane.
 */
export function navigateFloor(map, positions, currentId, key) {
  const node = map.byId.get(currentId);
  const from = positions.get(currentId);
  if (!node || !from) return currentId;
  const ordered = (layer) =>
    map.nodes
      .filter((item) => item.layer === layer && positions.has(item.id))
      .sort((a, b) => positions.get(a.id).x - positions.get(b.id).x || positions.get(a.id).y - positions.get(b.id).y);
  const row = ordered(node.layer);
  const index = row.findIndex((item) => item.id === currentId);
  if (key === "ArrowLeft") return row[Math.max(0, index - 1)]?.id ?? currentId;
  if (key === "ArrowRight") return row[Math.min(row.length - 1, index + 1)]?.id ?? currentId;
  if (key === "Home") return row[0]?.id ?? currentId;
  if (key === "End") return row[row.length - 1]?.id ?? currentId;
  const layers = FLOOR_LAYERS.filter((layer) => ordered(layer).length);
  const target = layers[layers.indexOf(node.layer) + (key === "ArrowUp" ? -1 : 1)];
  if (!target) return currentId;
  const connected = (map[key === "ArrowUp" ? "above" : "below"].get(currentId) ?? []).filter((id) => positions.has(id) && map.byId.get(id).layer === target);
  const candidates = connected.length ? connected : ordered(target).map((item) => item.id);
  let best = currentId;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const id of candidates) {
    const point = positions.get(id);
    const dist = Math.abs(point.x - from.x) + 0.35 * Math.abs(point.y - from.y);
    if (dist < bestDistance) {
      best = id;
      bestDistance = dist;
    }
  }
  return best;
}

/* ── JSON ────────────────────────────────────────────────────── */

export function serializePlan(plan) {
  return Object.fromEntries([...plan].map(([id, point]) => [id, [point.u, point.v]]));
}

export function parsePlan(json) {
  return new Map(Object.entries(json ?? {}).map(([id, [u, v]]) => [id, { u, v }]));
}

export function sortByLabel(items) {
  return [...items].sort((a, b) => collator.compare(a.label, b.label));
}
