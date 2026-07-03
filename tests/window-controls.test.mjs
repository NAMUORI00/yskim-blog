import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  base: new URL("../src/layouts/Base.astro", import.meta.url),
  home: new URL("../src/pages/index.astro", import.meta.url),
  page: new URL("../src/pages/pages/[slug].astro", import.meta.url),
  post: new URL("../src/pages/posts/[slug].astro", import.meta.url),
  script: new URL("../static/js/window-controls.js", import.meta.url),
  css: new URL("../static/css/site.css", import.meta.url),
};

test("content windows expose real filebar control buttons", async () => {
  const [base, home, page, post] = await Promise.all([
    readFile(files.base, "utf8"),
    readFile(files.home, "utf8"),
    readFile(files.page, "utf8"),
    readFile(files.post, "utf8"),
  ]);

  assert.match(base, /\/js\/window-controls\.js/);
  for (const source of [home, page, post]) {
    assert.match(source, /data-content-window/);
    assert.match(source, /data-window-action="close"/);
    assert.match(source, /data-window-action="minimize"/);
    assert.match(source, /data-window-action="maximize"/);
    assert.doesNotMatch(source, /<span><\/span><span><\/span><span><\/span>/);
  }
});

test("window controls close only restores a maximized card", async () => {
  const script = await readFile(files.script, "utf8");

  assert.match(script, /const restore = \(card\) => \{/);
  assert.match(script, /const toggleMinimize = \(card\) => \{/);
  assert.match(script, /card\.classList\.contains\(minimizeClass\)/);
  assert.match(script, /restore\(card\)/);
  assert.match(script, /const close = \(card\) => \{/);
  assert.match(script, /card\.classList\.contains\(maximizeClass\)/);
  assert.match(script, /card\.classList\.remove\(maximizeClass\)/);
  assert.match(script, /if \(action === "minimize"\) toggleMinimize\(card\)/);
  assert.match(script, /minimize\(card\)/);
  assert.match(script, /Escape/);
});

test("window control css defines minimized and maximized states", async () => {
  const css = await readFile(files.css, "utf8");

  assert.match(css, /\.readme-card\.is-minimized > :not\(\.filebar\)/);
  assert.match(css, /\.readme-card\.is-maximized\s*\{[\s\S]*?position:\s*fixed/s);
  assert.match(css, /body\.has-maximized-content-window\s*\{[\s\S]*?overflow:\s*hidden/s);
  assert.match(css, /\.filebar-control--close/);
  assert.match(css, /\.filebar-control--maximize/);
});
