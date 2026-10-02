import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// The faux desktop windows (traffic-light controls, drag, minimise/maximise)
// were retired with the portfolio layout. These checks keep them from coming back.

test("no page loads the window-controls script or renders window controls", async () => {
  const base = await read("src/layouts/Base.astro");

  assert.doesNotMatch(base, /window-controls\.js/);
  assert.doesNotMatch(base, /data-window-drag-reset|top-bar-drag-reset/);
  for (const path of ["src/pages/index.astro", "src/pages/posts/[slug].astro", "src/pages/pages/[slug].astro", "src/pages/search.astro", "src/components/ArchiveView.astro"]) {
    const source = await read(path);
    assert.doesNotMatch(source, /data-content-window|data-window-action|filebar/, path);
  }
});

test("site css has no window chrome states", async () => {
  const css = await read("static/css/site.css");

  assert.doesNotMatch(css, /is-maximized|is-minimized|is-dragging|filebar-control|has-maximized-content-window/);
});
