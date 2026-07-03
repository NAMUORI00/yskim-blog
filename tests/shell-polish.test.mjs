import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  css: new URL("../static/css/site.css", import.meta.url),
  enhance: new URL("../src/styles/enhance.css", import.meta.url),
  base: new URL("../src/layouts/Base.astro", import.meta.url),
  profileRail: new URL("../src/components/ProfileRail.astro", import.meta.url),
  sidebar: new URL("../src/components/Sidebar.astro", import.meta.url),
  topBar: new URL("../src/components/TopBar.astro", import.meta.url),
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
  const [profileRail, sidebar, base, topBar] = await Promise.all([
    readFile(files.profileRail, "utf8"),
    readFile(files.sidebar, "utf8"),
    readFile(files.base, "utf8"),
    readFile(files.topBar, "utf8"),
  ]);

  assert.match(profileRail, /<aside class="profile-rail" aria-label="Profile and categories">/);
  assert.match(profileRail, /<div class="profile-intro">/);
  assert.match(profileRail, /class="profile-address"/);
  assert.match(profileRail, /class="profile-address-label">주소<\/p>/);
  assert.match(profileRail, /class="profile-link-list"/);
  assert.match(profileRail, /class="profile-link-favicon"/);
  assert.match(profileRail, /faviconFor\(link\.href\)/);
  assert.match(profileRail, /\{ label: "Portfolio", href: SITE\.portfolio \}/);
  assert.doesNotMatch(profileRail, /href="\/index\.xml"|blog\.namuori\.net/);
  assert.match(sidebar, /<aside class="blog-sidebar" aria-label="Blog context">/);
  assert.match(sidebar, /class="blog-sidebar-panel"/);
  assert.match(base, /class="site-footer__inner"/);
  assert.match(base, /class="site-footer__license"/);
  assert.match(base, /class="footer-primary"/);
  assert.match(topBar, /import \{ getCategories, categoryUrl \} from "\.\.\/lib\/posts";/);
  assert.match(topBar, /class="top-bar-categories"/);
  assert.match(topBar, /class="top-bar-category-menu"/);
  assert.match(topBar, /category\.count/);
  assert.doesNotMatch(topBar, /top-bar-external/);

  const profileOrder = [
    profileRail.indexOf('aria-label="프로필"'),
    profileRail.indexOf("World Calling"),
    profileRail.indexOf('class="profile-address"'),
    profileRail.indexOf('aria-label="링크"'),
    profileRail.indexOf("aria-label={UI.categories}"),
  ];
  assert.ok(profileOrder.every((index) => index >= 0), "Profile rail is missing a requested section");
  assert.ok(
    profileOrder.every((index, i, order) => i === 0 || order[i - 1] < index),
    "Profile rail sections should be ordered profile, intro, address, links, categories",
  );
});

