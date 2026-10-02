// Knowledge globe geometry, ported from the portfolio's knowledgeGraph3d layout.
// The origin is "Me" and stays empty; categories sit as clusters on the shell
// around it, and their posts and topics are the stars. Everything is
// deterministic (no randomness), so the same content always gives the same
// globe. Pure functions only — shared by the build (layout) and the browser
// (projection, labels, picking).

/* ── constants ───────────────────────────────────────────────── */

/** Vertical stretch of the shell the category anchors sit on. */
const ANCHOR_Y_SCALE = 1.12;
const SHELL_STRENGTH = 0.09;
/** Stars keep at least this distance from the centre (shell radius 1). */
export const CORE_CLEARANCE = 0.6;
const REST_IN = 0.2;
const REST_CROSS = 0.42;
const SPRING_IN = 0.7;
const SPRING_CROSS = 0.3;
const CHARGE = -0.006;
const CHARGE_RANGE = 0.45;
const CLUSTER_STRENGTH = 0.07;
const BRIDGE_RELEASE = 0.6;
const COLLIDE_RADIUS = 0.06;
const ITERATIONS = 320;
const START_ALPHA = 0.8;
const ALPHA_MIN = 0.002;
const VELOCITY_DECAY = 0.42;

export const CAMERA_DISTANCE = 4.8;
export const DEFAULT_PITCH = 0.34;
export const PITCH_LIMITS = [0.06, 0.62];
export const ZOOM_LIMITS = [1, 2.8];
export const FOG_STRENGTH = 0.56;
export const INTRO_SWEEP = 0.55;
export const INTRO_MS = 1100;
export const FORWARD_ZOOM = 1.3;

export const DOMAIN_FONT = 12;
export const DOMAIN_LABEL_HEIGHT = 18;
export const DOMAIN_COUNT_FONT = 10.5;
export const DOMAIN_SIDES = ["center", "above", "below", "right", "left"];

export const RAIL_PADDING = { padX: 6, padTop: 12, padBottom: 6 };
/** Rail frame height / width (CSS `.kg3-frame { aspect-ratio: 5 / 6 }`). */
export const RAIL_ASPECT = 6 / 5;
/** Rail frame widths to keep the first view legible at (narrow → wide rail). */
export const RAIL_WIDTHS = [252, 292, 336];
/** Area around the centre kept free of labels: the "Me" orb and its hover tag below it. */
export const CORE_RESERVE = { width: 44, above: 14, below: 36 };

