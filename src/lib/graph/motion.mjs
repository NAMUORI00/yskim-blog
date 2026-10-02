// Quiet motion for the globe, ported from the portfolio's graph3dMotion:
// clusters drift together (13–19 s), breathe (7–10 s), and each star wobbles a
// little (5.5–9.5 s); pointing at empty space turns the globe slightly towards
// the pointer. Periods and phases come from id hashes (no randomness), sizes are
// a few pixels, and amplitude 0 is exactly the static layout.
import { CAMERA_DISTANCE, clamp, hash01, projectPoint } from "./globe-layout.mjs";

export const DRIFT_PX = { rail: 2.4, compact: 0, explorer: 4.5 };
export const PARALLAX_PX = { rail: 10, compact: 0, explorer: 16 };
export const PARALLAX_MAX = (6 * Math.PI) / 180;
export const PARALLAX_PITCH_SHARE = 0.6;

const SHARE = { drift: 0.45, breath: 0.3, wobble: 0.25 };
const DRIFT_Y = 0.8;
const DRIFT_NORM = Math.sqrt(2 + DRIFT_Y * DRIFT_Y);
const SQRT3 = Math.sqrt(3);

function wave(seed, minSeconds, maxSeconds) {
  const period = minSeconds + (maxSeconds - minSeconds) * hash01(`${seed}:period`);
  return { omega: (Math.PI * 2) / period, phase: hash01(`${seed}:phase`) * Math.PI * 2 };
}

function sinAt(item, t) {
  return Math.sin(item.omega * t + item.phase);
}

export function buildMotionModel(graph, layout) {
  const domains = new Map();
  for (const domain of graph.domains) {
    const center = layout.centers.get(domain.id);
    if (!center) continue;
    let reach = 1e-6;
    for (const node of graph.nodes) {
      if (node.domain !== domain.id) continue;
      const point = layout.positions.get(node.id);
      if (point) reach = Math.max(reach, Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z));
    }
    domains.set(domain.id, {
      drift: [wave(`${domain.id}:x`, 13, 19), wave(`${domain.id}:y`, 13, 19), wave(`${domain.id}:z`, 13, 19)],
      breath: wave(`${domain.id}:breath`, 7, 10),
      reach,
    });
  }
  const nodes = new Map();
  for (const node of graph.nodes) {
    const point = layout.positions.get(node.id);
    const center = layout.centers.get(node.domain);
    const reach = domains.get(node.domain)?.reach;
    if (!point || !center || !reach) continue;
    nodes.set(node.id, {
      domain: node.domain,
      radial: { x: (point.x - center.x) / reach, y: (point.y - center.y) / reach, z: (point.z - center.z) / reach },
      wobble: [wave(`${node.id}:x`, 5.5, 9.5), wave(`${node.id}:y`, 5.5, 9.5), wave(`${node.id}:z`, 5.5, 9.5)],
    });
  }
  return { nodes, domains };
}

export function domainDrift(model, domain, t, out = { x: 0, y: 0, z: 0 }) {
  const item = model.domains.get(domain);
  out.x = item ? sinAt(item.drift[0], t) / DRIFT_NORM : 0;
  out.y = item ? (DRIFT_Y * sinAt(item.drift[1], t)) / DRIFT_NORM : 0;
  out.z = item ? sinAt(item.drift[2], t) / DRIFT_NORM : 0;
  return out;
}

export function domainBreath(model, domain, t) {
  const item = model.domains.get(domain);
  return item ? sinAt(item.breath, t) : 0;
}

const scratch = { x: 0, y: 0, z: 0 };

/** Offset direction of one star (length ≤ 1; multiply by the amplitude). */
export function nodeDrift(model, id, t, out = { x: 0, y: 0, z: 0 }) {
  const item = model.nodes.get(id);
  if (!item) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  const drift = domainDrift(model, item.domain, t, scratch);
  const breath = domainBreath(model, item.domain, t);
  const [wx, wy, wz] = item.wobble;
  out.x = SHARE.drift * drift.x + SHARE.breath * item.radial.x * breath + (SHARE.wobble * sinAt(wx, t)) / SQRT3;
  out.y = SHARE.drift * drift.y + SHARE.breath * item.radial.y * breath + (SHARE.wobble * sinAt(wy, t)) / SQRT3;
  out.z = SHARE.drift * drift.z + SHARE.breath * item.radial.z * breath + (SHARE.wobble * sinAt(wz, t)) / SQRT3;
  return out;
}

export function pxPerUnit(view, camera) {
  return (view.focal * camera.zoom) / CAMERA_DISTANCE;
}

export function driftAmplitude(variant, view, camera) {
  return DRIFT_PX[variant] / Math.max(1e-6, pxPerUnit(view, camera));
}

export function parallaxLimit(variant, view, camera, layout) {
  const px = PARALLAX_PX[variant];
  if (px <= 0) return 0;
  return Math.min(PARALLAX_MAX, px / Math.max(1e-6, pxPerUnit(view, camera) * layout.radius));
}

export function parallaxTarget(pointer, view, limit) {
  if (!pointer || limit <= 0) return { yaw: 0, pitch: 0 };
  const nx = clamp((pointer.x - view.width / 2) / Math.max(1, view.width / 2), -1, 1);
  const ny = clamp((pointer.y - view.height / 2) / Math.max(1, view.height / 2), -1, 1);
  return { yaw: nx * limit, pitch: ny * limit * PARALLAX_PITCH_SHARE };
}

