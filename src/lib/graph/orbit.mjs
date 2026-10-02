// Drag to turn the globe (and, in the wide view, wheel/pinch zoom and
// Shift+drag pan), ported from the portfolio's useOrbit. A drag only starts
// after 4 px, the click that follows a drag is not a selection, and a release
// with speed glides briefly to a stop (never a continuous spin).
import { clamp, clampCamera, zoomAt } from "./globe-layout.mjs";
import { subscribeFrames } from "./motion.mjs";

const DRAG_THRESHOLD = 4;
const YAW_PER_PX = 0.0085;
const PITCH_PER_PX = 0.004;
const GLIDE_TAU = 260;
const GLIDE_MIN = 0.00004;
const GLIDE_MAX = 0.004;

/**
 * @param element the globe layer
 * @param options.getCamera / getView current camera and view
 * @param options.onChange receives the next camera
 * @param options.onState receives { dragging, gliding }
 */
export function attachOrbit(element, { getCamera, getView, onChange, onState = () => {}, allowZoom = false, glide = true }) {
  const pointers = new Map();
  let gesture = null;
  let dragging = false;
  let gliding = false;
  let stopGlide = null;
  const velocity = { yaw: 0, pitch: 0, at: 0, lastYaw: 0, lastPitch: 0 };
  const guard = { moved: false };

  const setState = (next) => {
    dragging = next.dragging ?? dragging;
    gliding = next.gliding ?? gliding;
    onState({ dragging, gliding });
  };
  const local = (event) => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const begin = () => {
    gesture = { camera: getCamera(), points: [...pointers.values()] };
  };
  const halt = () => {
    stopGlide?.();
    stopGlide = null;
    if (gliding) setState({ gliding: false });
  };
  const startDrag = (event) => {
    guard.moved = true;
    setState({ dragging: true });
    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      // Dragging still works without capture.
    }
  };

  const onPointerDown = (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    halt();
    if (event.isPrimary || pointers.size === 0) {
      pointers.clear();
      guard.moved = false;
    }
    pointers.set(event.pointerId, local(event));
    const camera = getCamera();
    Object.assign(velocity, { yaw: 0, pitch: 0, at: event.timeStamp, lastYaw: camera.yaw, lastPitch: camera.pitch });
    begin();
  };

  const onPointerMove = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, local(event));
    const start = gesture;
    if (!start) return;
    const view = getView();
    const now = [...pointers.values()];
    if (now.length >= 2 && start.points.length >= 2) {
      if (!allowZoom) return;
      const before = Math.hypot(start.points[1].x - start.points[0].x, start.points[1].y - start.points[0].y);
      const after = Math.hypot(now[1].x - now[0].x, now[1].y - now[0].y);
      const from = { x: (start.points[0].x + start.points[1].x) / 2, y: (start.points[0].y + start.points[1].y) / 2 };
      const to = { x: (now[0].x + now[1].x) / 2, y: (now[0].y + now[1].y) / 2 };
      if (!guard.moved) startDrag(event);
      const zoomed = zoomAt(start.camera, view, after / Math.max(1, before), from.x, from.y);
      onChange(clampCamera({ ...zoomed, panX: zoomed.panX + to.x - from.x, panY: zoomed.panY + to.y - from.y }, view));
      return;
    }
    const dx = now[0].x - start.points[0].x;
    const dy = now[0].y - start.points[0].y;
    if (!guard.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      startDrag(event);
    }
    if (event.shiftKey && allowZoom) {
      onChange(clampCamera({ ...start.camera, panX: start.camera.panX + dx, panY: start.camera.panY + dy }, view));
      return;
    }
    const next = clampCamera({ ...start.camera, yaw: start.camera.yaw + dx * YAW_PER_PX, pitch: start.camera.pitch + dy * PITCH_PER_PX }, view);
    const dt = Math.max(1, event.timeStamp - velocity.at);
    velocity.yaw = 0.6 * ((next.yaw - velocity.lastYaw) / dt) + 0.4 * velocity.yaw;
    velocity.pitch = 0.6 * ((next.pitch - velocity.lastPitch) / dt) + 0.4 * velocity.pitch;
    velocity.at = event.timeStamp;
    velocity.lastYaw = next.yaw;
    velocity.lastPitch = next.pitch;
    onChange(next);
  };

  const glideFrom = (yaw, pitch) => {
    let vy = clamp(yaw, -GLIDE_MAX, GLIDE_MAX);
    let vp = clamp(pitch, -GLIDE_MAX, GLIDE_MAX) * 0.6;
    if (Math.hypot(vy, vp) < GLIDE_MIN * 4) return;
    let last = null;
    setState({ gliding: true });
    stopGlide = subscribeFrames((now) => {
      const dt = last === null ? 16 : Math.min(48, now - last);
      last = now;
      onChange(clampCamera({ ...getCamera(), yaw: getCamera().yaw + vy * dt, pitch: getCamera().pitch + vp * dt }, getView()));
      const decay = Math.exp(-dt / GLIDE_TAU);
      vy *= decay;
      vp *= decay;
      if (Math.hypot(vy, vp) < GLIDE_MIN) halt();
    });
  };

  const onPointerEnd = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    try {
      element.releasePointerCapture?.(event.pointerId);
    } catch {
      // Already released.
    }
    if (pointers.size) {
      begin();
      return;
    }
    gesture = null;
    if (dragging) setState({ dragging: false });
    if (guard.moved) {
      setTimeout(() => {
        if (!pointers.size) guard.moved = false;
      }, 0);
      if (glide && event.type === "pointerup" && event.timeStamp - velocity.at < 80) glideFrom(velocity.yaw, velocity.pitch);
    }
  };

  const onWheel = (event) => {
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    onChange(zoomAt(getCamera(), getView(), Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top));
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerEnd);
  element.addEventListener("pointercancel", onPointerEnd);
  if (allowZoom) element.addEventListener("wheel", onWheel, { passive: false });

  return {
    /** True right after a drag: the click it causes is not a selection. */
    guard,
    halt,
    destroy() {
      halt();
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("pointerup", onPointerEnd);
      element.removeEventListener("pointercancel", onPointerEnd);
      element.removeEventListener("wheel", onWheel);
    },
  };
}