/* ── helpers ─────────────────────────────────────────────────── */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function hash01(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/** Text width estimate: Hangul ≈ 1em, Latin narrower, mono 0.6em. */
export function estimateTextWidth(text, fontSize, mono = false, bold = false) {
  let em = 0;
  for (const char of String(text ?? "")) {
    const code = char.codePointAt(0) ?? 0;
    const wide = (code >= 0x1100 && code <= 0x11ff) || (code >= 0x3000 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7a3);
    if (wide) em += mono ? 1 : 0.94;
    else if (mono) em += 0.6;
    else if (char === " ") em += 0.28;
    else if (/[A-Z]/.test(char)) em += 0.66;
    else if (/[a-z]/.test(char)) em += 0.54;
    else if (/[0-9]/.test(char)) em += 0.58;
    else if (/[.,:;·'|!]/.test(char)) em += 0.3;
    else em += 0.45;
  }
  return Math.ceil(em * fontSize * (bold ? 1.04 : 1));
}

/* ── 1) category anchors ─────────────────────────────────────── */

/** Evenly spread slots on the shell (Fibonacci spiral, top to bottom). */
export function anchorSlots(count) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, index) => {
    const y = count === 1 ? 0 : 1 - (2 * (index + 0.5)) / count;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = index * golden;
    return { x: round(Math.cos(theta) * r), y: round(y * ANCHOR_Y_SCALE), z: round(Math.sin(theta) * r) };
  });
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** How strongly two categories are connected (edges crossing between their clusters). */
export function domainAffinity(graph) {
  const weights = new Map();
  for (const link of graph.links) {
    const a = graph.byId.get(link.source)?.domain;
    const b = graph.byId.get(link.target)?.domain;
    if (!a || !b || a === b) continue;
    const key = pairKey(a, b);
    weights.set(key, (weights.get(key) ?? 0) + 1);
  }
  return weights;
}

/** Assign categories to slots so connected categories end up near each other. */
export function domainAnchors(graph) {
  const ids = graph.domains.map((domain) => domain.id);
  const count = ids.length;
  const slots = anchorSlots(count);
  const affinity = domainAffinity(graph);
  const weight = ids.map((a) => ids.map((b) => (a === b ? 0 : affinity.get(pairKey(a, b)) ?? 0)));
  const gap = slots.map((p) => slots.map((q) => distance(p, q)));
  const cost = (slotOf) => {
    let total = 0;
    for (let i = 0; i < count; i += 1) for (let j = i + 1; j < count; j += 1) total += weight[i][j] * gap[slotOf[i]][slotOf[j]];
    return total;
  };
  let best = ids.map((_, index) => index);
  let bestCost = cost(best);
  if (count <= 8) {
    const used = new Array(count).fill(false);
    const current = [];
    const walk = () => {
      if (current.length === count) {
        const total = cost(current);
        if (total < bestCost - 1e-9) {
          bestCost = total;
          best = [...current];
        }
        return;
      }
      for (let slot = 0; slot < count; slot += 1) {
        if (used[slot]) continue;
        used[slot] = true;
        current.push(slot);
        walk();
        current.pop();
        used[slot] = false;
      }
    };
    walk();
  } else {
    for (let improved = true; improved; ) {
      improved = false;
      for (let i = 0; i < count; i += 1) {
        for (let j = i + 1; j < count; j += 1) {
          const trial = [...best];
          [trial[i], trial[j]] = [trial[j], trial[i]];
          const total = cost(trial);
          if (total < bestCost - 1e-9) {
            best = trial;
            bestCost = total;
            improved = true;
          }
        }
      }
    }
  }
  return new Map(ids.map((id, index) => [id, slots[best[index]]]));
}

/* ── 2) stars ────────────────────────────────────────────────── */

/** Share of a star's edges that leave its own cluster (bridges sit between clusters). */
export function bridgeFraction(graph, id) {
  const node = graph.byId.get(id);
  const others = graph.neighbors.get(id) ?? [];
  if (!node || !others.length) return 0;
  return others.filter((other) => graph.byId.get(other).domain !== node.domain).length / others.length;
}

function clusterMembers(graph, domain) {
  return graph.nodes.filter((node) => node.domain === domain.id).map((node) => node.id);
}

export function initialPositions(graph, anchors) {
  const start = new Map();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (const domain of graph.domains) {
    const anchor = anchors.get(domain.id);
    const members = clusterMembers(graph, domain);
    const shell = 0.08 + 0.035 * Math.sqrt(members.length);
    members.forEach((id, index) => {
      const y = members.length === 1 ? 0 : 1 - (2 * (index + 0.5)) / members.length;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = index * golden + hash01(domain.id) * Math.PI * 2;
      let point = { x: anchor.x + Math.cos(theta) * r * shell, y: anchor.y + y * shell, z: anchor.z + Math.sin(theta) * r * shell };
      const others = (graph.neighbors.get(id) ?? []).map((other) => graph.byId.get(other).domain).filter((other) => other !== domain.id && anchors.has(other));
      if (others.length) {
        const target = others.reduce(
          (sum, other) => {
            const a = anchors.get(other);
            return { x: sum.x + a.x / others.length, y: sum.y + a.y / others.length, z: sum.z + a.z / others.length };
          },
          { x: 0, y: 0, z: 0 },
        );
        const pull = 0.3 * bridgeFraction(graph, id);
        point = { x: point.x + (target.x - anchor.x) * pull, y: point.y + (target.y - anchor.y) * pull, z: point.z + (target.z - anchor.z) * pull };
      }
      start.set(id, point);
    });
  }
  return start;
}

function shellRadius(point) {
  return Math.hypot(point.x, point.y / ANCHOR_Y_SCALE, point.z);
}

/** A 3D force layout (springs, local repulsion, cluster pull, shell pull) — d3-force style, no randomness. */
export function relax(graph, anchors, start, iterations = ITERATIONS) {
  const bodies = graph.nodes
    .filter((node) => start.has(node.id) && anchors.has(node.domain))
    .map((node) => {
      const point = start.get(node.id);
      return {
        id: node.id,
        anchor: anchors.get(node.domain),
        pull: CLUSTER_STRENGTH * (1 - BRIDGE_RELEASE * bridgeFraction(graph, node.id)),
        x: point.x,
        y: point.y,
        z: point.z,
        vx: 0,
        vy: 0,
        vz: 0,
      };
    });
  const byId = new Map(bodies.map((body) => [body.id, body]));
  const degree = (id) => Math.max(1, graph.neighbors.get(id)?.length ?? 1);
  const springs = graph.links.flatMap((link) => {
    const source = byId.get(link.source);
    const target = byId.get(link.target);
    if (!source || !target) return [];
    const same = graph.byId.get(link.source).domain === graph.byId.get(link.target).domain;
    const ds = degree(link.source);
    const dt = degree(link.target);
    return [{ source, target, distance: same ? REST_IN : REST_CROSS, strength: (same ? SPRING_IN : SPRING_CROSS) / Math.min(ds, dt), bias: ds / (ds + dt) }];
  });
  let alpha = START_ALPHA;
  const decay = 1 - Math.pow(ALPHA_MIN / START_ALPHA, 1 / Math.max(1, iterations));

  for (let step = 0; step < iterations; step += 1) {
    alpha -= alpha * decay;

    for (const spring of springs) {
      const { source, target } = spring;
      let dx = target.x + target.vx - source.x - source.vx;
      let dy = target.y + target.vy - source.y - source.vy;
      let dz = target.z + target.vz - source.z - source.vz;
      const length = Math.hypot(dx, dy, dz) || 1e-6;
      const k = ((length - spring.distance) / length) * alpha * spring.strength;
      dx *= k;
      dy *= k;
      dz *= k;
      target.vx -= dx * spring.bias;
      target.vy -= dy * spring.bias;
      target.vz -= dz * spring.bias;
      source.vx += dx * (1 - spring.bias);
      source.vy += dy * (1 - spring.bias);
      source.vz += dz * (1 - spring.bias);
    }

    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j += 1) {
        const b = bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const squared = Math.max(dx * dx + dy * dy + dz * dz, 0.0004);
        if (squared > CHARGE_RANGE * CHARGE_RANGE) continue;
        const w = (CHARGE * alpha) / squared;
        a.vx += dx * w;
        a.vy += dy * w;
        a.vz += dz * w;
        b.vx -= dx * w;
        b.vy -= dy * w;
        b.vz -= dz * w;
      }
    }

    for (const body of bodies) {
      body.vx += (body.anchor.x - body.x) * body.pull * alpha;
      body.vy += (body.anchor.y - body.y) * body.pull * alpha;
      body.vz += (body.anchor.z - body.z) * body.pull * alpha;
      const shell = shellRadius(body);
      if (shell > 1e-6) {
        const radial = ((1 - shell) * SHELL_STRENGTH * alpha) / shell;
        body.vx += body.x * radial;
        body.vy += body.y * radial;
        body.vz += body.z * radial;
      }
      body.vx *= 1 - VELOCITY_DECAY;
      body.vy *= 1 - VELOCITY_DECAY;
      body.vz *= 1 - VELOCITY_DECAY;
      body.x += body.vx;
      body.y += body.vy;
      body.z += body.vz;
    }

    const minimum = COLLIDE_RADIUS * 2;
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j += 1) {
        const b = bodies[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dz = b.z - a.z;
        let gap = Math.hypot(dx, dy, dz);
        if (gap >= minimum) continue;
        if (gap < 1e-6) {
          const angle = hash01(`${a.id}|${b.id}`) * Math.PI * 2;
          dx = Math.cos(angle);
          dy = 0;
          dz = Math.sin(angle);
          gap = 1;
        }
        const push = ((minimum - Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)) / 2) * 0.7;
        a.x -= (dx / gap) * push;
        a.y -= (dy / gap) * push;
        a.z -= (dz / gap) * push;
        b.x += (dx / gap) * push;
        b.y += (dy / gap) * push;
        b.z += (dz / gap) * push;
      }
    }

    // Keep the centre free for "Me".
    for (const body of bodies) {
      const shell = shellRadius(body);
      if (shell >= CORE_CLEARANCE) continue;
      if (shell < 1e-6) {
        const angle = hash01(body.id) * Math.PI * 2;
        body.x = Math.cos(angle) * CORE_CLEARANCE;
        body.y = 0;
        body.z = Math.sin(angle) * CORE_CLEARANCE;
        continue;
      }
      const scale = CORE_CLEARANCE / shell;
      body.x *= scale;
      body.y *= scale;
      body.z *= scale;
    }
  }
  return new Map(bodies.map((body) => [body.id, { x: body.x, y: body.y, z: body.z }]));
}

