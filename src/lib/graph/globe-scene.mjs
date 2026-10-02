// One frame of the globe: projected stars, link tiers, cluster states, the
// centre, and placed labels. Pure — the Svelte canvas renders it and the tests
// read it. Ported from the portfolio's Graph3DCanvas scene computation.
import {
  CAMERA_DISTANCE,
  clamp,
  coreBox,
  DOMAIN_LABEL_HEIGHT,
  DOMAIN_SIDES,
  domainLabelFont,
  domainLabelWidth,
  equatorPath,
  estimateTextWidth,
  labelPriority3d,
  neighborhood,
  nodeRadius,
  nodeState,
  placeLabels3d,
  projectDomains,
  projectPoint,
  RAIL_PADDING,
} from "./globe-layout.mjs";

/** rail = right column, compact = small static globe (tablet/phone card), explorer = wide dialog. */
export const CANVAS_PADDING = {
  rail: RAIL_PADDING,
  compact: { padX: 4, padTop: 8, padBottom: 4 },
  explorer: { padX: 36, padTop: 36, padBottom: 28 },
};

const LABEL_FONT = { rail: 11, compact: 10.5, explorer: 12 };
const DOT_SCALE = { rail: 1, compact: 0.85, explorer: 1.3 };
/** Invisible hit area around a star (px). */
export const HIT = { rail: 14, compact: 0, explorer: 20 };
export const COARSE_HIT = 1.4;
/** Hover a category: its stars (1) and their direct neighbours elsewhere (2). */
export const PREVIEW_DEPTH = 2;

const TIER_ORDER = ["dim", "idle", "far", "near"];

export function labelFont(variant, width) {
  return variant === "rail" && width < 262 ? 10.5 : LABEL_FONT[variant];
}

export function domainFont(variant, width) {
  if (variant === "compact") return 10.5;
  if (variant === "explorer") return 12.5;
  return domainLabelFont(width);
}

function sidesFor(point, view) {
  return point.x > view.width * 0.62 ? ["left", "right", "below", "above"] : ["right", "left", "below", "above"];
}

function domainState(domain, hood, currentDomain) {
  if (!hood) return domain.id === currentDomain ? "current" : "idle";
  if (hood.kind === "domain") return hood.domain === domain.id ? "focus" : "dim";
  const members = [...domain.posts, ...domain.topics];
  return members.some((id) => hood.hops.get(id) === 0 || hood.hops.get(id) === 1) ? "near" : "dim";
}

function frontness(depth) {
  return clamp(6 - depth, 0, 2);
}

export function nodeLabelWidth(node, fontSize) {
  return estimateTextWidth(node.kind === "topic" ? `#${node.label}` : node.label, fontSize, node.kind === "topic", false) + 8;
}

/**
 * @param input.graph indexed graph (only the stars to draw)
 * @param input.focusId previewed/opened category key or a star id
 * @param input.starId hovered star (its name is added last, never pushing others)
 * @param input.currentId the article being read (marked, not haloed)
 * @param input.hiddenDomain category drawn by the opened layers instead
 */
