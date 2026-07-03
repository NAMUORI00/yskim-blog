import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  css: new URL("../static/css/site.css", import.meta.url),
  enhance: new URL("../src/styles/enhance.css", import.meta.url),
  profileRail: new URL("../src/components/ProfileRail.astro", import.meta.url),
  sidebar: new URL("../src/components/Sidebar.astro", import.meta.url),
};

function selectorList(selectorText) {
  return selectorText.split(",").map((selector) => selector.trim());
}

function findRule(css, predicate, label) {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const rule = rules.find(([, selector, body]) => predicate(selector.trim(), body));
  assert.ok(rule, `Missing CSS rule for ${label}`);
  return { selector: rule[1].trim(), body: rule[2], text: rule[0] };
}

function ruleForSelector(css, selector) {
  return findRule(css, (selectorText) => selectorList(selectorText).includes(selector), selector);
}

function ruleForSelectors(css, selectors) {
  return findRule(
    css,
    (selectorText) => {
      const current = selectorList(selectorText);
      return selectors.every((selector) => current.includes(selector));
    },
    selectors.join(", "),
  );
}

function ruleForSelectorsWith(css, selectors, bodyPattern, label) {
  return findRule(
    css,
    (selectorText, body) => {
      const current = selectorList(selectorText);
      return selectors.every((selector) => current.includes(selector)) && bodyPattern.test(body);
    },
    label,
  );
}

function mediaBlock(css, query) {
  const start = css.indexOf(query);
  assert.ok(start >= 0, `Missing media block ${query}`);

  const open = css.indexOf("{", start);
  assert.ok(open >= 0, `Missing media block body for ${query}`);

  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }

  assert.fail(`Unclosed media block ${query}`);
}

test("profile and sidebar asides expose contextual landmark labels", async () => {
  const [profileRail, sidebar] = await Promise.all([
    readFile(files.profileRail, "utf8"),
    readFile(files.sidebar, "utf8"),
  ]);

  assert.match(profileRail, /<aside class="profile-rail" aria-label="Profile and categories">/);
  assert.match(sidebar, /<aside class="blog-sidebar" aria-label="Blog context">/);
});

test("site css applies shell surface polish and keeps the mobile graph visible", async () => {
  const css = await readFile(files.css, "utf8");
  const topBar = ruleForSelector(css, ".top-bar");
  const surfaceRule = ruleForSelectors(css, [
    ".profile-rail",
    ".sidebar-card",
    ".readme-card",
    ".post-card",
    ".archive-heading",
  ]);
  const railSurfaceRule = ruleForSelectorsWith(
    css,
    [".profile-rail", ".sidebar-card"],
    /background:/,
    ".profile-rail, .sidebar-card background",
  );
  const activeRule = ruleForSelectors(css, [
    ".rail-category-list a.is-active",
    ".sidebar-nav a.is-active",
    ".top-bar-nav a.is-active",
  ]);
  const mobile = mediaBlock(css, "@media (max-width: 600px)");

  assert.match(topBar.body, /background:\s*var\(--panel-glass\)/);
  assert.match(topBar.body, /border-bottom:\s*1px solid var\(--line\)/);
  assert.match(topBar.body, /backdrop-filter:\s*blur\(14px\)/);
  assert.match(surfaceRule.body, /border-color:\s*var\(--line\)/);
  assert.match(surfaceRule.body, /box-shadow:\s*var\(--shadow-soft\)/);
  assert.match(railSurfaceRule.body, /linear-gradient\(\s*180deg,\s*color-mix\(in srgb,\s*var\(--accent-soft\)\s*44%,\s*transparent\),\s*transparent\s*42%\s*\)/);
  assert.match(railSurfaceRule.body, /var\(--panel\)/);
  assert.match(ruleForSelector(css, ".post-card").body, /min-height:\s*148px/);
  assert.match(ruleForSelectors(css, [
    ".post-card-meta",
    ".post-card-category",
    ".page-header-count",
    ".filebar",
    ".sidebar-post time",
  ]).body, /font-family:\s*var\(--font-mono\)/);
  assert.match(activeRule.body, /color:\s*var\(--accent-strong\)/);
  assert.match(activeRule.body, /background:\s*var\(--accent-soft\)/);
  assert.match(activeRule.body, /border-color:\s*var\(--accent-border\)/);
  assert.match(ruleForSelector(mobile, ".sidebar-graph-card").body, /display:\s*grid/);
  assert.match(ruleForSelector(mobile, ".sidebar-graph-canvas").body, /max-height:\s*240px/);
  assert.match(ruleForSelector(mobile, ".knowledge-scene").body, /display:\s*none/);
});

test("enhance css animates signal details only when motion is allowed", async () => {
  const enhance = await readFile(files.enhance, "utf8");
  const motion = mediaBlock(enhance, "@media (prefers-reduced-motion: no-preference)");
  const reduced = mediaBlock(enhance, "@media (prefers-reduced-motion: reduce)");

  assert.match(ruleForSelector(motion, ".home-hero__signal").body, /animation:\s*signal-drift 18s linear infinite/);
  assert.match(ruleForSelector(motion, ".signal-orbit").body, /animation:\s*signal-pulse 3\.8s ease-in-out infinite/);
  assert.match(ruleForSelector(motion, ".signal-orbit--two").body, /animation-duration:\s*5\.4s/);
  assert.match(ruleForSelectors(motion, [".sidebar-card:hover", ".profile-rail:hover"]).body, /border-color:\s*color-mix\(in srgb,\s*var\(--accent\)\s*38%,\s*var\(--line\)\)/);
  assert.match(motion, /@keyframes signal-drift/);
  assert.match(motion, /@keyframes signal-pulse/);
  assert.match(ruleForSelectors(reduced, ["*", "*::before", "*::after"]).body, /animation-duration:\s*0\.001ms !important/);
  assert.match(ruleForSelectors(reduced, ["*", "*::before", "*::after"]).body, /animation-iteration-count:\s*1 !important/);
  assert.match(ruleForSelectors(reduced, ["*", "*::before", "*::after"]).body, /scroll-behavior:\s*auto !important/);
  assert.match(ruleForSelector(reduced, ".knowledge-scene").body, /display:\s*none/);
});
