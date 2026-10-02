import test from "node:test";
import assert from "node:assert/strict";

import { buildBlogGraph, indexGraph } from "../src/lib/knowledge-graph-data.mjs";
import { AttentionReturn, createInputTracker, RETURN_DELAY_MS } from "../src/lib/graph/attention.mjs";
import { announce, escape, ExploreView, homeCamera, INITIAL_EXPLORE, isAway, openDomain, pick, resolveFocus, TRANSITION_MS, unpin } from "../src/lib/graph/explore.mjs";
import { forwardCamera, layoutGlobe } from "../src/lib/graph/globe-layout.mjs";
import { createMotionPreference, MOTION_STORAGE_KEY } from "../src/lib/graph/motion.mjs";
import { buildTaxonomy } from "../src/lib/taxonomy.mjs";

function entry(slug, categories, tags) {
  return { id: slug, body: "", data: { slug, title: `${slug} 글`, date: new Date("2026-01-01"), categories, tags, summary: "" } };
}

function graph() {
  return indexGraph(
    buildBlogGraph(
      buildTaxonomy([entry("a", ["개발"], ["astro"]), entry("b", ["개발"], ["css"]), entry("c", ["일기"], ["일상"])]),
      {},
    ),
  );
}

/* ── explore rules ───────────────────────────────────────────── */

test("clicking a star opens its category with that star pinned", () => {
  const g = graph();

  assert.deepEqual(pick(g, INITIAL_EXPLORE, "post:a"), openDomain("개발", "post:a"));
  assert.deepEqual(pick(g, INITIAL_EXPLORE, "category:일기"), openDomain("일기"));
  assert.equal(pick(g, INITIAL_EXPLORE, "unknown"), INITIAL_EXPLORE);
});

test("inside an opened category a click pins, a second click unpins, another category's item switches", () => {
  const g = graph();
  const opened = openDomain("개발");

  assert.equal(pick(g, opened, "topic:css").pinnedId, "topic:css");
  assert.equal(pick(g, { ...opened, pinnedId: "topic:css" }, "topic:css").pinnedId, null);
  assert.deepEqual(pick(g, opened, "post:c"), openDomain("일기", "post:c"));
});

test("Esc unpins first, then returns to the whole view, then lets the dialog close", () => {
  const pinned = openDomain("개발", "post:a");
  const step1 = escape(pinned);
  const step2 = escape(step1.state);
  const step3 = escape(step2.state);

  assert.deepEqual([step1.handled, step2.handled, step3.handled], [true, true, false]);
  assert.equal(step1.state.mode, "detail");
  assert.equal(step1.state.pinnedId, null);
  assert.deepEqual(step2.state, INITIAL_EXPLORE);
  assert.equal(unpin(INITIAL_EXPLORE), INITIAL_EXPLORE);
});

test("there is something to come back from only after opening, pinning, or turning", () => {
  assert.equal(isAway(INITIAL_EXPLORE), false);
  assert.equal(isAway(INITIAL_EXPLORE, true), true);
  assert.equal(isAway(openDomain("개발")), true);
});

test("a pin holds the panel; other items only get a cue", () => {
  assert.deepEqual(resolveFocus({ hoverId: "x" }), { focusId: "x", activeId: "x", cueId: null, mode: "preview" });
  assert.deepEqual(resolveFocus({ keyboardId: "k" }), { focusId: "k", activeId: "k", cueId: null, mode: "preview" });
  assert.deepEqual(resolveFocus({ hoverId: "x", pinnedId: "p" }), { focusId: "p", activeId: "x", cueId: "x", mode: "pinned" });
  assert.deepEqual(resolveFocus({ hoverId: "gone" }, (id) => id !== "gone"), { focusId: null, activeId: null, cueId: null, mode: "idle" });
});

test("screen readers hear what changed", () => {
  const g = graph();

  assert.equal(announce(g, INITIAL_EXPLORE, openDomain("개발")), "개발 펼침 — 카테고리, 주제, 글 층");
  assert.equal(announce(g, openDomain("개발"), openDomain("개발", "post:a")), "a 글 고정됨");
  assert.equal(announce(g, openDomain("개발", "post:a"), openDomain("개발")), "고정 해제됨");
  assert.equal(announce(g, openDomain("개발"), INITIAL_EXPLORE), "전체 보기");
});

/* ── transitions ─────────────────────────────────────────────── */

function frameClock() {
  const subscribers = new Set();
  let now = 0;
  return {
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    advance(ms, step = 16) {
      for (let elapsed = 0; elapsed < ms; elapsed += step) {
        now += step;
        for (const callback of [...subscribers]) callback(now);
      }
    },
    get size() {
      return subscribers.size;
    },
  };
}

function viewWith(options = {}) {
  const layout = layoutGlobe(graph());
  const clock = frameClock();
  const states = [];
  const view = new ExploreView({ layout, home: homeCamera(layout), subscribeFrames: clock.subscribe, onChange: (state) => states.push(state), ...options });
  return { layout, clock, view, states };
}

