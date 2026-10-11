// What the map shows and how it changes: the globe overview, or one category
// opened into layers; what is previewed (pointer/keyboard) and what is pinned.
// Shared by the rail and the wide dialog. Ported from the portfolio's
// useGraph3DWidget / useGraph3DInteraction rules; plain functions and a small
// transition runner so the behaviour is testable without a browser.
import { DEFAULT_PITCH, forwardCamera, lerpCamera, nearestYaw } from "./globe-layout.mjs";

export const INITIAL_EXPLORE = Object.freeze({ mode: "overview", domain: null, pinnedId: null });

export function openDomain(domain, pinnedId = null) {
  return { mode: "detail", domain, pinnedId };
}

/** Ids that live inside an opened category (its key, topics, posts). */
export function domainMembers(graph, domainId) {
  const domain = graph.domainById.get(domainId);
  return domain ? new Set([domain.key, ...domain.topics, ...domain.posts]) : new Set();
}

/** Click/Enter on a star or chip: pin it inside the open category, or open its category pinned. */
export function pick(graph, state, id) {
  if (graph.domainByKey.has(id)) return openDomain(graph.domainByKey.get(id).id);
  const node = graph.byId.get(id);
  if (!node) return state;
  if (state.mode === "detail" && domainMembers(graph, state.domain).has(id)) {
    return { ...state, pinnedId: state.pinnedId === id ? null : id };
  }
  return openDomain(node.domain, id);
}

export function unpin(state) {
  return state.pinnedId ? { ...state, pinnedId: null } : state;
}

/** Esc: unpin first, then back to the overview. `handled` false lets the dialog close. */
export function escape(state) {
  if (state.pinnedId) return { state: unpin(state), handled: true };
  if (state.mode === "detail") return { state: INITIAL_EXPLORE, handled: true };
  return { state, handled: false };
}

/** Something to come back from (opened category, pin, or a turned globe). */
export function isAway(state, cameraMoved = false) {
  return state.mode === "detail" || state.pinnedId !== null || cameraMoved;
}

/**
 * Pointer and keyboard previews, combined with the pin: without a pin the hovered
 * (then keyboard-focused) item is previewed; with a pin the panel stays on the
 * pin and another item only gets a light cue until it is clicked.
 */
export function resolveFocus({ hoverId = null, keyboardId = null, pinnedId = null }, isValid = () => true) {
  const valid = (id) => (id && isValid(id) ? id : null);
  const pinned = valid(pinnedId);
  const activeId = valid(hoverId) ?? valid(keyboardId);
  if (pinned) return { focusId: pinned, activeId, cueId: activeId && activeId !== pinned ? activeId : null, mode: "pinned" };
  return { focusId: activeId, activeId, cueId: null, mode: activeId ? "preview" : "idle" };
}

/** Screen-reader message for a change the user made (auto-return stays silent). */
export function announce(graph, before, after) {
  const parts = [];
  if (before.mode !== after.mode || before.domain !== after.domain) {
    const domain = after.domain ? graph.domainById.get(after.domain) : null;
    parts.push(after.mode === "detail" && domain ? `${domain.label} 펼침 — 카테고리, 주제, 글 층` : "전체 보기");
  }
  if (before.pinnedId !== after.pinnedId) {
    const id = after.pinnedId;
    const title = id ? graph.byId.get(id)?.title ?? graph.domainByKey.get(id)?.label : null;
    if (title) parts.push(`${title} 고정됨`);
    else if (before.pinnedId && after.mode === before.mode && after.domain === before.domain) parts.push("고정 해제됨");
  }
  return parts.join(" / ");
}

/* ── transitions: bring forward → unfold, fold → back home ───── */

export const TRANSITION_MS = { forward: 480, unfold: 640, fold: 520, home: 760, switchFold: 380, switchForward: 520 };

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Camera, unfold amount, and the category on screen for one map (rail or
 * dialog). Changes run as small step lists on a shared frame clock; when the
 * map is hidden or motion is reduced they apply at once.
 */
export class ExploreView {
  constructor({ layout, home, reduced = false, active = true, intro = false, target = null, subscribeFrames, onChange = () => {} }) {
    this.layout = layout;
    this.home = home;
    this.reduced = reduced;
    this.active = active;
    this.subscribe = subscribeFrames;
    this.onChange = onChange;
    this.introPending = intro && !target && this.canAnimate();
    this.camera = this.introPending ? { ...home, yaw: home.yaw - 0.55 } : { ...home };
    // A map that starts on an opened category (the dialog over an opened rail) starts unfolded.
    this.shown = target;
    this.unfold = target ? 1 : 0;
    this.running = false;
    this.moved = false;
    this.target = target;
    this.stop = null;
  }

  snapshot() {
    return { camera: this.camera, shown: this.shown, unfold: this.unfold, running: this.running, moved: this.moved };
  }

  canAnimate() {
    return !this.reduced && typeof this.subscribe === "function";
  }

  emit() {
    this.onChange(this.snapshot());
  }

  halt() {
    this.stop?.();
    this.stop = null;
    this.running = false;
  }

