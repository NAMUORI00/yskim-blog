import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cssUrl = new URL("../static/css/site.css", import.meta.url);
const baseUrl = new URL("../src/layouts/Base.astro", import.meta.url);
const pretendardUrl =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
const googleFontsUrl =
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Serif+KR:wght@500;600;700&display=swap";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function themeBlock(css, selector) {
  const match = css.match(new RegExp(`${selector}\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Missing theme block for ${selector}`);
  return match[0];
}

function ruleContaining(css, selector) {
  const rules = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
  const rule = rules.find((candidate) => candidate.slice(0, candidate.indexOf("{")).includes(selector));
  assert.ok(rule, `Missing CSS rule containing ${selector}`);
  return rule;
}

function assertPreloadLink(base, href) {
  const links = base.match(/<link\b[\s\S]*?\/>/g) ?? [];
  const link = links.find((candidate) => candidate.includes(`href="${href}"`) && candidate.includes('rel="preload"'));
  assert.ok(link, `Missing preload link for ${href}`);
  assert.match(link, /as="style"/);
  assert.match(link, /onload="this\.onload=null;this\.rel='stylesheet'"/);
}

test("site css inherits the portfolio light and dark color tokens", async () => {
  const css = await readFile(cssUrl, "utf8");
  const light = themeBlock(css, ":root,\\s*html\\.theme-light,\\s*body\\.theme-light");
  const dark = themeBlock(css, ':root\\[data-theme="dark"\\],\\s*html\\.theme-dark,\\s*body\\.theme-dark');

  assert.match(light, /--bg:\s*#f7f7f3;/);
  assert.match(light, /--panel:\s*#ffffff;/);
  assert.match(light, /--line:\s*#deded6;/);
  assert.match(light, /--text:\s*#171a17;/);
  assert.match(light, /--accent:\s*#275f47;/);
  assert.match(light, /--accent-soft:\s*#e7f1ea;/);

  assert.match(dark, /--bg:\s*#171a17;/);
  assert.match(dark, /--panel:\s*#20251f;/);
  assert.match(dark, /--line:\s*#343b33;/);
  assert.match(dark, /--text:\s*#f0eee8;/);
  assert.match(dark, /--accent:\s*#74c69d;/);
  assert.match(dark, /--accent-soft:\s*#1f3328;/);
});

test("site css defines the portfolio typography roles", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(css, /--font-sans:\s*"Pretendard Variable"/);
  assert.match(css, /--font-serif:\s*"Noto Serif KR"/);
  assert.match(css, /--font-mono:\s*"JetBrains Mono"/);
  assert.match(css, /body\s*\{[\s\S]*font-family:\s*var\(--font-sans\)/);
  assert.match(ruleContaining(css, ".eyebrow"), /font-family:\s*var\(--font-mono\)/);
  assert.match(ruleContaining(css, ".page-header-kicker"), /font-family:\s*var\(--font-mono\)/);
});

test("base layout preloads external fonts without delaying theme bootstrap", async () => {
  const base = await readFile(baseUrl, "utf8");
  const viewportIndex = base.indexOf('<meta name="viewport" content="width=device-width, initial-scale=1" />');
  const cdnPreconnectIndex = base.indexOf('<link rel="preconnect" href="https://cdn.jsdelivr.net" />');
  const googlePreconnectIndex = base.indexOf('<link rel="preconnect" href="https://fonts.googleapis.com" />');
  const gstaticPreconnectIndex = base.indexOf('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />');
  const bootstrapIndex = base.indexOf('localStorage.getItem("yskim-theme")');
  const siteCssIndex = base.indexOf("/css/site.css");
  const themeJsIndex = base.indexOf("/js/theme.js");

  assert.ok(viewportIndex >= 0, "Missing viewport meta");
  assert.ok(cdnPreconnectIndex > viewportIndex, "CDN preconnect should follow viewport meta");
  assert.ok(googlePreconnectIndex > viewportIndex, "Google Fonts preconnect should follow viewport meta");
  assert.ok(gstaticPreconnectIndex > viewportIndex, "Google static preconnect should follow viewport meta");

  assertPreloadLink(base, pretendardUrl);
  assertPreloadLink(base, googleFontsUrl);
  assert.match(base, /localStorage\.getItem\("yskim-theme"\)/);
  assert.match(base, /document\.documentElement\.dataset\.theme = theme/);
  assert.ok(bootstrapIndex >= 0, "Missing theme bootstrap");
  assert.ok(siteCssIndex > bootstrapIndex, "Theme bootstrap should run before site.css is discovered");
  assert.ok(themeJsIndex > bootstrapIndex, "Theme bootstrap should run before theme.js is discovered");

  const preBootstrap = base.slice(0, bootstrapIndex);
  const preBootstrapWithoutNoscript = preBootstrap.replace(/<noscript\b[\s\S]*?<\/noscript>/g, "");
  assert.doesNotMatch(
    preBootstrapWithoutNoscript,
    new RegExp(`<link\\s[\\s\\S]*?rel="stylesheet"[\\s\\S]*?href="${escapeRegExp(pretendardUrl)}"[\\s\\S]*?/>`),
  );
  assert.doesNotMatch(
    preBootstrapWithoutNoscript,
    new RegExp(`<link\\s[\\s\\S]*?rel="stylesheet"[\\s\\S]*?href="${escapeRegExp(googleFontsUrl)}"[\\s\\S]*?/>`),
  );
});