/* ── 3) normalise ────────────────────────────────────────────── */

function horizontalReach(raw) {
  let reach = 1e-6;
  for (const point of raw.values()) reach = Math.max(reach, Math.hypot(point.x, point.z));
  return reach;
}

export function normalizeLayout(raw) {
  const radius = horizontalReach(raw);
  return new Map([...raw].map(([id, point]) => [id, { x: round(point.x / radius), y: round(point.y / radius), z: round(point.z / radius) }]));
}

export function domainGeometry(graph, positions) {
  const centers = new Map();
  const spread = new Map();
  for (const domain of graph.domains) {
    const points = clusterMembers(graph, domain).map((id) => positions.get(id)).filter(Boolean);
    if (!points.length) continue;
    const center = { x: round(mean(points.map((p) => p.x))), y: round(mean(points.map((p) => p.y))), z: round(mean(points.map((p) => p.z))) };
    centers.set(domain.id, center);
    spread.set(domain.id, round(Math.sqrt(mean(points.map((p) => distance(p, center) ** 2)))));
  }
  return { centers, spread };
}

/* ── projection ──────────────────────────────────────────────── */

export function defaultCamera(layout) {
  return { yaw: layout.yaw, pitch: DEFAULT_PITCH, zoom: 1, panX: 0, panY: 0 };
}