/** Exponential approach: `tau` ms per 1/e of the remaining distance; never overshoots. */
export function approach(current, target, dt, tau) {
  if (tau <= 0) return target;
  return target + (current - target) * Math.exp(-Math.max(0, dt) / tau);
}

/** 0 inside `inner`, 1 beyond `outer`, smooth in between. */
export function calmFactor(dist, inner, outer) {
  if (outer <= inner) return dist <= inner ? 0 : 1;
  const t = clamp((dist - inner) / (outer - inner), 0, 1);
  return t * t * (3 - 2 * t);
}

export function glowStrength(dist, radius) {
  if (radius <= 0) return 0;
  const t = clamp(1 - dist / radius, 0, 1);
  return t * t;
}

/**
 * Screen positions of every star and cluster for one frame. The user's camera
 * is not changed — the parallax is only added while drawing.
 */
export function motionFrame(input, out) {
  const { model, layout, view, time, amplitude, calm, domainCalm } = input;
  const frame = out ?? { nodes: new Map(), domains: new Map() };
  const camera = { ...input.camera, yaw: input.camera.yaw + input.parallax.yaw, pitch: input.camera.pitch + input.parallax.pitch };
  const offset = { x: 0, y: 0, z: 0 };
  const point = { x: 0, y: 0, z: 0 };
  for (const [id, base] of layout.positions) {
    const k = amplitude * (calm?.get(id) ?? 1);
    if (k > 0) nodeDrift(model, id, time, offset);
    point.x = base.x + (k > 0 ? offset.x * k : 0);
    point.y = base.y + (k > 0 ? offset.y * k : 0);
    point.z = base.z + (k > 0 ? offset.z * k : 0);
    const projected = projectPoint(view, camera, layout, point);
    const slot = frame.nodes.get(id);
    if (slot) {
      slot.x = projected.x;
      slot.y = projected.y;
    } else frame.nodes.set(id, { x: projected.x, y: projected.y });
  }
  for (const [domain, center] of layout.centers) {
    const k = amplitude * (domainCalm?.get(domain) ?? 1);
    if (k > 0) domainDrift(model, domain, time, offset);
    point.x = center.x + (k > 0 ? offset.x * k * SHARE.drift : 0);
    point.y = center.y + (k > 0 ? offset.y * k * SHARE.drift : 0);
    point.z = center.z + (k > 0 ? offset.z * k * SHARE.drift : 0);
    const projected = projectPoint(view, camera, layout, point);
    const reach = model.domains.get(domain)?.reach ?? 1;
    const scale = k > 0 ? 1 + (k * SHARE.breath * domainBreath(model, domain, time)) / reach : 1;
    const slot = frame.domains.get(domain);
    if (slot) {
      slot.x = projected.x;
      slot.y = projected.y;
      slot.scale = scale;
    } else frame.domains.set(domain, { x: projected.x, y: projected.y, scale });
  }
  return frame;
}

/**
 * Ambient "signal": which in-cluster link carries the next faint pulse. Walks
 * the links in a fixed, hashed order so the sequence is varied but repeatable.
 */
export function signalSequence(links) {
  return links
    .filter((link) => !link.cross)
    .map((link) => link.key)
    .sort((a, b) => hash01(`${a}:signal`) - hash01(`${b}:signal`) || (a < b ? -1 : 1));
}

/* ── one shared frame clock ─────────────────────────────────── */

const frameSubscribers = new Set();
let frameHandle = 0;

function runFrame(now) {
  frameHandle = 0;
  for (const callback of [...frameSubscribers]) callback(now);
  if (frameSubscribers.size && !frameHandle) frameHandle = requestAnimationFrame(runFrame);
}

export function subscribeFrames(callback) {
  frameSubscribers.add(callback);
  if (!frameHandle && typeof requestAnimationFrame === "function") frameHandle = requestAnimationFrame(runFrame);
  return () => {
    frameSubscribers.delete(callback);
    if (!frameSubscribers.size && frameHandle && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameHandle);
      frameHandle = 0;
    }
  };
}

export function activeFrameSubscribers() {
  return frameSubscribers.size;
}

/* ── motion on/off (shared by the rail and the dialog, remembered) ── */

export const MOTION_STORAGE_KEY = "yskim-map-motion";

export function createMotionPreference({ storage = null, reducedQuery = null } = {}) {
  const listeners = new Set();
  let choice = "on";
  try {
    if (storage?.getItem(MOTION_STORAGE_KEY) === "off") choice = "off";
  } catch {
    choice = "on";
  }
  let reduced = Boolean(reducedQuery?.matches);
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  reducedQuery?.addEventListener?.("change", (event) => {
    reduced = Boolean(event.matches);
    notify();
  });
  return {
    get reduced() {
      return reduced;
    },
    get choice() {
      return choice;
    },
    /** Moving at all: never when the device asks for reduced motion. */
    get enabled() {
      return !reduced && choice === "on";
    },
    set(next) {
      const value = next === "off" ? "off" : "on";
      if (value === choice) return;
      choice = value;
      try {
        storage?.setItem(MOTION_STORAGE_KEY, value);
      } catch {
        // The choice still applies for this page view.
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
