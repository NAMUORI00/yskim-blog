# Portfolio-Inherited 3D Blog Design

Date: 2026-07-03
Status: ready for user written-spec review
Project: `blog.namuori.net` / `yskim-blog`

## Goal

Redesign `blog.namuori.net` so it clearly belongs to the same visual system as `namuori.net`, while preserving the current Notion-backed publishing flow and every existing content surface. The blog should feel richer than the current reading shell, but the reading experience remains the primary product.

The design follows a 1:3:6 rule:

- `1` signal: forest green, active state, current location, graph focus, short motion.
- `3` structure: rails, cards, sidebars, category/tag systems, graph panels.
- `6` base: article content, page routes, typography, static HTML, comments, reactions, feeds.

## Current Project Context

The current blog is an Astro 6 and Svelte 5 site. The shared page shell is `src/layouts/Base.astro`; it loads `static/css/site.css`, `src/styles/enhance.css`, theme bootstrapping, `TopBar`, `ProfileRail`, `Sidebar`, and Svelte islands such as `BackToTop`.

Content and routes to preserve:

- Home and about-combined landing: `src/pages/index.astro`.
- Post archive and post detail: `src/pages/posts/index.astro`, `src/pages/posts/[slug].astro`.
- Category and tag routes: `src/pages/categories/[category].astro`, `src/pages/tags/[tag].astro`.
- Static Notion pages: `content/pages/about.md`, `contact.md`, `privacy.md`, `disclaimer.md`, rendered through `src/pages/pages/[slug].astro`.
- RSS and robots: `src/pages/index.xml.ts`, `src/pages/robots.txt.ts`.
- Comments, reactions, reading progress, back-to-top, media proxy, embeds, math, Mermaid, and knowledge graph behavior.

## Portfolio Source Inheritance

The portfolio code is the design source of truth, not only a visual reference.

Color tokens come from `client/src/content/theme.ts` in the portfolio:

- Light: `#f7f7f3` background, `#ffffff` surface, `#deded6` border, `#171a17` text, `#626a60` muted, `#275f47` green, `#3f8a65` green-light, `#e7f1ea` green-bg.
- Dark: `#171a17` background, `#20251f` surface, `#343b33` border, `#f0eee8` text, `#a7b0a4` muted, `#74c69d` green, `#95d8b4` green-light, `#1f3328` green-bg.

Typography rules come from `client/src/index.css` in the portfolio:

- Pretendard Variable for mixed Korean/English body and UI text.
- Noto Serif KR only for pure Korean section titles and editorial emphasis.
- JetBrains Mono for dates, numbers, slugs, code, and technical labels.

Graph interaction inherits from `client/src/components/KnowledgeGraphRail.tsx` and `client/src/lib/knowledgeGraphLayout.ts`:

- A deterministic radial layout around a profile/root node.
- Ring levels for project/post/tag depth.
- Orbit lines, node halos, focus state, and calm signal-flow motion.
- Pointer influence that gently scales nearby nodes without moving the content itself.

## Visual System

The blog keeps its existing semantic CSS variable names, but remaps the values to the portfolio palette. This avoids unnecessary component churn while making light and dark mode visually match the portfolio.

Core token mapping:

- `--bg`: portfolio background.
- `--panel`: portfolio surface.
- `--panel-soft`: portfolio green-bg for graph, hover, active, and related-content panels.
- `--surface-muted`: neutral secondary reading surface for code blocks, file bars, table heads, and low-signal containers.
- `--line`: portfolio border.
- `--text`: portfolio text.
- `--heading`: portfolio foreground, slightly weighted for headings.
- `--muted`: portfolio muted text.
- `--accent`: portfolio green.
- `--accent-strong`: stronger green or high-contrast green foreground.
- `--accent-soft`: portfolio green-bg.

Light mode should feel like a clean paper surface with quiet green signals. Dark mode should feel like a focused research desk, using the portfolio dark surface values instead of generic gray. Both modes must expose the same content, controls, graph affordances, comments, and reactions.

Typography changes:

- Add portfolio font variables to `static/css/site.css`.
- Use Pretendard for body, navigation, buttons, and cards.
- Use Noto Serif KR only for main Korean display headings where the text is primarily Korean.
- Use JetBrains Mono for dates, post metadata, slugs, counters, and graph labels.
- Remove viewport-scaled font behavior and keep responsive type changes tied to breakpoints already present in `site.css`.

## Layout Design

The current three-part shell remains the base:

- `ProfileRail` keeps identity, categories, and profile context.
- `content-column` remains the reading center.
- `Sidebar` keeps graph, recent posts, tags, and supporting navigation.

The redesign changes hierarchy, not route ownership:

