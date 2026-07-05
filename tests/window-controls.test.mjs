import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  base: new URL("../src/layouts/Base.astro", import.meta.url),
  page: new URL("../src/pages/pages/[slug].astro", import.meta.url),
  post: new URL("../src/pages/posts/[slug].astro", import.meta.url),
  postListWindow: new URL("../src/components/PostListWindow.astro", import.meta.url),
  search: new URL("../src/pages/search.astro", import.meta.url),
  script: new URL("../static/js/window-controls.js", import.meta.url),
  css: new URL("../static/css/site.css", import.meta.url),
  topBar: new URL("../src/components/TopBar.astro", import.meta.url),
};

test("content windows expose real filebar controls without a separate move button", async () => {
  const [base, page, post, postListWindow, search] = await Promise.all([
    readFile(files.base, "utf8"),
    readFile(files.page, "utf8"),
    readFile(files.post, "utf8"),
    readFile(files.postListWindow, "utf8"),
    readFile(files.search, "utf8"),
  ]);

  assert.match(base, /\/js\/window-controls\.js/);
  for (const source of [page, post, postListWindow, search]) {
    assert.match(source, /data-content-window/);
    assert.match(source, /data-window-action="close"/);
    assert.match(source, /data-window-action="minimize"/);
    assert.match(source, /data-window-action="maximize"/);
    assert.doesNotMatch(source, /data-window-action="move"/);
    assert.doesNotMatch(source, /filebar-control--move/);
    assert.doesNotMatch(source, /<span><\/span><span><\/span><span><\/span>/);
  }
});

test("top search hosts the content-window drag reset control", async () => {
  const topBar = await readFile(files.topBar, "utf8");

  assert.match(topBar, /class="top-bar-drag-reset"/);
  assert.match(topBar, /data-window-drag-reset/);
  assert.match(topBar, /aria-label="창 위치 초기화"/);
});

test("window controls close only restores a maximized card", async () => {
  const script = await readFile(files.script, "utf8");

  assert.match(script, /const maximizedBodyClass = "has-maximized-content-window"/);
  assert.match(script, /const restore = \(card\) => \{/);
  assert.match(script, /const toggleMinimize = \(card\) => \{/);
  assert.match(script, /card\.classList\.contains\(minimizeClass\)/);
  assert.match(script, /restore\(card\)/);
  assert.match(script, /const close = \(card\) => \{/);
  assert.match(script, /card\.classList\.contains\(maximizeClass\)/);
  assert.match(script, /card\.classList\.remove\(maximizeClass\)/);
  assert.match(script, /updateDragMode\(\)/);
  assert.match(script, /if \(action === "minimize"\) toggleMinimize\(card\)/);
  assert.match(script, /minimize\(card\)/);
  assert.match(script, /Escape/);
});

test("window controls drag directly from the filebar and reset without recentering minimize", async () => {
  const script = await readFile(files.script, "utf8");

  assert.match(script, /const dragReset = document\.querySelector\("\[data-window-drag-reset\]"\)/);
  assert.match(script, /const dragState = new WeakMap\(\)/);
  assert.match(script, /const draggingClass = "is-dragging"/);
  assert.match(script, /const dragModeClass = "has-window-drag-mode"/);
  assert.match(script, /const railToggles = \[\.\.\.document\.querySelectorAll\("\[data-drag-rail-toggle\]"\)\]/);
  assert.match(script, /--window-drag-x/);
  assert.match(script, /--window-drag-y/);
  assert.match(script, /setPointerCapture/);
  assert.match(script, /const resetDraggedWindows = \(\) => \{/);
  assert.match(script, /const updateDragMode = \(\) => \{/);
  assert.match(script, /card\.classList\.contains\(maximizeClass\)/);
  assert.match(script, /is-rail-left-open/);
  assert.match(script, /is-rail-right-open/);
  assert.match(script, /is-rail-left-peeking/);
  assert.match(script, /is-rail-right-peeking/);
  assert.match(script, /window\.addEventListener\("pointermove", updateRailPeek\)/);
  assert.match(script, /filebar\?\.addEventListener\("pointerdown", \(event\) => \{/);
  assert.match(script, /target\.closest\("\[data-window-action\]"\)/);
  assert.match(script, /startDrag\(card, event\)/);
  assert.match(script, /dragReset\.addEventListener\("click", resetDraggedWindows\)/);
  assert.doesNotMatch(script, /moveClass|is-drag-armed|toggleMove|action === "move"|data-window-action="move"/);
  const minimizeBody = script.match(/const minimize = \(card\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  assert.doesNotMatch(minimizeBody, /resetDraggedWindows\(|--window-drag-x|--window-drag-y/);
});

test("window control css defines minimized and maximized states", async () => {
  const css = await readFile(files.css, "utf8");

  assert.match(css, /\.readme-card\.is-minimized > :not\(\.filebar\)/);
  assert.match(css, /\.readme-card\.is-maximized\s*\{[\s\S]*?position:\s*fixed/s);
  assert.match(css, /body\.has-maximized-content-window\s*\{[\s\S]*?overflow:\s*hidden/s);
  assert.match(css, /\[data-content-window\]\s*\{[\s\S]*?--window-drag-x:\s*0px/s);
  assert.match(css, /\[data-content-window\]\s*\{[\s\S]*?transform:\s*translate3d\(var\(--window-drag-x\),\s*var\(--window-drag-y\),\s*0\)/s);
  assert.match(css, /\.filebar\s*\{[\s\S]*?cursor:\s*grab/s);
  assert.match(css, /\.readme-card\.is-dragging/);
  assert.match(css, /\.readme-card\.is-dragging\s*>\s*\.filebar\s*\{[\s\S]*?cursor:\s*grabbing/s);
  assert.match(css, /\.readme-card\.is-maximized\s*\{[\s\S]*?z-index:\s*180/s);
  assert.match(css, /\.top-bar-drag-reset/);
  assert.match(css, /\.top-bar-drag-reset\[hidden\]/);
  assert.doesNotMatch(css, /\.filebar-control--move|is-drag-armed/);
  assert.match(css, /\.filebar-control--close/);
  assert.match(css, /\.filebar-control--maximize/);
});
