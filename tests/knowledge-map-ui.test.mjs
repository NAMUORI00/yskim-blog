import test, { after } from "node:test";
import assert from "node:assert/strict";

import { buildKnowledgeMapPayload } from "../src/lib/graph/payload.mjs";
import { buildTaxonomy } from "../src/lib/taxonomy.mjs";
import { compileComponents, installDom, settle, svelteClient } from "./helpers/svelte-dom.mjs";

// The real knowledge-map components, compiled for the browser and mounted in a
// DOM, driven only by data derived from (sample) published posts.

const { window, media } = installDom({ url: "https://blog.namuori.net/posts/a/" });
const { urls, cleanup } = await compileComponents();
after(cleanup);
const { mount, unmount, flushSync } = await svelteClient();
const KnowledgeMap = (await import(urls["KnowledgeMap.svelte"])).default;

function entry(slug, categories, tags, date, body = "") {
  return { id: slug, body, data: { slug, title: `${slug} 글`, date: new Date(date), categories, tags, summary: `${slug} 요약` } };
}

const payload = JSON.parse(
  JSON.stringify(
    buildKnowledgeMapPayload(
      buildTaxonomy([
        entry("a", ["개발"], ["astro", "css"], "2026-05-01", "[b](/posts/b/)"),
        entry("b", ["개발"], ["astro"], "2026-04-01"),
        entry("c", ["일기"], ["일상"], "2026-03-01"),
        entry("d", ["운영 노트"], ["notion", "astro"], "2026-02-01"),
        entry("hidden", ["비밀"], ["draft-only"], "2026-06-01"),
      ].map((item, index) => (index === 4 ? { ...item, data: { ...item.data, draft: true } } : item))),
      { identity: { name: "KIM", handle: "namuori" } },
    ),
  ),
);

let fetchImpl = async () => ({ ok: true, status: 200, json: async () => structuredClone(payload) });
globalThis.fetch = (...args) => fetchImpl(...args);

const document = window.document;

async function mountMap(props) {
  const host = document.createElement("div");
  host.setAttribute("data-km-host", "");
  document.body.append(host);
  const component = mount(KnowledgeMap, { target: host, props: { src: "/knowledge-map.json", ...props } });
  for (let round = 0; round < 20 && !["ready", "failed", "empty"].includes(host.getAttribute("data-km-state")); round += 1) {
    await settle(2);
    flushSync();
  }
  return {
    host,
    $: (selector) => host.querySelector(selector),
    $$: (selector) => [...host.querySelectorAll(selector)],
    destroy() {
      unmount(component);
      host.remove();
    },
  };
}

const pointer = (type, pointerType = "mouse") => new window.PointerEvent(type, { pointerType, bubbles: type !== "pointerenter" && type !== "pointerleave" });
const key = (name) => new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });

test("the rail mounts from the published data: categories are keyboard targets, Me stays unnamed until hovered", async () => {
  const map = await mountMap({ current: "post:a", variant: "rail" });
  try {
    assert.equal(map.host.getAttribute("data-km-state"), "ready");
    const categories = map.$$("button.kg3-domain");
    assert.equal(categories.length, 3);
    assert.ok(categories.every((button) => /펼치기$/.test(button.getAttribute("aria-label"))));
    assert.equal(categories.filter((button) => button.getAttribute("tabindex") === "0").length, 1);
    assert.equal(map.$(".kg3-core-label b").textContent, "Me");
    assert.equal(map.$('g.kg3-node[data-current="true"]').getAttribute("data-id"), "post:a");
    assert.equal(map.$$("g.kg3-node").length, 8);
    assert.equal(map.$('[data-node-id="post:hidden"]'), null, "a draft reached the map");
    const panel = map.$(".km-inspector").textContent;
    assert.match(panel, /지금 읽는 글/);
    assert.match(panel, /a 글/);
    assert.match(panel, /이어 읽기/);
  } finally {
    map.destroy();
  }
});

