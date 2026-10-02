// Writes the globe's quiet motion straight into the DOM, ported from the
// portfolio's useCanvasMotion: Svelte renders the still scene, and while motion
// runs one shared frame clock moves dots, hit areas, names, links, spokes,
// cluster labels, and the equator by the same projection (~30 fps, sub-pixel
// changes skipped). Stopping restores the still positions. Pointer glow is a
// response to the pointer, not motion, so it stays when motion is off.
import { clamp, equatorPath } from "./globe-layout.mjs";
import {
  approach,
  buildMotionModel,
  calmFactor,
  driftAmplitude,
  glowStrength,
  motionFrame,
  PARALLAX_PITCH_SHARE,
  parallaxLimit,
  parallaxTarget,
  signalSequence,
  subscribeFrames,
} from "./motion.mjs";

const FRAME_MS = 30;
const COARSE_FRAME_MS = 40;
const MAX_STEP_MS = 64;
const INTENSITY_MS = 700;
const PARALLAX_FOLLOW_MS = 450;
const PARALLAX_RETURN_MS = 1100;
const PARALLAX_SETTLE_MS = 160;
const CALM_MS = 220;
const CALM_RADIUS = { rail: [14, 56], compact: [0, 0], explorer: [20, 80] };
const GLOW_RADIUS = { rail: 26, compact: 0, explorer: 36 };
/** Seconds between ambient signals along a link (varied, never busy). */
const SIGNAL_GAP = [3.6, 5.4];
const HIT_CENTER = "translate(-50%, -50%)";

function round1(value) {
  return Math.round(value * 10) / 10;
}

function fixed2(value) {
  return Math.round(value * 100) / 100;
}

function setLineAttributes(el, x1, y1, x2, y2) {
  el.setAttribute("x1", String(x1));
  el.setAttribute("y1", String(y1));
  el.setAttribute("x2", String(x2));
  el.setAttribute("y2", String(y2));
}

function indexElements(root) {
  const all = (selector) => [...root.querySelectorAll(selector)];
  return {
    nodes: all("g.kg3-node[data-id]").map((el) => ({ id: el.dataset.id ?? "", el, glow: el.querySelector(".kg3-glow") })),
    stars: all(".kg3-star[data-node-id]").map((el) => ({ id: el.dataset.nodeId ?? "", el })),
    names: all(".kg3-label[data-node-id]").map((el) => ({ id: el.dataset.nodeId ?? "", el })),
    links: all("line.kg3-link[data-key]").map((el) => ({ key: el.dataset.key ?? "", source: el.dataset.source ?? "", target: el.dataset.target ?? "", el })),
    sparks: all("line.kg3-spark").map((el) => ({ source: el.dataset.source ?? "", target: el.dataset.target ?? "", el })),
    regions: all(".kg3-halo-region[data-domain], .kg3-region-hit[data-domain]").map((el) => ({ domain: el.dataset.domain ?? "", el })),
    labels: all("button.kg3-domain[data-domain]").map((el) => ({ domain: el.dataset.domain ?? "", el })),
    spokes: all("line.kg3-spoke[data-domain]").map((el) => ({ domain: el.dataset.domain ?? "", el })),
    equator: root.querySelector("path.kg3-equator"),
  };
}

const EMPTY = { nodes: [], stars: [], names: [], links: [], sparks: [], regions: [], labels: [], spokes: [], equator: null };

/**
 * @param options.onSignal called with a link key when an ambient pulse should run
 */