/** Camera space: x right, y up, z towards the camera. */
export function toCamera(point, yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = point.x * cy + point.z * sy;
  const z1 = -point.x * sy + point.z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return { x: x1, y: point.y * cp - z1 * sp, z: point.y * sp + z1 * cp };
}

/** Fit the globe into a frame so rotating or tilting never leaves it or rescales it. */
export function fitView(layout, width, height, padding) {
  const points = [...layout.positions.values()];
  let maxX = 1e-6;
  let maxY = -Infinity;
  let minY = Infinity;
  for (const pitch of [PITCH_LIMITS[0], DEFAULT_PITCH, PITCH_LIMITS[1]]) {
    for (let step = 0; step < 24; step += 1) {
      const yaw = (step / 24) * Math.PI * 2;
      for (const point of points) {
        const c = toCamera(point, yaw, pitch);
        const s = 1 / (CAMERA_DISTANCE - c.z);
        maxX = Math.max(maxX, Math.abs(c.x * s));
        maxY = Math.max(maxY, c.y * s);
        minY = Math.min(minY, c.y * s);
      }
    }
  }
  if (!Number.isFinite(maxY) || !Number.isFinite(minY)) {
    maxY = 0.2;
    minY = -0.2;
  }
  const innerWidth = Math.max(1, width - 2 * padding.padX);
  const innerHeight = Math.max(1, height - padding.padTop - padding.padBottom);
  const focal = Math.max(1, Math.min(innerWidth / (2 * maxX), innerHeight / Math.max(1e-6, maxY - minY)));
  const slack = innerHeight - (maxY - minY) * focal;
  return { width, height, focal, cx: width / 2, cy: padding.padTop + slack / 2 + maxY * focal };
}

