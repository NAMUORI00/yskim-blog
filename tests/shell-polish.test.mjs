import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function mediaBlock(css, query) {
  const start = css.indexOf(query);
  assert.ok(start >= 0, `Missing media block ${query}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    if (depth === 0) return css.slice(open + 1, index);
  }
  assert.fail(`Unclosed media block ${query}`);
}

function rule(css, selector) {
  // A standalone rule (first occurrence): the selector starts right after the previous rule's `}`.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const match = source.match(new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS rule ${selector}`);
  return match[1];
}

test("the shell is profile rail · reading column · knowledge rail, with a skip link", async () => {
  const base = await read("src/layouts/Base.astro");
  const order = ['class="skip-link"', "<TopBar />", '<div class="site-shell">', "<ProfileRail />", '<div class="content-column" data-drawer-inert>', '<main id="main"', '<div class="km-compact-slot">', '<footer class="site-footer">', "<Sidebar />"].map(
    (marker) => base.indexOf(marker),
  );

  assert.ok(order.every((index) => index >= 0), "shell piece missing");
  assert.ok(order.every((index, i) => i === 0 || order[i - 1] < index), "shell pieces out of order");
  assert.match(base, /<KnowledgeGraph variant="compact" \/>/);
  assert.match(base, /\/css\/knowledge-map\.css/);
  assert.match(base, /const footerPageSlugs = \["privacy", "disclaimer", "contact"\]/);
  assert.match(base, /page\.data\.footer_label \|\| page\.data\.title/);
  assert.match(base, /class="footer-legal" aria-label="사이트 정보"/);
  assert.match(base, /document\.documentElement\.classList\.add\("js"\)/);
});

test("the left rail shows the Notion profile, search, navigation, categories, links, and theme", async () => {
  const [rail, profile] = await Promise.all([read("src/components/ProfileRail.astro"), read("src/lib/profile.ts")]);

  assert.match(rail, /<aside id="profile-rail" class="profile-rail"/);
  assert.match(rail, /getSiteProfile\(\)/);
  assert.match(rail, /action="\/search\/" role="search"/);
  assert.match(rail, /class="rail-nav" aria-label="주요 메뉴"/);
  assert.match(rail, /aria-current=\{item\.active \? "page" : undefined\}/);
  assert.match(rail, /<span class="rail-count">\{category\.count\}<\/span>/);
  assert.match(rail, /data-theme-set="light"/);
  assert.match(rail, /data-theme-set="dark"/);
  assert.match(profile, /findPage\("profile"\)/);
  assert.match(profile, /findPage\("links"\)/);
  assert.match(profile, /profilePage\?\.data\.profile_name \|\| gh\.name/);
  assert.match(profile, /profilePage\?\.data\.profile_address \|\| SITE\.location/);
  assert.match(profile, /\{ label: "Portfolio", href: SITE\.portfolio, note: "" \}/);
});

test("the right rail is the knowledge map; phones get a header and a drawer", async () => {
  const [sidebar, topBar, theme] = await Promise.all([read("src/components/Sidebar.astro"), read("src/components/TopBar.astro"), read("static/js/theme.js")]);

  assert.match(sidebar, /<aside id="knowledge-rail" class="knowledge-rail" aria-label="지식 지도" data-drawer-inert>/);
  assert.match(sidebar, /<KnowledgeGraph variant="rail" \/>/);
  assert.match(topBar, /aria-controls="profile-rail"/);
  assert.match(topBar, /data-theme-toggle/);
  assert.match(topBar, /href="\/search\/"/);
  assert.match(topBar, /event\.key === "Escape"/);
  assert.match(topBar, /toggleAttribute\("inert", open\)/);
  assert.match(theme, /querySelectorAll\("\[data-theme-toggle\]"\)/);
  assert.match(theme, /querySelectorAll\("\[data-theme-set\]"\)/);
});

test("desktop uses three full-height columns; tablets drop the map rail; phones stack", async () => {
  const css = await read("static/css/site.css");

  assert.match(rule(css, ".site-shell"), /grid-template-columns:\s*var\(--rail-left\) minmax\(0, 1fr\) var\(--rail-right\)/);
  const rails = rule(css, ".profile-rail,\n.knowledge-rail");
  assert.match(rails, /position:\s*sticky/);
  assert.match(rails, /height:\s*100dvh/);
  assert.match(rails, /align-self:\s*start/);

  const tablet = mediaBlock(css, "@media (max-width: 1180px)");
  assert.match(tablet, /\.knowledge-rail\s*\{\s*display:\s*none/);
  assert.match(tablet, /\.km-compact-slot\s*\{[^}]*display:\s*block/);

  const phone = mediaBlock(css, "@media (max-width: 768px)");
  assert.match(phone, /\.mobile-header\s*\{[^}]*position:\s*sticky/);
  assert.match(phone, /\.profile-rail\s*\{[^}]*visibility:\s*hidden/);
  assert.match(phone, /\.profile-rail\.is-open\s*\{[^}]*visibility:\s*visible/);
  assert.match(phone, /\.content table\s*\{[^}]*overflow-x:\s*auto/);
});

test("the footer sits at the end of the reading column instead of covering it", async () => {
  const css = await read("static/css/site.css");
  const footer = rule(css, ".site-footer");

  assert.doesNotMatch(footer, /position:\s*fixed/);
  assert.match(footer, /font-family:\s*var\(--font-mono\)/);
  assert.match(footer, /border-top:\s*1px solid var\(--line\)/);
  assert.doesNotMatch(css, /--footer-reserved/);
});

test("motion stays short, and nothing moves under reduced motion", async () => {
  const enhance = await read("src/styles/enhance.css");
  const reduced = mediaBlock(enhance, "@media (prefers-reduced-motion: reduce)");

  assert.match(reduced, /animation-duration:\s*0\.001ms !important/);
  assert.match(reduced, /transition-duration:\s*0\.001ms !important/);
  assert.match(reduced, /scroll-behavior:\s*auto !important/);
  assert.doesNotMatch(enhance, /grove|leaf-drift|infinite/);
});