test("hovering a star previews it in the panel and names it on the globe", async () => {
  const map = await mountMap({ current: null, variant: "rail" });
  try {
    map.$('.kg3-star[data-node-id="post:b"]').dispatchEvent(pointer("pointerenter"));
    flushSync();
    assert.match(map.$(".km-inspector").textContent, /미리 보기[\s\S]*b 글/);
    assert.ok(map.$('.kg3-label[data-node-id="post:b"]'));
    assert.equal(map.$('.kg3-domain[data-domain="개발"]').getAttribute("data-state"), "focus");

    map.$('.kg3-star[data-node-id="post:b"]').dispatchEvent(pointer("pointerleave"));
    await new Promise((resolve) => setTimeout(resolve, 140));
    flushSync();
    assert.doesNotMatch(map.$(".km-inspector").textContent, /미리 보기/);
  } finally {
    map.destroy();
  }
});

test("choosing a category unfolds category, topic, and post layers; pins, Esc, and back work", async () => {
  const map = await mountMap({ current: "post:a", variant: "rail" });
  try {
    map.$('button.kg3-domain[data-domain="개발"]').click();
    flushSync();
    assert.ok(map.$(".kg3-dv"), "layers did not open");
    assert.equal(map.$(".kg3-dv-title b").textContent, "개발");
    assert.equal(map.$(".kg3-globe").getAttribute("aria-hidden"), "true");
    assert.deepEqual(
      map.$$("button.km-node").map((node) => node.getAttribute("data-layer")).sort(),
      ["category", "post", "post", "topic", "topic"],
    );
    assert.deepEqual(map.$$(".km-layer-title .km-layer-name").map((node) => node.textContent), ["카테고리", "주제", "글"]);
    assert.match(map.$('[aria-live="polite"]').textContent, /개발 펼침/);

    const post = map.$('button.km-node[data-node-id="post:b"]');
    post.click();
    flushSync();
    assert.equal(map.$('button.km-node[data-node-id="post:b"]').getAttribute("aria-pressed"), "true");
    assert.ok(map.$('.kg3-mode-row[data-mode="pinned"]'));
    assert.ok([...map.host.querySelectorAll(".km-locate")].some((link) => link.getAttribute("href") === "/posts/b/"));

    map.$(".km-surface").dispatchEvent(key("Escape"));
    flushSync();
    assert.equal(map.$('.kg3-mode-row[data-mode="pinned"]'), null, "Esc did not unpin first");
    assert.ok(map.$(".kg3-dv"));

    map.$(".km-surface").dispatchEvent(key("Escape"));
    flushSync();
    assert.equal(map.$(".kg3-dv"), null, "second Esc did not return to the globe");

    map.$('button.kg3-domain[data-domain="일기"]').click();
    flushSync();
    map.$(".kg3-back").click();
    flushSync();
    assert.equal(map.$(".kg3-dv"), null, "explicit back did not return");
  } finally {
    map.destroy();
  }
});

test("leaving the map and panel for 3 s folds back; keyboard focus inside and touch input do not", async (t) => {
  const map = await mountMap({ current: null, variant: "rail" });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const surface = map.$(".km-surface");
    const open = () => {
      map.$('button.kg3-domain[data-domain="개발"]').click();
      flushSync();
      assert.ok(map.$(".kg3-dv"));
    };

    open();
    surface.dispatchEvent(pointer("pointerenter"));
    surface.dispatchEvent(pointer("pointerleave"));
    t.mock.timers.tick(2900);
    flushSync();
    assert.ok(map.$(".kg3-dv"), "returned too early");
    t.mock.timers.tick(150);
    flushSync();
    assert.equal(map.$(".kg3-dv"), null, "did not return after leaving");

    open();
    document.dispatchEvent(key("Tab"));
    map.$("button.km-node").focus();
    surface.dispatchEvent(pointer("pointerleave"));
    t.mock.timers.tick(10_000);
    flushSync();
    assert.ok(map.$(".kg3-dv"), "keyboard focus inside was reset");
    map.$(".kg3-back").click();
    flushSync();

    open();
    document.dispatchEvent(new window.PointerEvent("pointerdown", { pointerType: "touch", bubbles: true }));
    surface.dispatchEvent(pointer("pointerleave", "touch"));
    t.mock.timers.tick(10_000);
    flushSync();
    assert.ok(map.$(".kg3-dv"), "touch input returned by time");
    map.$(".kg3-back").click();
    flushSync();
    assert.equal(map.$(".kg3-dv"), null);
  } finally {
    t.mock.timers.reset();
    document.dispatchEvent(new window.PointerEvent("pointerdown", { pointerType: "mouse", bubbles: true }));
    map.destroy();
  }
});

