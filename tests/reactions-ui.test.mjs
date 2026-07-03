import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  component: new URL("../src/components/Reactions.astro", import.meta.url),
  script: new URL("../static/js/reactions.js", import.meta.url),
  css: new URL("../static/css/site.css", import.meta.url),
};

test("reaction component exposes total, status labels, and richer button copy", async () => {
  const component = await readFile(files.component, "utf8");

  assert.match(component, /data-loading-label="반응을 불러오는 중"/);
  assert.match(component, /data-shared-label="공유 반응"/);
  assert.match(component, /data-reaction-total/);
  assert.match(component, /post-reaction-token/);
  assert.match(component, /post-reaction-note/);
  assert.match(component, /aria-pressed="false"/);
});

test("reaction script keeps shared counts while applying optimistic changes", async () => {
  const script = await readFile(files.script, "utf8");

  assert.match(script, /const applyReactionDelta =/);
  assert.match(script, /counts = applyReactionDelta\(counts, previousReaction, nextReaction, reactionKeys\)/);
  assert.match(script, /setStatus\(container, container\.dataset\.savingLabel\)/);
  assert.match(script, /querySelector\("\[data-reaction-total\]"\)/);
  assert.doesNotMatch(script, /counts = applyLocalSelection\(emptyCounts\(\), selected\)/);
});

test("reaction css defines a scannable total panel and stable button grid", async () => {
  const css = await readFile(files.css, "utf8");

  assert.match(css, /\.post-reactions-total/);
  assert.match(css, /\.post-reaction-buttons button\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/s);
  assert.match(css, /\.post-reaction-token/);
  assert.match(css, /\.post-reactions\.is-saving \.post-reactions-status/);
});
