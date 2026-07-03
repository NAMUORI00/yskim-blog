(() => {
  const TAU = Math.PI * 2;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;

  function readCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function getColors() {
    return {
      edge: readCssVar("--line-strong", "#c7ccbf"),
      edgeFocus: readCssVar("--accent", "#305c47"),
      main: readCssVar("--accent-strong", "#162f25"),
      post: readCssVar("--accent", "#305c47"),
      tag: readCssVar("--muted", "#71786f"),
      nodeStroke: readCssVar("--panel", "#ffffff"),
      text: readCssVar("--text", "#23271f"),
      muted: readCssVar("--muted", "#71786f"),
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

  function hashFraction(value, salt) {
    let hash = 2166136261;
    const str = `${salt}:${value}`;
    for (let index = 0; index < str.length; index += 1) {
      hash ^= str.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 10000) / 10000;
  }

  function truncate(label, max) {
    if (!label) return "";
    return label.length > max ? `${label.slice(0, max - 1)}...` : label;
  }

  const levelOf = (type) => (type === "main" ? 0 : type === "post" ? 1 : 2);

  function initGraph(root) {
    const canvas = root.querySelector(".knowledge-graph-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const data = parseData(root);
    const rawNodes = data.nodes || [];
    if (rawNodes.length === 0) return;

    const degree = new Map(rawNodes.map((node) => [node.id, 0]));
    for (const link of data.links || []) {
      if (degree.has(link.source)) degree.set(link.source, degree.get(link.source) + 1);
      if (degree.has(link.target)) degree.set(link.target, degree.get(link.target) + 1);
    }

    const radiusFor = (node) => {
      const weight = degree.get(node.id) || 0;
      if (node.type === "main") return 8.5;
      if (node.type === "post") return 5.4 + Math.min(2.4, weight * 0.5);
      return 3.8 + Math.min(2.8, weight * 0.75);
    };

    const nodes = rawNodes.map((node) => ({
      ...node,
      level: levelOf(node.type),
      r: radiusFor(node),
      x: 0,
      y: 0,
      focus: node.active ? 1 : 0,
      targetFocus: node.active ? 1 : 0,
    }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const links = (data.links || [])
      .map((link) => ({ source: nodeById.get(link.source), target: nodeById.get(link.target) }))
      .filter((link) => link.source && link.target);

    const adjacency = new Map(nodes.map((node) => [node.id, new Set([node.id])]));
    const incident = new Map(nodes.map((node) => [node.id, []]));
    for (const link of links) {
      adjacency.get(link.source.id).add(link.target.id);
      adjacency.get(link.target.id).add(link.source.id);
      incident.get(link.source.id).push(link);
      incident.get(link.target.id).push(link);
    }

    const activeNode = nodes.find((node) => node.active) || nodes.find((node) => node.type === "main") || null;
    const state = {
      width: 0,
      height: 0,
      dpr: 1,
      pointer: null,
      focusNode: activeNode,
      laidOut: false,
      raf: 0,
    };

    let colors = getColors();
    let fontFamily = getFontFamily();

    const refreshTheme = () => {
      colors = getColors();
      fontFamily = getFontFamily();
    };

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const width = Math.max(rect.width, 1);
      const height = Math.max(rect.height, 1);
      const dpr = window.devicePixelRatio || 1;
      const changed = width !== state.width || height !== state.height || dpr !== state.dpr;
      state.width = width;
      state.height = height;
      state.dpr = dpr;
      if (changed) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      return changed;
    };

    const parentIdFor = (node) => {
      let best = null;
      for (const link of incident.get(node.id)) {
        const other = link.source.id === node.id ? link.target : link.source;
        if (other.level < node.level && (!best || other.id.localeCompare(best.id) < 0)) {
          best = other;
        }
      }
      return best?.id || null;
    };

    const ringRadius = (level) => {
      const base = Math.min(state.width, state.height);
      if (level === 0) return 0;
      if (level === 1) return base * 0.28;
      return base * 0.43;
    };

    const siblingSpread = (level, count) => {
      if (count <= 1) return 0;
      if (level === 1) return TAU / count;
      return Math.min(0.62, Math.PI / Math.max(4, count + 1));
    };

    const layout = () => {
      const centerX = state.width / 2;
      const centerY = state.height / 2;
      const pad = 18;
      const angles = new Map();

      for (let level = 0; level <= 2; level += 1) {
        const levelNodes = nodes
          .filter((node) => node.level === level)
          .sort((a, b) => hashFraction(a.id, "order") - hashFraction(b.id, "order") || a.id.localeCompare(b.id));
        const groups = new Map();
        for (const node of levelNodes) {
          const parentId = level === 0 ? "root" : parentIdFor(node) ?? "free";
          groups.set(parentId, [...(groups.get(parentId) ?? []), node]);
        }

        for (const [parentId, children] of groups.entries()) {
          const ring = ringRadius(level);
          const spread = siblingSpread(level, children.length);
          children.forEach((node, index) => {
            let angle = -Math.PI / 2;
            if (level > 0) {
              const parentAngle = angles.get(parentId);
              if (parentAngle != null) {
                const jitter = (hashFraction(node.id, "jitter") - 0.5) * spread * 0.32;
                angle = parentAngle + (index - (children.length - 1) / 2) * spread + jitter;
              } else {
                angle = -Math.PI / 2 + index * (TAU / Math.max(1, children.length));
              }
            }
            node.x = clamp(centerX + Math.cos(angle) * ring, pad, state.width - pad);
            node.y = clamp(centerY + Math.sin(angle) * ring, pad, state.height - pad);
            angles.set(node.id, angle);
          });
        }
      }

      state.laidOut = true;
    };

    const pointerInfluence = (node) => {
      if (!state.pointer) return 0;
      const reach = Math.min(state.width, state.height) * 0.32;
      const distance = Math.hypot(node.x - state.pointer.x, node.y - state.pointer.y);
      return clamp(1 - distance / reach, 0, 1);
    };

    const nearestNode = (x, y) => {
      let best = null;
      let bestDistance = Infinity;
      for (const node of nodes) {
        const distance = Math.hypot(node.x - x, node.y - y);
        const hitRadius = Math.max(22, node.r + 12);
        if (distance <= hitRadius && distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
      }
      return best;
    };

    const updateTargets = () => {
      const focusIds = adjacency.get(state.focusNode?.id) || new Set();
      for (const node of nodes) {
        const connected = focusIds.has(node.id);
        const proximity = pointerInfluence(node);
        node.targetFocus = Math.max(
          node.active ? 0.65 : 0,
          connected ? 1 : 0,
          proximity * 0.72,
        );
      }
    };

    const draw = () => {
      if (!state.laidOut) return;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      ctx.clearRect(0, 0, state.width, state.height);

      const focusIds = adjacency.get(state.focusNode?.id) || new Set();
      for (const link of links) {
        const focused = focusIds.has(link.source.id) && focusIds.has(link.target.id);
        const sourceFocus = Math.max(link.source.focus, link.target.focus);
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.strokeStyle = focused ? colors.edgeFocus : colors.edge;
        ctx.globalAlpha = focused ? 0.34 + sourceFocus * 0.28 : 0.18;
        ctx.lineWidth = focused ? 1.1 + sourceFocus * 0.8 : 0.8;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const node of nodes) {
        const focus = node.focus;
        const radius = node.r * (1 + focus * 0.32);
        let fill = colors.post;
        if (node.type === "main") fill = colors.main;
        if (node.type === "tag") fill = colors.tag;

        if (focus > 0.18) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 5 + focus * 4, 0, TAU);
          ctx.fillStyle = colors.edgeFocus;
          ctx.globalAlpha = 0.08 + focus * 0.12;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, TAU);
        ctx.fillStyle = fill;
        ctx.globalAlpha = 0.54 + focus * 0.42;
        ctx.fill();
        ctx.lineWidth = 0.8 + focus * 1.1;
        ctx.strokeStyle = focus > 0.5 ? colors.edgeFocus : colors.nodeStroke;
        ctx.globalAlpha = 0.8 + focus * 0.2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      for (const node of nodes) {
        const showLabel = node.type === "main" || node.active || node.focus > 0.62;
        if (!showLabel) continue;
        const label = truncate(node.label, node.type === "tag" ? 14 : 20);
        const radius = node.r * (1 + node.focus * 0.32);
        const fontSize = node.type === "main" ? 11 : 9.5;
        ctx.font = `${node.focus > 0.5 ? "700" : "600"} ${fontSize}px ${fontFamily}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = colors.labelBg;
        ctx.globalAlpha = 0.86;
        ctx.strokeText(label, node.x, node.y - radius - 5);
        ctx.globalAlpha = 1;
        ctx.fillStyle = node.focus > 0.5 || node.type === "main" ? colors.text : colors.muted;
        ctx.fillText(label, node.x, node.y - radius - 5);
      }
    };

    const animateFocus = () => {
      state.raf = 0;
      let needsNext = false;
      for (const node of nodes) {
        const next = prefersReduced ? node.targetFocus : lerp(node.focus, node.targetFocus, 0.22);
        if (Math.abs(next - node.targetFocus) > 0.01) needsNext = true;
        node.focus = needsNext ? next : node.targetFocus;
      }
      draw();
      if (needsNext) state.raf = requestAnimationFrame(animateFocus);
    };

    const scheduleFocus = () => {
      updateTargets();
      if (!state.raf) state.raf = requestAnimationFrame(animateFocus);
    };

    const ensureLayout = () => {
      const changed = resize();
      if (changed || !state.laidOut) layout();
      updateTargets();
      draw();
    };

    const toLocal = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onPointerMove = (event) => {
      state.pointer = toLocal(event.clientX, event.clientY);
      const hit = nearestNode(state.pointer.x, state.pointer.y);
      state.focusNode = hit || activeNode;
      canvas.style.cursor = hit?.url ? "pointer" : "default";
      scheduleFocus();
    };

    const onPointerLeave = () => {
      state.pointer = null;
      state.focusNode = activeNode;
      canvas.style.cursor = "default";
      scheduleFocus();
    };

    const onClick = (event) => {
      const point = toLocal(event.clientX, event.clientY);
      const hit = nearestNode(point.x, point.y);
      if (hit?.url) window.location.href = hit.url;
    };

    ensureLayout();
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);

    const resizeObserver = new ResizeObserver(ensureLayout);
    resizeObserver.observe(root);

    window.addEventListener("yskim:theme-change", () => {
      refreshTheme();
      draw();
    });
    window.addEventListener("load", () => {
      refreshTheme();
      ensureLayout();
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
