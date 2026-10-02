// Test helper: compile the knowledge-map Svelte components for the browser and
// mount them in happy-dom — no bundler, server, or network. Each test file runs
// in its own process, so the DOM globals set here stay local to it.
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { compile } from "svelte/compiler";

const componentDir = new URL("../../src/components/knowledge-map/", import.meta.url);
const svelteRoot = new URL("../../node_modules/svelte/", import.meta.url);

let svelteExports = null;

async function resolveSvelte(spec) {
  svelteExports ??= JSON.parse(await readFile(new URL("package.json", svelteRoot), "utf8")).exports;
  const key = spec === "svelte" ? "." : `./${spec.slice("svelte/".length)}`;
  const entry = svelteExports[key];
  const target = typeof entry === "string" ? entry : entry?.browser ?? entry?.default;
  if (!target) throw new Error(`Cannot resolve ${spec}`);
  return new URL(target, svelteRoot).href;
}

async function rewriteImports(code) {
  const specs = new Set([...code.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g)].map((match) => match[1]));
  const map = new Map();
  for (const spec of specs) {
    if (spec === "svelte" || spec.startsWith("svelte/")) map.set(spec, await resolveSvelte(spec));
    else if (spec.endsWith(".svelte")) map.set(spec, `./${spec.split("/").pop()}.mjs`);
    else if (spec.startsWith(".")) map.set(spec, new URL(spec, componentDir).href);
  }
  return code.replace(/((?:from\s+|import\s+))["']([^"']+)["']/g, (full, lead, spec) => (map.has(spec) ? `${lead}${JSON.stringify(map.get(spec))}` : full));
}

/**
 * Compile every component once into a temp folder. Returns `import()`-able URLs
 * by file name and a `cleanup()` that removes the folder.
 */
export async function compileComponents() {
  const out = await mkdtemp(join(tmpdir(), "yskim-km-ui-"));
  const urls = {};
  for (const file of await readdir(componentDir)) {
    if (!file.endsWith(".svelte")) continue;
    const source = await readFile(new URL(file, componentDir), "utf8");
    const { js } = compile(source, { filename: file, generate: "client", dev: false });
    const target = join(out, `${file}.mjs`);
    await writeFile(target, await rewriteImports(js.code));
    urls[file] = pathToFileURL(target).href;
  }
  return { urls, cleanup: () => rm(out, { recursive: true, force: true }) };
}

/**
 * A browser-like global environment. `reducedMotion` drives the
 * prefers-reduced-motion query; layout-free APIs get small stand-ins.
 */
export function installDom({ url = "https://blog.namuori.net/", reducedMotion = true } = {}) {
  const window = new Window({ url, width: 1440, height: 900 });
  const media = { reduced: reducedMotion };
  window.matchMedia = (query) => ({
    media: query,
    matches: /prefers-reduced-motion:\s*reduce/.test(query) ? media.reduced : false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  if (!window.CSS) window.CSS = {};
  if (typeof window.CSS.escape !== "function") window.CSS.escape = (value) => String(value).replace(/["\\]/g, "\\$&");
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // No layout engine: give the map frames the sizes CSS gives them in a browser.
  const sizes = { "kg3-frame": [292, 350], "kg3-stage": [760, 560], "kg3-thumb": [240, 216] };
  const sizeOf = (element, index) => {
    for (const [name, size] of Object.entries(sizes)) if (element.classList?.contains(name)) return size[index];
    return 0;
  };
  for (const proto of [window.Element.prototype, window.HTMLElement.prototype]) {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return sizeOf(this, 0); } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return sizeOf(this, 1); } });
  }
  const keep = new Set(["setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "console", "process", "performance", "fetch"]);
  for (const key of Object.getOwnPropertyNames(window)) {
    if (keep.has(key) || key in globalThis) continue;
    try {
      globalThis[key] = window[key];
    } catch {
      // Read-only globals stay Node's.
    }
  }
  for (const key of ["window", "document", "navigator", "location", "localStorage", "matchMedia", "CSS", "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "PointerEvent", "FocusEvent", "EventTarget", "Node", "Element", "HTMLElement", "SVGElement", "Text", "Comment", "DocumentFragment", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle"]) {
    try {
      globalThis[key] = key === "window" ? window : window[key];
    } catch {
      Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
    }
  }
  return { window, media };
}

/** Svelte's browser entry (mount, unmount, flushSync) — the same instance the compiled components use. */
export async function svelteClient() {
  return import(await resolveSvelte("svelte"));
}

export async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
