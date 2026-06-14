// @ts-check
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import sitemap from "@astrojs/sitemap";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// https://astro.build/config
export default defineConfig({
  site: "https://blog.namuori.net",
  // Reuse the existing Hugo static directory so Notion-generated assets
  // (/images/notion, /files/notion) and shared css/js keep their URLs.
  publicDir: "./static",
  // Match the previous Hugo URLs (/posts/<slug>/, /pages/<slug>/).
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  integrations: [svelte(), sitemap()],
  markdown: {
    // Notion video/audio/iframe blocks are emitted as raw HTML and must render.
    // Astro preserves raw HTML in Markdown by default.
    smartypants: false,
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