export function createMotionDriver({ onSignal = () => {}, onRunning = () => {} } = {}) {
  let input = null;
  let model = null;
  let modelGraph = null;
  let modelLayout = null;
  let root = null;
  let index = EMPTY;
  let baseDomains = new Map();
  let stopFrames = null;
  let glowRequest = null;
  let styleCache = new WeakMap();
  let lineCache = new WeakMap();
  const frame = { nodes: new Map(), domains: new Map() };
  let framed = false;
  const calm = new Map();
  const domainCalm = new Map();
  const parallax = { yaw: 0, pitch: 0 };
  const pointer = { clientX: 0, clientY: 0, inside: false };
  let local = null;
  let pointerTarget = null;
  let time = 0;
  let intensity = 0;
  let lastDraw = null;
  let signals = [];
  let signalIndex = 0;
  let nextSignal = SIGNAL_GAP[0];

  function setStyle(el, property, value) {
    const key = `${property}:${value}`;
    if (styleCache.get(el) === key) return;
    styleCache.set(el, key);
    el.style[property] = value;
  }

  function setLine(el, a, b) {
    const x1 = round1(a.x);
    const y1 = round1(a.y);
    const x2 = round1(b.x);
    const y2 = round1(b.y);
    const key = `${x1} ${y1} ${x2} ${y2}`;
    if (lineCache.get(el) === key) return;
    lineCache.set(el, key);
    setLineAttributes(el, x1, y1, x2, y2);
  }

  function setPath(el, d) {
    if (lineCache.get(el) === d) return;
    lineCache.set(el, d);
    el.setAttribute("d", d);
  }

  function localPointer() {
    if (!pointer.inside || !root) return null;
    const rect = root.getBoundingClientRect();
    return { x: pointer.clientX - rect.left, y: pointer.clientY - rect.top };
  }

  function step(dt) {
    const { graph, variant, view, camera, layout, moving, activeId, scene } = input;
    time += dt / 1000;
    intensity = approach(intensity, 1, dt, INTENSITY_MS);
    local = localPointer();
    const limit = parallaxLimit(variant, view, camera, layout);
    if (moving) {
      parallax.yaw = approach(parallax.yaw, 0, dt, PARALLAX_SETTLE_MS);
      parallax.pitch = approach(parallax.pitch, 0, dt, PARALLAX_SETTLE_MS);
    } else if (!pointerTarget) {
      const target = parallaxTarget(local, view, limit);
      const tau = local ? PARALLAX_FOLLOW_MS : PARALLAX_RETURN_MS;
      parallax.yaw = approach(parallax.yaw, target.yaw, dt, tau);
      parallax.pitch = approach(parallax.pitch, target.pitch, dt, tau);
    }
    parallax.yaw = clamp(parallax.yaw, -limit, limit);
    parallax.pitch = clamp(parallax.pitch, -limit * PARALLAX_PITCH_SHARE, limit * PARALLAX_PITCH_SHARE);
    const [inner, outer] = CALM_RADIUS[variant];
    for (const node of graph.nodes) {
      let target = 1;
      if (node.id === activeId) target = 0;
      else if (local) {
        const at = (framed ? frame.nodes.get(node.id) : undefined) ?? scene.points.get(node.id);
        if (at) target = calmFactor(Math.hypot(at.x - local.x, at.y - local.y), inner, outer);
      }
      calm.set(node.id, approach(calm.get(node.id) ?? 1, target, dt, CALM_MS));
    }
    for (const domain of graph.domains) {
      const target = domain.key === activeId ? 0 : 1;
      domainCalm.set(domain.id, approach(domainCalm.get(domain.id) ?? 1, target, dt, CALM_MS));
    }
    if (input.signals && signals.length && !moving && !pointerTarget && time >= nextSignal) {
      onSignal(signals[signalIndex % signals.length]);
      signalIndex += 1;
      nextSignal = time + SIGNAL_GAP[0] + (SIGNAL_GAP[1] - SIGNAL_GAP[0]) * ((signalIndex * 0.618) % 1);
    }
  }

  function drawGlows(positions) {
    const radius = GLOW_RADIUS[input.variant];
    for (const { id, glow } of index.nodes) {
      if (!glow) continue;
      const at = positions.get(id);
      const strength = local && at ? glowStrength(Math.hypot(at.x - local.x, at.y - local.y), radius) : 0;
      setStyle(glow, "opacity", strength < 0.01 ? "" : String(Math.round(strength * 100) / 100));
    }
  }

  function draw() {
    if (!input || !model) return;
    const { variant, view, camera, layout, scene } = input;
    motionFrame({ model, layout, view, camera, time, amplitude: driftAmplitude(variant, view, camera) * intensity, parallax, calm, domainCalm }, frame);
    framed = true;
    for (const { id, el } of index.nodes) {
      const at = frame.nodes.get(id);
      if (at) setStyle(el, "transform", `translate(${round1(at.x)}px, ${round1(at.y)}px)`);
    }
    for (const { id, el } of index.stars) {
      const at = frame.nodes.get(id);
      const base = scene.points.get(id);
      if (at && base) setStyle(el, "transform", `${HIT_CENTER} translate(${round1(at.x - fixed2(base.x))}px, ${round1(at.y - fixed2(base.y))}px)`);
    }
    for (const { id, el } of index.names) {
      const at = frame.nodes.get(id);
      const base = scene.points.get(id);
      if (at && base) setStyle(el, "transform", `translate(${round1(at.x - fixed2(base.x))}px, ${round1(at.y - fixed2(base.y))}px)`);
    }
    for (const { el, source, target } of index.links) {
      const a = frame.nodes.get(source);
      const b = frame.nodes.get(target);
      if (a && b) setLine(el, a, b);
    }
    for (const { el, source, target } of index.sparks) {
      const a = frame.nodes.get(source);
      const b = frame.nodes.get(target);
      if (a && b) setLine(el, a, b);
    }
    for (const { domain, el } of index.regions) {
      const at = frame.domains.get(domain);
      const base = baseDomains.get(domain);
      if (at && base) setStyle(el, "transform", `translate(${round1(at.x - base.x)}px, ${round1(at.y - base.y)}px) scale(${Math.round(at.scale * 1000) / 1000})`);
    }
    for (const { domain, el } of index.labels) {
      const at = frame.domains.get(domain);
      const base = baseDomains.get(domain);
      if (at && base) setStyle(el, "transform", `translate(${round1(at.x - base.x)}px, ${round1(at.y - base.y)}px)`);
    }
    for (const { domain, el } of index.spokes) {
      const at = frame.domains.get(domain);
      if (at) setLine(el, scene.core, at);
    }
    if (index.equator) setPath(index.equator, equatorPath(view, { ...camera, yaw: camera.yaw + parallax.yaw, pitch: camera.pitch + parallax.pitch }, layout));
    drawGlows(frame.nodes);
  }

  function restore() {
    if (!input) return;
    const { scene } = input;
    for (const { el, glow } of index.nodes) {
      el.style.transform = "";
      if (glow) glow.style.opacity = "";
    }
    for (const { el } of index.stars) el.style.transform = "";
    for (const { el } of index.names) el.style.transform = "";
    for (const { el } of index.regions) el.style.transform = "";
    for (const { el } of index.labels) el.style.transform = "";
    const byKey = new Map(scene.links.map((link) => [link.key, link]));
    for (const { el, key } of index.links) {
      const link = byKey.get(key);
      if (link) setLineAttributes(el, fixed2(link.a.x), fixed2(link.a.y), fixed2(link.b.x), fixed2(link.b.y));
    }
    for (const { el, source, target } of index.sparks) {
      const a = scene.points.get(source);
      const b = scene.points.get(target);
      if (a && b) setLineAttributes(el, fixed2(a.x), fixed2(a.y), fixed2(b.x), fixed2(b.y));
    }
    const ends = new Map(scene.spokes.map((spoke) => [spoke.domain, spoke]));
    for (const { el, domain } of index.spokes) {
      const end = ends.get(domain);
      if (end) setLineAttributes(el, fixed2(scene.core.x), fixed2(scene.core.y), fixed2(end.x), fixed2(end.y));
    }
    if (index.equator) index.equator.setAttribute("d", scene.equator);
    styleCache = new WeakMap();
    lineCache = new WeakMap();
    framed = false;
  }

  function tick(now) {
    if (!input) return;
    const gap = input.coarse ? COARSE_FRAME_MS : FRAME_MS;
    if (lastDraw !== null && now - lastDraw < gap) return;
    const dt = lastDraw === null ? 16 : Math.min(MAX_STEP_MS, now - lastDraw);
    lastDraw = now;
    step(dt);
    draw();
  }

  function requestGlow() {
    if (glowRequest || !input?.interactive || GLOW_RADIUS[input.variant] <= 0) return;
    glowRequest = subscribeFrames(() => {
      glowRequest?.();
      glowRequest = null;
      if (stopFrames || !input) return;
      local = localPointer();
      drawGlows(input.scene.points);
    });
  }

  return {
    get running() {
      return Boolean(stopFrames);
    },
    /** Latest still scene and settings (call after every render). */
    update(next, nextRoot) {
      input = next;
      root = nextRoot;
      if (!model || modelGraph !== next.graph || modelLayout !== next.layout) {
        model = buildMotionModel(next.graph, next.layout);
        modelGraph = next.graph;
        modelLayout = next.layout;
        signals = signalSequence(next.scene.links);
        signalIndex = 0;
      }
      baseDomains = new Map(next.scene.domains.map((item) => [item.domain.id, { x: item.x, y: item.y }]));
      index = root ? indexElements(root) : EMPTY;
      lineCache = new WeakMap();
      if (stopFrames) draw();
    },
    start() {
      if (stopFrames) return;
      intensity = 0;
      lastDraw = null;
      framed = false;
      stopFrames = subscribeFrames(tick);
      onRunning(true);
    },
    stop() {
      if (!stopFrames) return;
      stopFrames();
      stopFrames = null;
      restore();
      intensity = 0;
      parallax.yaw = 0;
      parallax.pitch = 0;
      calm.clear();
      domainCalm.clear();
      onRunning(false);
      if (pointer.inside) requestGlow();
    },
    destroy() {
      stopFrames?.();
      stopFrames = null;
      glowRequest?.();
      glowRequest = null;
    },
    pointerMove(event) {
      if (event.pointerType === "touch") return;
      pointer.clientX = event.clientX;
      pointer.clientY = event.clientY;
      pointer.inside = true;
      if (!stopFrames) requestGlow();
    },
    pointerLeave() {
      pointer.inside = false;
      pointerTarget = null;
      if (!stopFrames) requestGlow();
    },
    setPointerTarget(id) {
      pointerTarget = id;
    },
  };
}