test("opening brings the category forward, then unfolds the layers; going back folds and returns home", () => {
  const { layout, clock, view } = viewWith();
  view.setTarget("개발");

  assert.equal(view.shown, "개발");
  assert.equal(view.unfold, 0);
  clock.advance(TRANSITION_MS.forward + 32);
  assert.ok(Math.abs(view.camera.yaw - forwardCamera(layout, "개발").yaw) < 1e-6 || view.unfold > 0);
  clock.advance(TRANSITION_MS.unfold + 64);
  assert.equal(view.unfold, 1);
  assert.equal(view.running, false);
  assert.equal(clock.size, 0, "no frames after the transition");

  view.setTarget(null);
  clock.advance(TRANSITION_MS.fold + TRANSITION_MS.home + 96);
  assert.equal(view.shown, null);
  assert.equal(view.unfold, 0);
  assert.ok(Math.abs(view.camera.yaw - homeCamera(layout).yaw) < 1e-6);
  assert.equal(clock.size, 0);
});

test("switching categories folds, turns, and unfolds again", () => {
  const { clock, view } = viewWith();
  view.setTarget("개발");
  clock.advance(1400);
  view.setTarget("일기");

  clock.advance(TRANSITION_MS.switchFold + 32);
  assert.equal(view.shown, "일기");
  clock.advance(TRANSITION_MS.switchForward + TRANSITION_MS.unfold + 96);
  assert.equal(view.unfold, 1);
});

test("reduced motion and hidden maps change views at once, without frames", () => {
  for (const options of [{ reduced: true }, { active: false }]) {
    const { clock, view } = viewWith(options);
    view.setTarget("개발");
    assert.equal(view.shown, "개발");
    assert.equal(view.unfold, 1);
    assert.equal(clock.size, 0);
    view.setTarget(null);
    assert.equal(view.shown, null);
    assert.equal(view.unfold, 0);
  }
});

test("the rail's first view settles with one short turn that a home sync does not cancel", () => {
  const { layout, clock, view } = viewWith({ intro: true });
  const home = homeCamera(layout);

  assert.ok(Math.abs(view.camera.yaw - (home.yaw - 0.55)) < 1e-9);
  view.setHome({ ...home });
  assert.ok(Math.abs(view.camera.yaw - (home.yaw - 0.55)) < 1e-9, "home sync cancelled the settle turn");
  view.startIntro();
  clock.advance(1200);
  assert.ok(Math.abs(view.camera.yaw - home.yaw) < 1e-6);
  assert.equal(view.moved, false);
  assert.equal(clock.size, 0);

  const reduced = viewWith({ intro: true, reduced: true });
  assert.ok(Math.abs(reduced.view.camera.yaw - homeCamera(reduced.layout).yaw) < 1e-9, "reduced motion should start at rest");
});

test("turning the globe marks it moved until reset", () => {
  const { layout, clock, view } = viewWith();
  view.moveCamera({ ...homeCamera(layout), yaw: 2 });

  assert.equal(view.moved, true);
  view.resetCamera();
  clock.advance(TRANSITION_MS.home + 64);
  assert.equal(view.moved, false);
  assert.ok(Math.abs(view.camera.yaw - homeCamera(layout).yaw) < 1e-6);
});

/* ── attention ───────────────────────────────────────────────── */

class Node extends EventTarget {
  constructor(parent = null) {
    super();
    this.parent = parent;
  }

  contains(other) {
    for (let node = other; node; node = node.parent) if (node === this) return true;
    return false;
  }
}

