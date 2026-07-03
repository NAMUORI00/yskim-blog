import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cssUrl = new URL("../static/css/site.css", import.meta.url);
const baseUrl = new URL("../src/layouts/Base.astro", import.meta.url);

test("site css inherits the portfolio light and dark color tokens", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /--bg:\s*#f7f7f3;/);
  assert.match(css, /--panel:\s*#ffffff;/);
  assert.match(css, /--line:\s*#deded6;/);
  assert.match(css, /--text:\s*#171a17;/);
  assert.match(css, /--accent:\s*#275f47;/);
  assert.match(css, /--accent-soft:\s*#e7f1ea;/);

  assert.match(css, /--bg:\s*#171a17;/);
  assert.match(css, /--panel:\s*#20251f;/);
  assert.match(css, /--line:\s*#343b33;/);
  assert.match(css, /--text:\s*#f0eee8;/);
  assert.match(css, /--accent:\s*#74c69d;/);
  assert.match(css, /--accent-soft:\s*#1f3328;/);
});

test("site css defines the portfolio typography roles", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /--font-sans:\s*"Pretendard Variable"/);
  assert.match(css, /--font-serif:\s*"Noto Serif KR"/);
  assert.match(css, /--font-mono:\s*"JetBrains Mono"/);
  assert.match(css, /body\s*\{[\s\S]*font-family:\s*var\(--font-sans\)/);
  assert.match(css, /\.eyebrow[\s\S]*font-family:\s*var\(--font-mono\)/);
});

test("base layout loads external fonts without changing theme bootstrap", async () => {
  const base = await readFile(baseUrl, "utf8");

  assert.match(base, /cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard/);
  assert.match(base, /fonts\.googleapis\.com/);
  assert.match(base, /localStorage\.getItem\("yskim-theme"\)/);
  assert.match(base, /document\.documentElement\.dataset\.theme = theme/);
});
