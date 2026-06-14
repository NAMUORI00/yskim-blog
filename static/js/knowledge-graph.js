(() => {
  // Knowledge graph rendered the way namuori.net (the portfolio) does it:
  // a STATIC, deterministic radial layout (user → posts → tags). Nodes never
  // drift — only their glow gently twinkles and the focused sub-graph lights up,
  // matching the portfolio's "neural" pulse. A continuous animation loop drives
  // the twinkle AND guarantees the canvas paints as soon as it has a size (the
  // old event-only draw could leave it blank until a hover/resize/refresh).

  const TAU = Math.PI * 2;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function readCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function getColors() {
    return {
      bg: readCssVar("--panel-soft", "#f6f7f3"),
      orbit: readCssVar("--accent", "#305c47"),
      grid: readCssVar("--muted", "#71786f"),
      edge: readCssVar("--line-strong", "#cfd2c8"),
      edgeLit: readCssVar("--accent", "#305c47"),
      profile: readCssVar("--accent-strong", "#162f25"),
      post: readCssVar("--accent", "#305c47"),
      tag: readCssVar("--muted", "#71786f"),
      glow: readCssVar("--accent", "#305c47"),
      text: readCssVar("--text", "#23271f"),
      textMuted: readCssVar("--muted", "#71786f"),
      labelBg: readCssVar("--panel", "#ffffff"),
    };
  }

  function getFontFamily() {
    return getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  }

  function parseData(root) {
    const el = root.querySelector(".knowledge-graph-data");
    if (!el) return { nodes: [], links: [] };
    const raw = el instanceof HTMLTemplateElement ? el.content.textContent : el.textContent;
    try {
      let data = JSON.parse(raw.trim());
      if (typeof data === "string") data = JSON.parse(data);
      return data;
    } catch {
      return { nodes: [], links: [] };
    }
  }

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  // Deterministic 0..1 fraction from a string — keeps layout stable across reloads.
  function hashFraction(value, salt) {
    let hash = 2166136261;
    const str = `${salt}:${value}`;
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 10000) / 10000;
  }

  function truncate(label, max) {
    if (!label) return "";
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
  }

  const levelOf = (type) => (type === "main" ? 0 : type === "post" ? 1 : 2);

  function initGraph(root) {
    const canvas = root.querySelector(".knowledge-graph-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const data = parseData(root);
    const rawNodes = data.nodes || [];
    if (rawNodes.length === 0) return;

    const degree = new Map(rawNodes.map((n) => [n.id, 0]));
    (data.links || []).forEach((l) => {
      if (degree.has(l.source)) degree.set(l.source, degree.get(l.source) + 1);
      if (degree.has(l.target)) degree.set(l.target, degree.get(l.target) + 1);
    });

    const radiusFor = (node) => {
      const w = degree.get(node.id) || 0;
      if (node.type === "main") return 9;
      if (node.type === "post") return 5.4 + Math.min(3, w * 0.6);
      return 3.8 + Math.min(3.6, w * 0.9); // shared tags grow a little
    };

    const nodes = rawNodes.map((n) => ({
      ...n,
      level: levelOf(n.type),
      r: radiusFor(n),
      x: 0,
      y: 0,
      // per-node twinkle phase/speed so glows shimmer out of sync (calm, starlike)
      phase: hashFraction(n.id, "twinkle") * TAU,
      twspeed: 0.6 + hashFraction(n.id, "speed") * 0.7,
    }));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const links = (data.links || [])
      .map((l) => ({ source: nodeById.get(l.source), target: nodeById.get(l.target), w: 1 }))
      .filter((l) => l.source && l.target);

    // adjacency for hover highlighting + parent resolution
    const adj = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    const incident = new Map(nodes.map((n) => [n.id, []]));
    links.forEach((l) => {
      adj.get(l.source.id).add(l.target.id);
      adj.get(l.target.id).add(l.source.id);
      incident.get(l.source.id).push(l);
      incident.get(l.target.id).push(l);
    });

    const activeNode = nodes.find((n) => n.active) || null;

    const state = { width: 0, height: 0, dpr: 1, pointer: null, hover: activeNode || null, laidOut: false };

    // Cache theme colors / font so the continuous loop never forces a style
    // recalc per frame; refreshed on init and on the theme-change event.
    let colors = getColors();
    let fontFamily = getFontFamily();
    const refreshTheme = () => {
      colors = getColors();
      fontFamily = getFontFamily();
    };

    // bend amount per edge — deterministic, gives the soft "neural" curve
    const bendFor = (l) => (hashFraction(`${l.source.id}-${l.target.id}`, "bend") - 0.5);

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const w = Math.max(rect.width, 1);
      const h = Math.max(rect.height, 1);
      const dpr = window.devicePixelRatio || 1;
      const changed = w !== state.width || h !== state.height || dpr !== state.dpr;
      state.width = w;
      state.height = h;
      state.dpr = dpr;
      if (changed) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
      return changed;
    };

    // --- static radial layout (ported from the portfolio) --------------------
    const ringRadius = (level) => {
      const base = Math.min(state.width, state.height);
      if (level === 0) return 0;
      if (level === 1) return base * 0.27;
      return base * 0.43;
    };
    const siblingSpread = (level, count) => {
      if (count <= 1) return 0;
      if (level === 1) return (Math.PI * 2) / count;
      return Math.min(0.6, Math.PI / Math.max(4, count + 2));
    };

    const parentIdFor = (node) => {
      let best = null;
      for (const l of incident.get(node.id)) {
        const other = l.source.id === node.id ? l.target : l.source;
        if (other.level < node.level) {
          if (!best || other.id.localeCompare(best.id) < 0) best = other;
        }
      }
      return best ? best.id : null;
    };

    const layout = () => {
      const cx = state.width / 2;
      const cy = state.height / 2;
      const pad = 18;
      const angles = new Map();
      for (let level = 0; level <= 2; level += 1) {
        const levelNodes = nodes
          .filter((n) => n.level === level)
          .sort((a, b) => hashFraction(a.id, "order") - hashFraction(b.id, "order") || a.id.localeCompare(b.id));
        const groups = new Map();
        levelNodes.forEach((n) => {
          const parentId = level === 0 ? "root" : parentIdFor(n) ?? "free";
          groups.set(parentId, [...(groups.get(parentId) ?? []), n]);
        });
        groups.forEach((children, parentId) => {
          const ring = ringRadius(level);
          const spread = siblingSpread(level, children.length);
          children.forEach((node, index) => {
            let angle = -Math.PI / 2;
            if (level > 0) {
              const parentAngle = angles.get(parentId);
              if (parentAngle != null) {
                const jitter = (hashFraction(node.id, "jit") - 0.5) * spread * 0.34;
                angle = parentAngle + (index - (children.length - 1) / 2) * spread + jitter;
              } else {
                const orbit = Math.max(1, children.length);
                angle = -Math.PI / 2 + index * ((Math.PI * 2) / orbit) + (hashFraction(node.id, "free") - 0.5) * 0.16;
              }
            }
            node.x = clamp(cx + Math.cos(angle) * ring, pad, state.width - pad);
            node.y = clamp(cy + Math.sin(angle) * ring, pad, state.height - pad);
            angles.set(node.id, angle);
          });
        });
      }
      state.laidOut = true;
    };

    // pointer proximity → gentle per-node scale (the calm "breathing" effect)
    const influenceOf = (node) => {
      if (!state.pointer) return 0;
      const reach = Math.min(state.width, state.height) * 0.34;
      const dist = Math.hypot(node.x - state.pointer.x, node.y - state.pointer.y);
      return clamp(1 - dist / reach, 0, 1);
    };

    const draw = (now) => {
      if (!state.laidOut) return;
      const t = prefersReduced ? 0 : now / 1000; // seconds
      const focus = state.hover;
      const connected = adj.get(focus?.id) || null;

      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      ctx.clearRect(0, 0, state.width, state.height);

      // ambient backdrop: soft vignette + dotted grid
      const cx = state.width / 2;
      const cy = state.height / 2;
      const grad = ctx.createRadialGradient(cx, cy * 0.96, 0, cx, cy * 0.96, Math.min(state.width, state.height) * 0.62);
      grad.addColorStop(0, `${colors.glow}1f`);
      grad.addColorStop(0.6, `${colors.glow}08`);
      grad.addColorStop(1, `${colors.glow}00`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, state.width, state.height);

      ctx.fillStyle = colors.grid;
      ctx.globalAlpha = 0.12;
      for (let gy = 9; gy < state.height; gy += 18) {
        for (let gx = 9; gx < state.width; gx += 18) {
          ctx.beginPath();
          ctx.arc(gx, gy, 0.75, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      // faint orbit rings — dash slowly flows around (portfolio's neuralDrift)
      ctx.strokeStyle = colors.orbit;
      ctx.setLineDash([2, 8]);
      [0.27, 0.43].forEach((f, i) => {
        ctx.beginPath();
        ctx.globalAlpha = i === 0 ? 0.16 : 0.12;
        ctx.lineWidth = 0.8;
        ctx.lineDashOffset = i === 0 ? -t * 6 : t * 4;
        ctx.arc(cx, cy, Math.min(state.width, state.height) * f, 0, TAU);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;

      // curved links
      links.forEach((l) => {
        const lit = !focus || l.source.id === focus.id || l.target.id === focus.id;
        const sx = l.source.x;
        const sy = l.source.y;
        const tx = l.target.x;
        const ty = l.target.y;
        const dx = tx - sx;
        const dy = ty - sy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const nx = -dy / dist;
        const ny = dx / dist;
        const bend = bendFor(l) * clamp(dist * 0.34, 14, 38);
        const c1x = sx + dx * 0.34 + nx * bend;
        const c1y = sy + dy * 0.34 + ny * bend;
        const c2x = sx + dx * 0.66 + nx * bend;
        const c2y = sy + dy * 0.66 + ny * bend;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tx, ty);
        ctx.strokeStyle = lit && focus ? colors.edgeLit : colors.edge;
        ctx.globalAlpha = focus ? (lit ? 0.5 : 0.08) : 0.32;
        ctx.lineWidth = lit && focus ? 1.4 : 0.9;
        ctx.lineCap = "round";
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // focus ripple — an expanding ring on the focused node (neuralPulse)
      if (focus && !prefersReduced) {
        const cycle = (now % 2400) / 2400; // 0..1
        const baseR = focus.r * (1 + influenceOf(focus) * 0.16);
        ctx.beginPath();
        ctx.arc(focus.x, focus.y, baseR + 3 + cycle * 14, 0, TAU);
        ctx.strokeStyle = colors.glow;
        ctx.globalAlpha = (1 - cycle) * 0.3;
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // nodes
      nodes.forEach((node) => {
        const influence = influenceOf(node);
        const scale = 1 + influence * 0.16;
        const r = node.r * scale;
        const lit = !focus || connected.has(node.id);
        const isFocus = focus?.id === node.id;
        // twinkle: 0..1 glow shimmer, calm amplitude, out of sync per node
        const twinkle = prefersReduced ? 0 : 0.5 + 0.5 * Math.sin(t * node.twspeed + node.phase);
        let fill = colors.post;
        if (node.type === "main") fill = colors.profile;
        else if (node.type === "tag") fill = colors.tag;

        // glow halo — breathes near the cursor / when focused, and softly twinkles
        const haloAlpha = Math.max(isFocus ? 0.2 : 0.05, influence * 0.16) + twinkle * 0.06 * (lit ? 1 : 0.4);
        if (haloAlpha > 0.02) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + (isFocus ? 8 : 4) + twinkle * 1.6, 0, TAU);
          ctx.fillStyle = colors.glow;
          ctx.globalAlpha = haloAlpha;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, TAU);
        ctx.fillStyle = fill;
        const baseAlpha = lit ? Math.min(0.96, 0.74 + influence * 0.12) : Math.max(0.2, influence * 0.4);
        ctx.globalAlpha = clamp(baseAlpha + (lit ? twinkle * 0.05 : 0), 0, 1);
        ctx.fill();
        ctx.lineWidth = isFocus ? 1.5 : 0.85;
        ctx.strokeStyle = isFocus ? colors.edgeLit : colors.bg;
        ctx.globalAlpha = lit ? 1 : 0.4;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // labels: only the user node, the current post, and the hovered node
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      nodes.forEach((node) => {
        const show = node.type === "main" || node.active || node.id === focus?.id;
        if (!show) return;
        const influence = influenceOf(node);
        const r = node.r * (1 + influence * 0.16);
        const isEmph = node.id === focus?.id || node.type === "main" || node.active;
        const fontSize = node.type === "main" ? 11 : 9.5;
        ctx.font = `${isEmph ? "600" : "500"} ${fontSize}px ${fontFamily}`;
        const text = truncate(node.label, node.type === "tag" ? 14 : 20);
        const ty = node.y - r - 5;
        ctx.lineWidth = 3;
        ctx.strokeStyle = colors.labelBg;
        ctx.globalAlpha = 0.85;
        ctx.strokeText(text, node.x, ty);
        ctx.globalAlpha = 1;
        ctx.fillStyle = isEmph ? colors.text : colors.textMuted;
        ctx.fillText(text, node.x, ty);
      });
    };

    // --- animation loop ------------------------------------------------------
    let rafId = 0;
    let running = false;
    let onScreen = false;

    const frame = (now) => {
      if (!running) return;
      draw(now);
      rafId = requestAnimationFrame(frame);
    };
    const startLoop = () => {
      if (running || prefersReduced || document.hidden || !onScreen) return;
      running = true;
      rafId = requestAnimationFrame(frame);
    };
    const stopLoop = () => {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };
    // Single paint for the static / reduced-motion path (and as a safety net).
    const paintOnce = () => requestAnimationFrame((now) => draw(now));

    const toLocal = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const pickNode = (x, y) => {
      let best = null;
      let bestDist = Infinity;
      for (const node of nodes) {
        const d = Math.hypot(node.x - x, node.y - y);
        if (d <= node.r + 11 && d < bestDist) {
          bestDist = d;
          best = node;
        }
      }
      return best;
    };

    const onPointerMove = (event) => {
      const p = toLocal(event.clientX, event.clientY);
      state.pointer = p;
      const hit = pickNode(p.x, p.y);
      state.hover = hit || activeNode || null;
      canvas.style.cursor = hit && hit.url ? "pointer" : "default";
      if (!running) paintOnce();
    };

    const onPointerLeave = () => {
      state.pointer = null;
      state.hover = activeNode || null;
      if (!running) paintOnce();
    };

    const onClick = (event) => {
      const p = toLocal(event.clientX, event.clientY);
      const hit = pickNode(p.x, p.y);
      if (hit && hit.url) window.location.href = hit.url;
    };

    const ensureLayout = () => {
      const changed = resize();
      if (changed || !state.laidOut) layout();
      return changed;
    };

    // Initial build + paint. The loop (or paintOnce) guarantees the first paint
    // happens once the element actually has a size — no hover/refresh needed.
    ensureLayout();
    paintOnce();

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    const resizeObserver = new ResizeObserver(() => {
      if (ensureLayout() && !running) paintOnce();
    });
    resizeObserver.observe(root);

    // Run the loop only while the graph is on screen (saves CPU/battery).
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          onScreen = entry.isIntersecting;
          if (onScreen) {
            ensureLayout();
            startLoop();
            if (!running) paintOnce();
          } else {
            stopLoop();
          }
        }
      },
      { threshold: 0 },
    );
    io.observe(root);

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopLoop();
      else startLoop();
    });

    // Re-resolve theme colors and repaint when the user toggles light/dark.
    window.addEventListener("yskim:theme-change", () => {
      refreshTheme();
      if (!running) paintOnce();
    });

    // Cold-load safety net: fonts/CSS may settle after the deferred script runs.
    window.addEventListener("load", () => {
      refreshTheme();
      ensureLayout();
      if (!running) paintOnce();
    });
  }

  function boot() {
    document.querySelectorAll("[data-knowledge-graph]").forEach(initGraph);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