export function projectPoint(view, camera, layout, point) {
  const c = toCamera(point, camera.yaw, camera.pitch);
  const depth = CAMERA_DISTANCE - c.z;
  const s = (view.focal * camera.zoom) / depth;
  const t = clamp((depth - (CAMERA_DISTANCE - layout.radius)) / (2 * layout.radius), 0, 1);
  return { x: view.cx + camera.panX + c.x * s, y: view.cy + camera.panY - c.y * s, scale: CAMERA_DISTANCE / depth, depth, fog: 1 - FOG_STRENGTH * t };
}

/** The shell's equator, projected — shows the globe's tilt and turn. */
export function equatorPath(view, camera, layout, segments = 48) {
  let d = "";
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const point = projectPoint(view, camera, layout, { x: Math.cos(angle) * layout.shell, y: 0, z: Math.sin(angle) * layout.shell });
    d += `${index === 0 ? "M" : "L"} ${Math.round(point.x * 10) / 10} ${Math.round(point.y * 10) / 10} `;
  }
  return `${d}Z`;
}

export function clampCamera(camera, view) {
  const zoom = clamp(camera.zoom, ZOOM_LIMITS[0], ZOOM_LIMITS[1]);
  const limitX = view ? (view.width / 2) * (zoom - 1) : 0;
  const limitY = view ? (view.height / 2) * (zoom - 1) : 0;
  return {
    yaw: camera.yaw,
    pitch: clamp(camera.pitch, PITCH_LIMITS[0], PITCH_LIMITS[1]),
    zoom,
    panX: limitX > 0 ? clamp(camera.panX, -limitX, limitX) : 0,
    panY: limitY > 0 ? clamp(camera.panY, -limitY, limitY) : 0,
  };
}

/** Zoom keeping the point under (px, py) fixed (wheel, pinch). */
export function zoomAt(camera, view, factor, px, py) {
  const zoom = clamp(camera.zoom * factor, ZOOM_LIMITS[0], ZOOM_LIMITS[1]);
  const ratio = zoom / camera.zoom;
  return clampCamera(
    { ...camera, zoom, panX: px - view.cx - (px - view.cx - camera.panX) * ratio, panY: py - view.cy - (py - view.cy - camera.panY) * ratio },
    view,
  );
}

export function lerpCamera(from, to, t) {
  const mix = (a, b) => a + (b - a) * t;
  return { yaw: mix(from.yaw, to.yaw), pitch: mix(from.pitch, to.pitch), zoom: mix(from.zoom, to.zoom), panX: mix(from.panX, to.panX), panY: mix(from.panY, to.panY) };
}

/** Turn towards `to` the short way round, even after several spins. */
export function nearestYaw(from, to) {
  const turn = to.yaw - from.yaw;
  return { ...to, yaw: from.yaw + turn - 2 * Math.PI * Math.round(turn / (2 * Math.PI)) };
}

/* ── labels ──────────────────────────────────────────────────── */

const LABEL_GAP = 4;

function overlapArea(a, b, pad = 0.5) {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left) + pad;
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) + pad;
  return width > 0 && height > 0 ? width * height : 0;
}

export function boxesOverlap(a, b) {
  return overlapArea(a, b, 0) > 0;
}

function hitsDot(box, dot) {
  const nearestX = clamp(dot.x, box.left, box.left + box.width);
  const nearestY = clamp(dot.y, box.top, box.top + box.height);
  return Math.hypot(dot.x - nearestX, dot.y - nearestY) < dot.r + 1;
}