test("the motion switch is off under reduced motion and remembered otherwise", async () => {
  const reduced = await mountMap({ variant: "rail" });
  try {
    const button = reduced.$(".kg3-motion");
    assert.equal(button.disabled, true);
    assert.match(button.textContent, /기기 설정/);
  } finally {
    reduced.destroy();
  }

  media.reduced = false;
  const moving = await mountMap({ variant: "rail" });
  try {
    const button = moving.$(".kg3-motion");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    button.click();
    flushSync();
    assert.equal(moving.$(".kg3-motion").getAttribute("aria-pressed"), "false");
    assert.equal(window.localStorage.getItem("yskim-map-motion"), "off");
    assert.equal(moving.$(".kg3-canvas").getAttribute("data-motion"), "off");
  } finally {
    moving.destroy();
    window.localStorage.removeItem("yskim-map-motion");
    media.reduced = true;
  }
});

test("the wide view is a modal dialog with a list view; Esc steps back before it closes", async () => {
  const map = await mountMap({ current: null, variant: "rail" });
  try {
    const expand = map.$(".km-expand");
    expand.click();
    flushSync();
    await settle(2);
    const dialog = map.$("dialog.km-dialog");
    assert.ok(dialog, "dialog missing");
    assert.equal(dialog.open, true);
    assert.ok(dialog.querySelector('.km-surface[data-variant="explorer"]'));

    [...dialog.querySelectorAll(".km-segment button")].find((button) => button.textContent === "목록").click();
    flushSync();
    const outline = dialog.querySelector(".km-outline");
    assert.ok(outline);
    assert.deepEqual([...outline.querySelectorAll(".kg3-outline-field")].map((button) => button.textContent), ["개발", "운영 노트", "일기"]);

    [...outline.querySelectorAll(".kg3-outline-field")][0].click();
    flushSync();
    assert.ok(map.$(".km-surface[data-variant='rail'] .kg3-dv"), "rail did not follow the shared state");

    dialog.dispatchEvent(key("Escape"));
    flushSync();
    assert.equal(map.$("dialog.km-dialog")?.open, true, "Esc closed instead of returning to the whole view");
    assert.equal(map.$(".km-surface[data-variant='rail'] .kg3-dv"), null);

    dialog.dispatchEvent(key("Escape"));
    flushSync();
    await settle(2);
    flushSync();
    assert.equal(map.$("dialog.km-dialog"), null, "dialog stayed open");
    assert.equal(document.activeElement, expand, "focus did not return to the opener");
  } finally {
    map.destroy();
  }
});

test("the compact card shows a still globe and opens the same wide view", async () => {
  const map = await mountMap({ current: "post:c", variant: "compact" });
  try {
    assert.ok(map.$(".km-compact .kg3-canvas"));
    assert.equal(map.$(".km-compact .kg3-overlay").getAttribute("aria-hidden"), "true");
    assert.equal(map.$$(".km-compact button.kg3-domain").length, 0, "the thumbnail should not be interactive");
    assert.equal(map.$(".km-compact-count").textContent, "글 4개, 주제 4개");
    map.$(".km-drawer-open").click();
    flushSync();
    await settle(2);
    assert.equal(map.$("dialog.km-dialog")?.open, true);
    map.$(".km-dialog-close").click();
    flushSync();
    await settle(2);
    assert.equal(map.$("dialog.km-dialog"), null);
  } finally {
    map.destroy();
  }
});

test("when the data cannot load, the island says so and leaves the plain list", async () => {
  const previous = fetchImpl;
  fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const map = await mountMap({ variant: "rail" });
  try {
    assert.equal(map.host.getAttribute("data-km-state"), "failed");
    assert.match(map.host.textContent, /지도를 불러오지 못했습니다/);
  } finally {
    fetchImpl = previous;
    map.destroy();
  }
});