function fakeTimers() {
  let now = 0;
  let id = 0;
  const pending = new Map();
  return {
    setTimeout(callback, ms) {
      id += 1;
      pending.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout(handle) {
      pending.delete(handle);
    },
    tick(ms) {
      now += ms;
      for (const [handle, timer] of [...pending]) {
        if (timer.at <= now) {
          pending.delete(handle);
          timer.callback();
        }
      }
    },
    get size() {
      return pending.size;
    },
  };
}

function pointer(type, pointerType = "mouse", extra = {}) {
  return Object.assign(new Event(type), { pointerType, clientX: 5, clientY: 5, ...extra });
}

function setup({ away = true } = {}) {
  const doc = new Node();
  doc.body = new Node(doc);
  doc.activeElement = doc.body;
  const region = new Node(doc);
  const inside = new Node(region);
  const outside = new Node(doc);
  const timers = fakeTimers();
  const tracker = createInputTracker(doc);
  let returns = 0;
  const attention = new AttentionReturn({ region, doc, tracker, timers, onReturn: () => (returns += 1) });
  attention.update({ away });
  return { doc, region, inside, outside, timers, tracker, attention, returns: () => returns };
}

test("leaving the map and its panel returns to the overview after about three seconds", () => {
  const t = setup();
  t.region.dispatchEvent(pointer("pointerenter"));
  t.region.dispatchEvent(pointer("pointerleave"));

  t.timers.tick(RETURN_DELAY_MS - 1);
  assert.equal(t.returns(), 0);
  t.timers.tick(1);
  assert.equal(t.returns(), 1);
});

test("coming back cancels; resting inside never returns; the overview never times out", () => {
  const t = setup();
  t.region.dispatchEvent(pointer("pointerleave"));
  t.timers.tick(2000);
  t.region.dispatchEvent(pointer("pointerenter"));
  t.timers.tick(10_000);
  assert.equal(t.returns(), 0);

  const idle = setup({ away: false });
  idle.region.dispatchEvent(pointer("pointerleave"));
  idle.timers.tick(10_000);
  assert.equal(idle.returns(), 0);
});

test("keyboard focus inside holds the view; a click focus does not", () => {
  const t = setup();
  t.doc.dispatchEvent(Object.assign(new Event("keydown"), { key: "Tab" }));
  t.doc.activeElement = t.inside;
  t.region.dispatchEvent(new Event("focusin"));
  t.region.dispatchEvent(pointer("pointerleave"));
  t.timers.tick(10_000);
  assert.equal(t.returns(), 0, "keyboard reader was reset");

  t.doc.activeElement = t.outside;
  t.region.dispatchEvent(Object.assign(new Event("focusout"), { relatedTarget: t.outside }));
  t.timers.tick(RETURN_DELAY_MS);
  assert.equal(t.returns(), 1);

  const click = setup();
  click.region.dispatchEvent(pointer("pointerenter"));
  click.doc.dispatchEvent(pointer("pointerdown"));
  click.doc.activeElement = click.inside;
  click.region.dispatchEvent(new Event("focusin"));
  click.doc.dispatchEvent(pointer("pointerup"));
  click.region.dispatchEvent(pointer("pointerleave"));
  click.timers.tick(RETURN_DELAY_MS);
  assert.equal(click.returns(), 1);
});

test("pressing inside waits for release, and scrolling inside restarts the wait", () => {
  const t = setup();
  t.region.dispatchEvent(pointer("pointerdown"));
  t.region.dispatchEvent(pointer("pointerleave"));
  t.timers.tick(10_000);
  assert.equal(t.returns(), 0);
  t.doc.dispatchEvent(pointer("pointerup"));

  t.timers.tick(2000);
  t.region.dispatchEvent(new Event("scroll"));
  t.timers.tick(2000);
  assert.equal(t.returns(), 0);
  t.timers.tick(1000);
  assert.equal(t.returns(), 1);
});

test("touch never returns by time — only the explicit back button does", () => {
  const t = setup();
  t.doc.dispatchEvent(pointer("pointerdown", "touch"));
  t.region.dispatchEvent(pointer("pointerdown", "touch"));
  t.doc.dispatchEvent(pointer("pointerup", "touch"));
  t.outside.dispatchEvent(new Event("click"));
  t.doc.dispatchEvent(new Event("click"));
  t.timers.tick(60_000);

  assert.equal(t.returns(), 0);
  assert.equal(t.timers.size, 0);
});

test("the rail is suspended while the wide dialog covers it", () => {
  const t = setup();
  t.region.dispatchEvent(pointer("pointerleave"));
  t.attention.update({ suspended: true });
  t.timers.tick(10_000);
  assert.equal(t.returns(), 0);

  t.doc.elementFromPoint = () => t.outside;
  t.attention.update({ suspended: false });
  t.timers.tick(RETURN_DELAY_MS);
  assert.equal(t.returns(), 1);
});

test("destroying the region clears its timer", () => {
  const t = setup();
  t.region.dispatchEvent(pointer("pointerleave"));
  assert.equal(t.attention.pending, true);
  t.attention.destroy();
  t.timers.tick(10_000);
  assert.equal(t.returns(), 0);
  assert.equal(t.timers.size, 0);
});

/* ── motion preference ───────────────────────────────────────── */

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
}

test("the motion switch is remembered, and reduced motion always wins", () => {
  const storage = memoryStorage();
  const preference = createMotionPreference({ storage });
  let changes = 0;
  preference.subscribe(() => (changes += 1));
  preference.set("off");

  assert.equal(preference.enabled, false);
  assert.equal(storage.getItem(MOTION_STORAGE_KEY), "off");
  assert.equal(changes, 1);
  assert.equal(createMotionPreference({ storage }).choice, "off");

  const query = Object.assign(new EventTarget(), { matches: true });
  const reduced = createMotionPreference({ storage: memoryStorage(), reducedQuery: query });
  assert.equal(reduced.choice, "on");
  assert.equal(reduced.enabled, false);
  query.dispatchEvent(Object.assign(new Event("change"), { matches: false }));
  assert.equal(reduced.enabled, true);
});