function candidateBoxes(request, side) {
  const { x, y, radius, width, height } = request;
  if (side === "center") {
    const left = x - width / 2;
    const top = y - height / 2;
    return [0, -(height * 0.75), height * 0.75].map((shift) => ({ left, top: top + shift, width, height }));
  }
  if (side === "right" || side === "left") {
    const left = side === "right" ? x + radius + LABEL_GAP : x - radius - LABEL_GAP - width;
    const middle = y - height / 2;
    return [0, -(height / 2 - 1), height / 2 - 1, -(height - 2), height - 2, -(height * 1.5 - 3), height * 1.5 - 3].map((shift) => ({ left, top: middle + shift, width, height }));
  }
  const top = side === "above" ? y - radius - LABEL_GAP - height : y + radius + LABEL_GAP;
  return [x - width / 2, x - 8, x - width + 8, x - width / 2 - width / 3, x - width / 2 + width / 3].map((left) => ({ left, top, width, height }));
}

/**
 * Place labels without overlaps, inside `bounds`, highest priority first. A label
 * that finds no free spot is hidden (its dot and the panel still carry it) unless
 * it is `force`d. `hard` boxes are never covered — the centre ("Me").
 */
export function placeLabels3d(requests, bounds, obstacles, fixed = [], hard = []) {
  const placed = new Map();
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  const ordered = [...requests].sort((a, b) => b.priority - a.priority || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const request of ordered) {
    const blockers = [...fixed, ...[...placed.values()].map((item) => item.box)];
    const dotCost = request.dotCost ?? 400;
    let best = null;
    for (let sideIndex = 0; sideIndex < request.sides.length && best?.cost !== 0; sideIndex += 1) {
      const side = request.sides[sideIndex];
      const boxes = candidateBoxes(request, side);
      for (let index = 0; index < boxes.length && best?.cost !== 0; index += 1) {
        const box = boxes[index];
        if (box.left < bounds.left || box.left + box.width > right || box.top < bounds.top || box.top + box.height > bottom) continue;
        if (hard.some((other) => overlapArea(box, other, 0) > 0)) continue;
        let cost = 0;
        for (const other of blockers) cost += overlapArea(box, other) * 10;
        if (dotCost > 0) for (const dot of obstacles) if (dot.id !== request.id && hitsDot(box, dot)) cost += dotCost;
        const ranked = cost === 0 ? 0 : cost + sideIndex * 4 + index;
        if (!best || ranked < best.cost) best = { side, box, cost: ranked };
      }
    }
    if (best && (best.cost === 0 || request.force)) placed.set(request.id, { id: request.id, side: best.side, box: best.box });
  }
  return placed;
}

/** Category label width: name + post count (matches `.kg3-domain` padding). */
export function domainLabelWidth(name, count, fontSize = DOMAIN_FONT) {
  return estimateTextWidth(name, fontSize, false, true) + 5 + estimateTextWidth(String(count), DOMAIN_COUNT_FONT, true) + 12;
}

export function domainLabelFont(width) {
  return width < 262 ? 11 : DOMAIN_FONT;
}

function railProbeViews(layout) {
  return RAIL_WIDTHS.map((width) => fitView(layout, width, Math.round(width * RAIL_ASPECT), RAIL_PADDING));
}

export function projectDomains(graph, layout, view, camera) {
  return graph.domains.flatMap((domain) => {
    const center = layout.centers.get(domain.id);
    if (!center) return [];
    const point = projectPoint(view, camera, layout, center);
    return [{ domain, point, r: (layout.spread.get(domain.id) ?? 0.2) * ((view.focal * camera.zoom) / point.depth) }];
  });
}

/** The labels-free box around the centre for a view. */
export function coreBox(view, camera) {
  const x = view.cx + camera.panX;
  const y = view.cy + camera.panY;
  return { left: x - CORE_RESERVE.width / 2, top: y - CORE_RESERVE.above, width: CORE_RESERVE.width, height: CORE_RESERVE.above + CORE_RESERVE.below };
}