  /** The one-time settle turn on first show (rail only). */
  startIntro(duration = 1100) {
    if (!this.introPending) return;
    this.introPending = false;
    this.run([{ kind: "camera", to: this.home, ms: duration }]);
  }

  run(steps) {
    this.halt();
    this.introPending = false;
    let index = 0;
    let start = null;
    let fromCamera = this.camera;
    let fromUnfold = this.unfold;
    const settle = () => {
      while (index < steps.length && steps[index].kind === "show") {
        this.shown = steps[index].domain;
        index += 1;
      }
      start = null;
      fromCamera = this.camera;
      fromUnfold = this.unfold;
    };
    settle();
    if (index >= steps.length) {
      this.emit();
      return;
    }
    if (!this.canAnimate() || !this.active) {
      for (const step of steps.slice(index)) {
        if (step.kind === "camera") this.camera = { ...step.to };
        if (step.kind === "unfold") this.unfold = step.to;
        if (step.kind === "show") this.shown = step.domain;
      }
      this.emit();
      return;
    }
    this.running = true;
    let unsubscribe = null;
    const finish = () => {
      unsubscribe?.();
      unsubscribe = null;
      if (this.stop === cancel) this.stop = null;
      this.running = false;
      this.emit();
    };
    const cancel = () => {
      unsubscribe?.();
      unsubscribe = null;
      this.running = false;
    };
    unsubscribe = this.subscribe((now) => {
      const step = steps[index];
      if (!step) {
        finish();
        return;
      }
      if (start === null) {
        start = now;
        if (step.kind === "camera") {
          step.exact = step.to;
          step.to = nearestYaw(fromCamera, step.to);
        }
      }
      const t = step.ms <= 0 ? 1 : Math.min(1, (now - start) / step.ms);
      if (step.kind === "camera") this.camera = t >= 1 && step.exact ? { ...step.exact } : lerpCamera(fromCamera, step.to, easeInOut(t));
      else if (step.kind === "unfold") this.unfold = fromUnfold + (step.to - fromUnfold) * t;
      if (t >= 1) {
        index += 1;
        settle();
        if (index >= steps.length) {
          finish();
          return;
        }
      }
      this.emit();
    });
    this.stop = cancel;
    this.emit();
  }

  /** Follow the shared state: a category to open, or null for the overview. */
  setTarget(target) {
    if (target === this.target) return;
    this.target = target;
    if (target) {
      const forward = forwardCamera(this.layout, target);
      if (this.shown === target) {
        this.run([
          { kind: "camera", to: forward, ms: this.unfold > 0 ? 0 : TRANSITION_MS.forward },
          { kind: "unfold", to: 1, ms: TRANSITION_MS.unfold * (1 - this.unfold) },
        ]);
      } else if (this.shown && this.unfold > 0) {
        this.run([
          { kind: "unfold", to: 0, ms: TRANSITION_MS.switchFold * this.unfold },
          { kind: "show", domain: target },
          { kind: "camera", to: forward, ms: TRANSITION_MS.switchForward },
          { kind: "unfold", to: 1, ms: TRANSITION_MS.unfold },
        ]);
      } else {
        this.run([
          { kind: "show", domain: target },
          { kind: "camera", to: forward, ms: TRANSITION_MS.forward },
          { kind: "unfold", to: 1, ms: TRANSITION_MS.unfold },
        ]);
      }
      return;
    }
    this.moved = false;
    this.run([
      { kind: "unfold", to: 0, ms: TRANSITION_MS.fold * this.unfold },
      { kind: "show", domain: null },
      { kind: "camera", to: this.home, ms: TRANSITION_MS.home },
    ]);
  }

  /** The reader turned or zoomed the globe (drag, keys, tools). */
  moveCamera(next) {
    this.halt();
    this.introPending = false;
    this.moved = true;
    this.camera = next;
    this.emit();
  }

  animateCamera(next, duration = 420) {
    this.moved = true;
    this.run([{ kind: "camera", to: next, ms: duration }]);
  }

  /** Back to the first view after the overview itself was turned. */
  resetCamera() {
    const wasMoved = this.moved;
    this.moved = false;
    if (this.shown || this.unfold > 0 || !wasMoved) {
      this.emit();
      return;
    }
    this.run([{ kind: "camera", to: this.home, ms: TRANSITION_MS.home }]);
  }

  setHome(home) {
    const same = home.yaw === this.home.yaw && home.pitch === this.home.pitch;
    this.home = home;
    if (same || this.introPending || this.shown || this.moved || this.running) return;
    this.camera = { ...home };
    this.emit();
  }

  setActive(active) {
    this.active = active;
  }

  setReduced(reduced) {
    this.reduced = reduced;
  }

  destroy() {
    this.halt();
  }
}

export function homeCamera(layout, domainId = null) {
  const facing = domainId ? layout.facing?.get(domainId) : undefined;
  return { yaw: Number.isFinite(facing) ? facing : layout.yaw, pitch: DEFAULT_PITCH, zoom: 1, panX: 0, panY: 0 };
}