- Home becomes a richer first screen with a portfolio-inherited identity band, recent writing, about content, and graph preview.
- Post detail prioritizes article reading. On desktop, graph context and related navigation stay in the side rail. On mobile, reactions, comments, graph context, and related navigation stack below the article.
- Archive, category, and tag pages use denser scanning layouts, not marketing-style hero sections.
- Legal and contact pages preserve the same shell and theme parity.

Cards and panels use small radii, restrained borders, and stable dimensions. Page sections are not nested cards. Repeated items such as post cards, sidebar cards, comment panels, and graph containers may remain framed.

## 3D And Motion Design

Three.js is an enhancement layer, not the owner of content or navigation.

Implementation should add a lazy Svelte island for a `BlogGraphScene` that renders a 3D depth layer for the home and graph areas. The underlying graph data remains available as HTML/JSON and the existing 2D graph remains the fallback.

The 3D scene should:

- Use the same nodes and links as `KnowledgeGraph.astro`.
- Represent root, posts, and tags as layered orbital points.
- Use portfolio green only for active or focused signal.
- Render with transparent background over existing themed panels.
- Stop or simplify animation under `prefers-reduced-motion: reduce`.
- Fail silently to the 2D graph when WebGL, JavaScript, or the dynamic module load is unavailable.

Motion rules:

- Motion is calm and informative: graph pulse, hover lift, reading progress, menu transitions.
- No content reflow caused by animation.
- No decorative blobs, oversized gradients, or one-note monochrome palette.
- Keep motion durations short and use existing reduced-motion protections.

## Data Flow

The content flow stays unchanged:

1. Notion content is fetched into local content by the existing scripts.
2. Astro content collections and helpers in `src/lib/posts.ts` expose posts, tags, categories, and route URLs.
3. `KnowledgeGraph.astro` builds graph JSON from published posts and tags.
4. The 2D canvas graph and the new 3D scene consume the same graph JSON.
5. Routes render static HTML first, then client islands hydrate only where needed.

This keeps Cloudflare Pages deployment and the Notion database model intact.

## Error Handling And Fallbacks

- Theme bootstrap must set the correct theme before CSS paints, preserving the current no-flash behavior in `Base.astro`.
- If local storage is unavailable, light mode is the safe fallback.
- If WebGL fails, keep the existing 2D canvas graph visible.
- If JavaScript fails, the article, archive links, tag links, RSS, legal pages, and static navigation remain usable.
- If the graph has too many nodes, show a capped visual subset while preserving full archive/tag navigation as HTML.
- If comments or reactions fail, article content and navigation remain unaffected and current status text patterns remain.
- If no posts are present, current empty-state behavior is preserved.

## Content Coverage Requirements

Every visual change must be checked against the full blog surface:

- `/`
- `/posts/`
- `/posts/[slug]/`
- `/categories/[category]/`
- `/tags/[tag]/`
- `/pages/about/`
- `/pages/contact/`
- `/pages/privacy/`
- `/pages/disclaimer/`
- `/index.xml`
- `/robots.txt`

Both light and dark mode must be verified on desktop and mobile. No feature may be dark-only, light-only, desktop-only, or dependent on the 3D scene.

## Implementation Boundaries

Expected implementation areas:

- `static/css/site.css` for token remapping, typography variables, shell polish, responsive stability, and light/dark parity.
- `src/styles/enhance.css` for motion and focus enhancements.
- `src/layouts/Base.astro` only if font loading, theme metadata, or new enhancement script loading is needed.
- `src/components/KnowledgeGraph.astro` and `static/js/knowledge-graph.js` for graph data attributes and 2D fallback alignment.
- A new Svelte island and supporting client module for the Three.js scene.
- Page/component updates only where necessary to expose the richer home and archive structure.

Out of scope:

- Changing the Notion database schema.
- Rewriting the comments or reactions backend.
- Replacing Astro with another framework.
- Removing RSS, legal pages, media proxy, math, Mermaid, embeds, or Cloudflare Pages behavior.

## Verification Plan

Before implementation is considered complete:

- Run `npm test`.
- Run `npm run build`.
- Verify the local site in a browser at desktop and mobile widths.
- Toggle light and dark mode and confirm all major routes keep the same content and controls.
- Check that reduced-motion mode disables or simplifies nonessential animation.
- Check that the 3D canvas is nonblank when enabled, correctly framed, and does not overlap text.
- Check that disabling JavaScript still leaves core navigation and content readable.
- Inspect post detail pages with comments, reactions, media embeds, math/Mermaid content, and the knowledge graph where available.

## Acceptance Criteria

The redesign is acceptable when:

- The blog visually inherits the portfolio palette, typography, and graph language.
- Light and dark modes are both complete and readable.
- The 1:3:6 balance is visible: restrained green signal, clear structural rails/cards/graphs, stable content base.
- All existing content routes and supporting features still work.
- Three.js adds depth without becoming a dependency for reading or navigation.
- Build and tests pass, with browser verification evidence collected during implementation.