/** Category labels that cannot be placed at this yaw, summed over rail widths. */
export function domainLabelMisses(graph, layout, yaw, views = railProbeViews(layout)) {
  const camera = { yaw, pitch: DEFAULT_PITCH, zoom: 1, panX: 0, panY: 0 };
  let misses = 0;
  for (const view of views) {
    const fontSize = domainLabelFont(view.width);
    const requests = projectDomains(graph, layout, view, camera).map(({ domain, point, r }) => ({
      id: domain.key,
      x: point.x,
      y: point.y,
      radius: r * 0.5,
      width: domainLabelWidth(domain.label, domain.count, fontSize),
      height: DOMAIN_LABEL_HEIGHT,
      priority: 900 + (point.scale - 1) * 30,
      sides: DOMAIN_SIDES,
      dotCost: 0,
    }));
    misses += requests.length - placeLabels3d(requests, { left: 2, top: 1, width: view.width - 4, height: view.height - 2 }, [], [], [coreBox(view, camera)]).size;
  }
  return misses;
}

const CORE_GAP = 0.34;

/** Penalty for clusters crowding each other or the centre on screen. */
export function domainCrowding(graph, layout, yaw, pitch = DEFAULT_PITCH) {
  const screen = graph.domains.flatMap((domain) => {
    const center = layout.centers.get(domain.id);
    if (!center) return [];
    const c = toCamera(center, yaw, pitch);
    const s = CAMERA_DISTANCE / (CAMERA_DISTANCE - c.z);
    return [{ x: c.x * s, y: -c.y * s }];
  });
  let penalty = 0;
  for (let i = 0; i < screen.length; i += 1) {
    for (let j = i + 1; j < screen.length; j += 1) {
      const gap = Math.hypot(screen[i].x - screen[j].x, screen[i].y - screen[j].y);
      if (gap < 0.5) penalty += (0.5 - gap) ** 2;
    }
    const core = Math.hypot(screen[i].x, screen[i].y);
    if (core < CORE_GAP) penalty += 4 * (CORE_GAP - core) ** 2;
  }
  return penalty;
}

/**
 * First view: of 36 directions, one where every category label fits the rail
 * and clusters separate best. With `prefer`, that category is also turned to
 * the near side of the globe (the current article's context).
 */
export function chooseYaw(graph, layout, { prefer = null } = {}) {
  const views = railProbeViews(layout);
  const preferred = prefer ? layout.centers.get(prefer) : null;
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let step = 0; step < 36; step += 1) {
    const yaw = round((step / 36) * Math.PI * 2);
    let score = 100 * domainLabelMisses(graph, layout, yaw, views) + domainCrowding(graph, layout, yaw);
    if (preferred) score += 6 * Math.max(0, 0.45 - toCamera(preferred, yaw, DEFAULT_PITCH).z / Math.max(1e-6, Math.hypot(preferred.x, preferred.z)));
    if (score < bestScore - 1e-9) {
      best = yaw;
      bestScore = score;
    }
  }
  return best;
}

/** Camera that brings a category to the front, centre, a little closer — before it unfolds. */
export function forwardCamera(layout, domainId, zoom = FORWARD_ZOOM) {
  const center = layout.centers.get(domainId);
  if (!center) return { yaw: layout.yaw ?? 0, pitch: DEFAULT_PITCH, zoom, panX: 0, panY: 0 };
  const flat = Math.max(1e-6, Math.hypot(center.x, center.z));
  return { yaw: Math.atan2(-center.x, center.z), pitch: clamp(Math.atan2(center.y, flat) * 0.9, -1, 1.1), zoom, panX: 0, panY: 0 };
}

/* ── whole layout ────────────────────────────────────────────── */

export function layoutGlobe(graph) {
  let positions = new Map();
  let shell = 1;
  if (graph.nodes.length && graph.domains.length) {
    const anchors = domainAnchors(graph);
    const raw = relax(graph, anchors, initialPositions(graph, anchors));
    positions = normalizeLayout(raw);
    shell = round(1 / horizontalReach(raw));
  }
  const { centers, spread } = domainGeometry(graph, positions);
  const points = [...positions.values()];
  const base = { positions, centers, spread, radius: Math.max(0.5, ...points.map((point) => Math.hypot(point.x, point.y, point.z))), shell };
  const yaw = graph.nodes.length ? chooseYaw(graph, base) : 0;
  const facing = new Map(graph.domains.filter((domain) => centers.has(domain.id)).map((domain) => [domain.id, chooseYaw(graph, base, { prefer: domain.id })]));
  return { ...base, yaw, facing };
}

