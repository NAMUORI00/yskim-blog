// Rich embeds for post content — loaded with `defer` on every page but only does
// work when the relevant elements exist:
//   - <blockquote class="twitter-tweet"> → rendered tweet via platform.twitter.com
//   - <pre class="mermaid">              → rendered diagram via mermaid (CDN, ESM)
// Both are loaded on demand so pages without embeds pay nothing.
(() => {
  const hasTweet = () => document.querySelector(".twitter-tweet");
  const hasMermaid = () => document.querySelector("pre.mermaid");

  // --- Twitter / X ---------------------------------------------------------
  function loadTwitter() {
    if (window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load();
      return;
    }
    if (document.getElementById("twitter-wjs")) {
      return;
    }
    const script = document.createElement("script");
    script.id = "twitter-wjs";
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.charset = "utf-8";
    document.head.appendChild(script);
  }

  // --- Mermaid -------------------------------------------------------------
  let mermaidApi = null;

  const mermaidTheme = () =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "default";

  async function loadMermaid() {
    try {
      if (!mermaidApi) {
        const mod = await import(
          "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"
        );
        mermaidApi = mod.default;
      }
      mermaidApi.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: mermaidTheme(),
      });
      await mermaidApi.run({ querySelector: "pre.mermaid:not([data-processed])" });
    } catch (error) {
      // Leave the raw source visible if the diagram fails to render.
      console.warn("mermaid render failed", error);
    }
  }

  function init() {
    if (hasTweet()) {
      loadTwitter();
    }
    if (hasMermaid()) {
      loadMermaid();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