export function computeGlobeScene(input) {
  const {
    graph,
    layout,
    view,
    camera,
    variant,
    focusId = null,
    depth = PREVIEW_DEPTH,
    density = "quiet",
    starId = null,
    currentId = null,
    hiddenDomain = null,
    previousSides,
  } = input;
  const hood = neighborhood(graph, focusId, depth);
  const grow = Math.pow(camera.zoom, 0.4) * DOT_SCALE[variant];
  const currentDomain = currentId ? graph.byId.get(currentId)?.domain ?? null : null;

  const points = new Map();
  for (const node of graph.nodes) {
    const position = layout.positions.get(node.id);
    if (!position) continue;
    const projected = projectPoint(view, camera, layout, position);
    const current = node.id === currentId ? 1.2 : 1;
    points.set(node.id, { ...projected, r: nodeRadius(node) * clamp(projected.scale, 0.72, 1.45) * grow * current });
  }
  const order = [...points.keys()].sort((a, b) => points.get(b).depth - points.get(a).depth || (a < b ? -1 : a > b ? 1 : 0));
  const rank = new Map(order.map((id, index) => [id, index]));
  const behind = order.filter((id) => points.get(id).depth > CAMERA_DISTANCE).length;
  const states = new Map(graph.nodes.map((node) => [node.id, nodeState(node, hood, currentId)]));

  const links = graph.links
    .flatMap((link) => {
      const a = points.get(link.source);
      const b = points.get(link.target);
      if (!a || !b) return [];
      const hop = hood?.links.get(link.key);
      const tier = !hood ? "idle" : hop === 1 ? "near" : hop !== undefined ? "far" : "dim";
      const cross = graph.byId.get(link.source).domain !== graph.byId.get(link.target).domain;
      return [{ key: link.key, source: link.source, target: link.target, relation: link.relation, tier, cross, a, b }];
    })
    .sort((left, right) => TIER_ORDER.indexOf(left.tier) - TIER_ORDER.indexOf(right.tier));

  const domains = projectDomains(graph, layout, view, camera)
    .map(({ domain, point, r }) => ({ domain, x: point.x, y: point.y, r: r * 1.15 + 6 * grow, fog: point.fog, depth: point.depth, state: domainState(domain, hood, currentDomain) }))
    .sort((a, b) => b.depth - a.depth);

  const core = { x: view.cx + camera.panX, y: view.cy + camera.panY, box: coreBox(view, camera) };
  const spokes = domains.map((item) => ({ domain: item.domain.id, x: item.x, y: item.y, state: item.state }));

  const fontSize = labelFont(variant, view.width);
  const domainSize = domainFont(variant, view.width);
  const sideOf = (id, base) => {
    const preferred = previousSides?.get(id);
    return preferred && base.includes(preferred) ? [preferred, ...base.filter((side) => side !== preferred)] : base;
  };
  const requests = [];
  for (const item of domains) {
    if (item.domain.id === hiddenDomain) continue;
    if (item.x < 0 || item.x > view.width || item.y < 0 || item.y > view.height) continue;
    const priority = !hood ? (item.state === "current" ? 950 : 900) : item.state === "focus" ? 1000 : item.state === "near" ? 520 : 200;
    requests.push({
      id: item.domain.key,
      x: item.x,
      y: item.y,
      radius: item.r * 0.45,
      width: domainLabelWidth(item.domain.label, item.domain.count, domainSize),
      height: variant === "compact" ? 16 : DOMAIN_LABEL_HEIGHT,
      priority: priority + frontness(item.depth) * 10,
      sides: sideOf(item.domain.key, DOMAIN_SIDES),
      force: hood?.kind === "domain" && hood.domain === item.domain.id,
      dotCost: hood ? 400 : 0,
    });
  }
  if (density === "rich") {
    for (const node of graph.nodes) {
      if (node.domain === hiddenDomain) continue;
      const point = points.get(node.id);
      const priority = labelPriority3d(node, { hood, density, zoom: camera.zoom });
      if (!point || priority === null) continue;
      if (point.x < 0 || point.x > view.width || point.y < 0 || point.y > view.height) continue;
      requests.push({
        id: node.id,
        x: point.x,
        y: point.y,
        radius: point.r + 1,
        width: nodeLabelWidth(node, fontSize),
        height: Math.round(fontSize * 1.2 + 2),
        priority: priority + (point.scale - 1) * 30,
        sides: sideOf(node.id, sidesFor(point, view)),
      });
    }
  }
  const requested = new Set(requests.map((request) => request.id));
  const obstacles = graph.nodes.flatMap((node) => {
    const point = points.get(node.id);
    const state = states.get(node.id);
    const blocks = hood ? state === "focus" || state === "near" : requested.has(node.id) || node.id === currentId;
    return point && blocks && node.domain !== hiddenDomain ? [{ id: node.id, x: point.x, y: point.y, r: point.r }] : [];
  });
  const bounds = { left: 2, top: 1, width: view.width - 4, height: view.height - 2 };
  const labels = placeLabels3d(requests, bounds, obstacles, [], [core.box]);

  const star = starId && variant !== "compact" ? graph.byId.get(starId) : null;
  const starPoint = star && star.domain !== hiddenDomain ? points.get(star.id) : null;
  if (star && starPoint && !labels.has(star.id) && starPoint.x >= 0 && starPoint.x <= view.width && starPoint.y >= 0 && starPoint.y <= view.height) {
    const request = {
      id: star.id,
      x: starPoint.x,
      y: starPoint.y,
      radius: starPoint.r + 1,
      width: nodeLabelWidth(star, fontSize),
      height: Math.round(fontSize * 1.2 + 2),
      priority: 0,
      sides: sidesFor(starPoint, view),
      force: true,
    };
    const placed = placeLabels3d([request], bounds, obstacles, [...labels.values()].map((label) => label.box), [core.box]).get(star.id);
    if (placed) labels.set(star.id, placed);
  }

  return { hood, points, order, behind, rank, states, links, labels, domains, core, spokes, equator: equatorPath(view, camera, layout), fontSize, domainSize };
}

/* ── opacity rules ───────────────────────────────────────────── */

export function nodeOpacity(state, fog) {
  if (state === "focus" || state === "current") return 1;
  if (state === "near") return 0.6 + 0.4 * fog;
  if (state === "far") return 0.6 * fog;
  if (state === "dim") return 0.16 * fog;
  return 0.78 * fog;
}

export function linkOpacity(tier, fog, cross = false) {
  if (tier === "near") return 0.85;
  if (tier === "far") return 0.3 + 0.22 * fog;
  if (tier === "dim") return 0.04 * fog;
  return (cross ? 0.1 : 0.22) * fog;
}

export function haloOpacity(state, fog) {
  return state === "focus" ? 0.08 * fog : 0;
}

/* ── keyboard: move between categories in screen space ───────── */

const NAV_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
const DIRECTION = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

export function isNavKey(key) {
  return NAV_KEYS.includes(key);
}

/**
 * Arrows: nearest category on screen in that direction (±60°). Home/End: first
 * and last. PageUp/PageDown: previous/next in list order (wrapping).
 */
export function navigateDomains(domains, targets, currentId, key) {
  const visible = domains.filter((domain) => targets.has(domain.key));
  if (!visible.length) return currentId;
  const index = visible.findIndex((domain) => domain.key === currentId);
  if (key === "Home") return visible[0].key;
  if (key === "End") return visible[visible.length - 1].key;
  if (key === "PageUp" || key === "PageDown") {
    if (index < 0) return visible[0].key;
    return visible[(index + (key === "PageDown" ? 1 : -1) + visible.length) % visible.length].key;
  }
  const from = targets.get(currentId);
  if (!from) return visible[0].key;
  const d = DIRECTION[key];
  let best = currentId;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [id, target] of targets) {
    if (id === currentId) continue;
    const vx = target.x - from.x;
    const vy = target.y - from.y;
    const along = vx * d.x + vy * d.y;
    if (along <= 0.5) continue;
    const across = Math.abs(vx * d.y - vy * d.x);
    if (across > along * Math.tan(Math.PI / 3)) continue;
    const score = Math.hypot(vx, vy) * (1 + across / Math.max(1, along));
    if (score < bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return best;
}