/** JSON-friendly form ([x, y, z] arrays) and back. */
export function serializeGlobe(layout) {
  const triple = (point) => [point.x, point.y, point.z];
  return {
    positions: Object.fromEntries([...layout.positions].map(([id, point]) => [id, triple(point)])),
    centers: Object.fromEntries([...layout.centers].map(([id, point]) => [id, triple(point)])),
    spread: Object.fromEntries(layout.spread),
    radius: layout.radius,
    shell: layout.shell,
    yaw: layout.yaw,
    facing: Object.fromEntries(layout.facing ?? []),
  };
}

export function parseGlobe(json) {
  const vec = ([x, y, z]) => ({ x, y, z });
  return {
    positions: new Map(Object.entries(json?.positions ?? {}).map(([id, value]) => [id, vec(value)])),
    centers: new Map(Object.entries(json?.centers ?? {}).map(([id, value]) => [id, vec(value)])),
    spread: new Map(Object.entries(json?.spread ?? {})),
    radius: Number(json?.radius) || 0.5,
    shell: Number(json?.shell) || 1,
    yaw: Number(json?.yaw) || 0,
    facing: new Map(Object.entries(json?.facing ?? {})),
  };
}

/* ── stars: size, state, label priority ──────────────────────── */

/** Dot size depends only on the kind of star — not on link counts. */
export function nodeRadius(node) {
  return node.kind === "topic" ? 2.6 : 3.2;
}

/** Ids of the stars around a focus (a star, or a category key `category:<id>`). */
export function neighborhood(graph, id, depth = 2) {
  if (!id) return null;
  const hops = new Map();
  let kind = null;
  let domain = null;
  const grow = (start, from) => {
    let frontier = start;
    for (let hop = from + 1; hop <= depth && frontier.length; hop += 1) {
      const next = [];
      for (const current of frontier) {
        for (const other of graph.neighbors.get(current) ?? []) {
          if (hops.has(other)) continue;
          hops.set(other, hop);
          next.push(other);
        }
      }
      frontier = next;
    }
  };
  if (graph.byId.has(id)) {
    kind = "node";
    hops.set(id, 0);
    grow([id], 0);
  } else if (graph.domainByKey?.has(id)) {
    kind = "domain";
    const item = graph.domainByKey.get(id);
    domain = item.id;
    const members = [...item.posts, ...item.topics].filter((member) => graph.byId.has(member));
    for (const member of members) hops.set(member, 1);
    grow(members, 1);
  } else {
    return null;
  }
  const links = new Map();
  for (const link of graph.links) {
    const a = hops.get(link.source);
    const b = hops.get(link.target);
    if (a === undefined || b === undefined) continue;
    if (a === b && !(kind === "domain" && a === 1)) continue;
    links.set(link.key, Math.max(a, b));
  }
  return { kind, hops, links, domain };
}

export function nodeState(node, hood, currentId = null) {
  if (!hood) return node.id === currentId ? "current" : "idle";
  const hop = hood.hops.get(node.id);
  if (hop === 0) return "focus";
  if (hop === 1) return "near";
  return hop === undefined ? "dim" : "far";
}

/**
 * Whether a star gets a name on the map, and how urgently. The rail stays quiet
 * (category names only); the wide view adds topics, then post titles as you zoom.
 */
export function labelPriority3d(node, { hood, density, zoom }) {
  const tail = -node.order * 0.01;
  if (hood) {
    const hop = hood.hops.get(node.id);
    if (hop === 0) return 1000;
    if (hop === 1) return 700 + (node.kind === "topic" ? 20 : 10) + tail;
    if (hop !== undefined && density === "rich") return 260 - 40 * hop + tail;
    return null;
  }
  if (density !== "rich") return null;
  if (node.kind === "topic") return (node.count ?? 0) >= 2 || zoom >= 1.6 ? 320 + tail : null;
  return zoom >= 1.25 ? 300 + tail : null;
}