test("site css applies shell surface polish and keeps the mobile graph visible", async () => {
  const css = await readFile(files.css, "utf8");
  const topBar = ruleForSelector(css, ".top-bar");
  const surfaceRule = ruleForSelectors(css, [
    ".profile-rail",
    ".blog-sidebar-panel",
    ".readme-card",
    ".post-card",
    ".archive-heading",
  ]);
  const railSurfaceRule = ruleForSelectorsWith(
    css,
    [".profile-rail", ".blog-sidebar-panel"],
    /background:/,
    ".profile-rail, .blog-sidebar-panel background",
  );
  const activeRule = ruleForSelectors(css, [
    ".rail-category-list a.is-active",
    ".sidebar-nav a.is-active",
    ".top-bar-nav a.is-active",
  ]);
  const mobile = mediaBlock(css, "@media (max-width: 600px)");
  const tablet = mediaBlock(css, "@media (max-width: 900px)");

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
  assert.match(ruleForSelector(css, ".top-bar-categories").body, /position:\s*relative/);
  assert.match(ruleForSelector(css, ".top-bar-category-menu").body, /position:\s*absolute/);
  assert.match(ruleForSelectors(css, [".top-bar-category-menu a.is-active", ".top-bar-category-menu a:hover"]).body, /border-left-color:\s*var\(--accent\)/);
  assert.match(ruleForSelector(css, ".profile-section").body, /border-top:\s*1px solid var\(--line-soft\)/);
  assert.match(ruleForSelector(css, ".profile-address").body, /font-style:\s*normal/);
  assert.match(ruleForSelector(css, ".profile-link-list a").body, /grid-template-columns:\s*18px minmax\(0,\s*1fr\)/);
  assert.match(ruleForSelector(css, ".profile-link-favicon").body, /width:\s*16px/);
  assert.match(ruleForSelector(css, ".blog-sidebar-panel").body, /display:\s*grid/);
  assert.match(ruleForSelector(css, ".sidebar-card").body, /box-shadow:\s*none/);
  assert.match(ruleForSelector(mobile, ".sidebar-graph-card").body, /display:\s*grid/);
  assert.match(ruleForSelector(mobile, ".sidebar-graph-canvas").body, /max-height:\s*240px/);
  assert.match(ruleForSelector(mobile, ".knowledge-graph-canvas").body, /touch-action:\s*pan-y/);
  assert.doesNotMatch(css, /\.knowledge-scene/);
  assert.match(tablet, /\.profile-rail,\s*\.blog-sidebar\s*\{[^}]*align-self:\s*stretch[^}]*width:\s*100%/s);
  assert.match(tablet, /\.blog-sidebar-panel\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(200px,\s*1fr\)\)/s);
  assert.match(mobile, /\.blog-sidebar-panel\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test("desktop shell keeps portfolio-like three-column rhythm and license footer", async () => {
  const css = await readFile(files.css, "utf8");
  const desktop = mediaBlock(css, "@media (min-width: 1201px)");
  const shellGrid = ruleForSelectors(desktop, [".top-bar-inner", ".site-shell"]);
  const stickyRails = ruleForSelectors(desktop, [".profile-rail", ".blog-sidebar"]);

  assert.match(css, /--content-column-max:\s*820px/);
  assert.match(ruleForSelector(css, ".profile-intro").body, /grid-template-columns:\s*56px minmax\(0,\s*1fr\)/);
  assert.match(ruleForSelector(css, ".profile-bio").body, /font-size:\s*var\(--font-xs\)/);
  assert.match(ruleForSelector(css, ".profile-link-list").body, /display:\s*grid/);
  assert.match(shellGrid.body, /grid-template-columns:\s*var\(--rail-width\) minmax\(0,\s*var\(--content-column-max\)\) var\(--sidebar-width\)/);
  assert.match(ruleForSelectorsWith(desktop, [".top-bar-inner"], /display:\s*grid/, ".top-bar-inner desktop grid").body, /display:\s*grid/);
  assert.match(ruleForSelectorsWith(desktop, [".site-shell"], /align-items:\s*start/, ".site-shell desktop alignment").body, /align-items:\s*start/);
  assert.match(stickyRails.body, /position:\s*sticky/);
  assert.doesNotMatch(desktop, /position:\s*fixed/);
  assert.match(ruleForSelector(css, ".site-footer").body, /border-top:\s*1px solid var\(--line\)/);
  assert.match(ruleForSelector(css, ".site-footer").body, /font-family:\s*var\(--font-mono\)/);
  assert.match(ruleForSelector(css, ".site-footer").body, /font-size:\s*0\.65rem/);
  assert.match(ruleForSelectorsWith(css, [".site-footer__inner"], /justify-content:\s*space-between/, ".site-footer__inner spacing").body, /justify-content:\s*space-between/);
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
  assert.match(ruleForSelectors(reduced, ["*", "*::before", "*::after"]).body, /transition-duration:\s*0\.001ms !important/);
  assert.match(ruleForSelectors(reduced, ["*", "*::before", "*::after"]).body, /transition-delay:\s*0ms !important/);
  assert.match(ruleForSelectors(reduced, ["*", "*::before", "*::after"]).body, /scroll-behavior:\s*auto !important/);
  assert.doesNotMatch(reduced, /\.knowledge-scene/);
});
