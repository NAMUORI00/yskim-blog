// Return to the overview when attention leaves the map, ported from the
// portfolio's useGraph3DAttention. The map, its panel, and its buttons are one
// region:
//  - a mouse/pen pointer leaving the whole region starts a ~3 s timer; coming
//    back cancels it; moving between the map and the panel is not leaving;
//  - keyboard focus inside the region holds it (Tab users and screen readers
//    are never reset), a click-focus does not;
//  - pressing inside (drag, scrollbar, text selection) waits for release, and
//    scrolling inside restarts the timer;
//  - touch has no pointer to leave with: nothing returns by time, only the
//    explicit "전체 보기" button or Esc;
//  - a suspended region (the rail under the open dialog) never times out.
// Document listeners only observe (no preventDefault / stopPropagation).

export const RETURN_DELAY_MS = 3000;

/** Input modality shared by every region on a page. */
export function createInputTracker(doc) {
  const state = { modality: "pointer", pointerType: "mouse", x: 0, y: 0, known: false };
  const listeners = new Set();
  const emit = (event) => {
    for (const listener of [...listeners]) listener(event);
  };
  const onKeyDown = (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (state.modality === "keyboard") return;
    state.modality = "keyboard";
    emit({ type: "modality" });
  };
  const onPointerDown = (event) => {
    state.pointerType = event.pointerType || "mouse";
    if (state.pointerType !== "touch") {
      state.x = event.clientX;
      state.y = event.clientY;
      state.known = true;
    }
    if (state.modality === "pointer") return;
    state.modality = "pointer";
    emit({ type: "modality" });
  };
  const onPointerMove = (event) => {
    if (event.pointerType === "touch") return;
    state.x = event.clientX;
    state.y = event.clientY;
    state.known = true;
    if (state.pointerType === "touch" && event.pointerType) {
      state.pointerType = event.pointerType;
      emit({ type: "modality" });
    }
  };
  const onRelease = () => emit({ type: "release" });
  doc.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
  doc.addEventListener("pointerup", onRelease, true);
  doc.addEventListener("pointercancel", onRelease, true);
  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("pointermove", onPointerMove, { capture: true });
      doc.removeEventListener("pointerup", onRelease, true);
      doc.removeEventListener("pointercancel", onRelease, true);
      listeners.clear();
    },
  };
}

/**
 * @param options.region element (or anything with add/removeEventListener + contains)
 * @param options.tracker from createInputTracker
 * @param options.onReturn called when the timer runs out and nothing holds the region
 */
export class AttentionReturn {
  constructor({ region, doc, tracker, onReturn, delay = RETURN_DELAY_MS, timers = globalThis }) {
    this.region = region;
    this.doc = doc;
    this.tracker = tracker;
    this.onReturn = onReturn;
    this.delay = delay;
    this.timers = timers;
    this.away = false;
    this.suspended = false;
    this.timer = null;
    this.hold = { pointerInside: false, pressed: false, focusInside: false };
    this.onPending = null;

    const touch = (event) => event.pointerType === "touch";
    this.handlers = {
      pointerenter: (event) => {
        if (touch(event)) return;
        this.hold.pointerInside = true;
        this.evaluate();
      },
      pointerleave: (event) => {
        if (touch(event)) return;
        this.hold.pointerInside = false;
        this.evaluate();
      },
      pointermove: (event) => {
        if (touch(event) || this.hold.pointerInside) return;
        this.hold.pointerInside = true;
        this.evaluate();
      },
      pointerdown: (event) => {
        this.hold.pressed = true;
        if (!touch(event)) this.hold.pointerInside = true;
        this.evaluate();
      },
      focusin: () => {
        this.hold.focusInside = true;
        this.evaluate();
      },
      focusout: (event) => {
        const next = event.relatedTarget ?? null;
        this.hold.focusInside = Boolean(next && this.region.contains(next));
        this.evaluate(next);
      },
      keydown: () => this.evaluate(),
      scroll: () => {
        if (this.timer !== null) this.schedule();
      },
    };
    for (const [type, handler] of Object.entries(this.handlers)) {
      region.addEventListener(type, handler, type === "scroll" ? { capture: true, passive: true } : type === "pointermove" ? { passive: true } : false);
    }
    this.unsubscribe = tracker.subscribe((event) => {
      if (event.type === "release") {
        if (!this.hold.pressed) return;
        this.hold.pressed = false;
      }
      this.evaluate();
    });
  }

  get pending() {
    return this.timer !== null;
  }

  keyboardInside(focusTarget) {
    if (this.tracker.state.modality !== "keyboard") return false;
    const target = focusTarget === undefined ? this.doc.activeElement : focusTarget;
    return Boolean(target && this.region.contains(target));
  }

  held(focusTarget) {
    if (this.tracker.state.pointerType === "touch") return true;
    return !this.away || this.suspended || this.hold.pointerInside || this.hold.pressed || this.keyboardInside(focusTarget);
  }

  cancel() {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    const was = this.timer !== null;
    this.timer = null;
    if (was) this.onPending?.(false);
  }

  schedule() {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.onPending?.(false);
      // Check again at the moment it fires: no stale returns.
      if (!this.held()) this.onReturn();
    }, this.delay);
    this.onPending?.(true);
  }

  evaluate(focusTarget) {
    if (this.held(focusTarget)) this.cancel();
    else if (this.timer === null) this.schedule();
  }

  /** Call when the map state changes (away) or another region covers this one (suspended). */
  update({ away = this.away, suspended = this.suspended } = {}) {
    const resumed = this.suspended && !suspended;
    this.away = away;
    this.suspended = suspended;
    if (resumed && this.tracker.state.known && this.tracker.state.pointerType !== "touch" && typeof this.doc.elementFromPoint === "function") {
      const under = this.doc.elementFromPoint(this.tracker.state.x, this.tracker.state.y);
      this.hold.pointerInside = Boolean(under && this.region.contains(under));
    }
    this.evaluate();
  }

  /** Whether focus was inside — including focus lost with a removed element. */
  hadFocus() {
    const active = this.doc.activeElement;
    if (active && active !== this.doc.body && this.region.contains(active)) return true;
    return this.hold.focusInside && (!active || active === this.doc.body);
  }

  destroy() {
    this.cancel();
    for (const [type, handler] of Object.entries(this.handlers)) {
      this.region.removeEventListener(type, handler, type === "scroll" ? { capture: true } : false);
    }
    this.unsubscribe?.();
  }
}
