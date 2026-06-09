(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function readCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function getColors() {
    return {
      edge: readCssVar("--line-strong", "#cfd2c8"),
      edgeHover: readCssVar("--accent", "#305c47"),
      nodeFill: readCssVar("--panel", "#ffffff"),
      nodeStroke: readCssVar("--muted", "#71786f"),
      mainFill: readCssVar("--accent", "#305c47"),
      mainStroke: readCssVar("--accent-strong", "#162f25"),
      tagFill: readCssVar("--accent-soft", "#edf3ed"),
      tagStroke: readCssVar("--accent-border", "#d9e0d4"),
    };
  }

  function radiusForType(type) {
    if (type === "main") return 10;
    if (type === "tag") return 6;
    return 7;
  }

  function parseData(root) {
    const el = root.querySelector(".knowledge-graph-data");
    if (!el) return { nodes: [], links: [] };
    const raw =
      el instanceof HTMLTemplateElement
        ? el.content.textContent
        : el.textContent;
    try {
      let data = JSON.parse(raw.trim());
      if (typeof data === "string") data = JSON.parse(data);
      return data;
    } catch {
      return { nodes: [], links: [] };
    }
  }

  function initGraph(root) {
    const canvas = root.querySelector(".knowledge-graph-canvas");
    if (!canvas) return;

    const data = parseData(root);
    const nodes = (data.nodes || []).map((node, index) => ({
      ...node,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      fx: null,
      fy: null,
      r: radiusForType(node.type),
      index,
    }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const links = (data.links || [])
      .map((link) => ({
        source: nodeById.get(link.source),
        target: nodeById.get(link.target),
      }))
      .filter((link) => link.source && link.target);

    if (nodes.length === 0) return;

    const mainNode = nodes.find((node) => node.type === "main");
    if (mainNode) {
      mainNode.fx = 0;
      mainNode.fy = 0;
    }

    const state = {
      width: 0,
      height: 0,
      dpr: 1,
      alpha: 1,
      dragging: null,
      hover: null,
      pointer: { x: 0, y: 0, active: false },
      moved: false,
    };

    const resize = () => {
      const rect = root.getBoundingClientRect();
      state.width = Math.max(rect.width, 1);
      state.height = Math.max(rect.height, 1);
      state.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(state.width * state.dpr);
      canvas.height = Math.floor(state.height * state.dpr);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    };

    const placeInitial = () => {
      const size = Math.min(state.width, state.height);
      const children = nodes.filter((node) => node.type !== "main");

      if (mainNode) {
        mainNode.x = 0;
        mainNode.y = 0;
        const ring = size * 0.44;
        children.forEach((node, index) => {
          const angle = (index / Math.max(children.length, 1)) * Math.PI * 2 - Math.PI / 2;
          node.x = Math.cos(angle) * ring;
          node.y = Math.sin(angle) * ring;
        });
        return;
      }

      const spread = size * 0.4;
      nodes.forEach((node, index) => {
        const angle = (index / nodes.length) * Math.PI * 2;
        node.x = Math.cos(angle) * spread;
        node.y = Math.sin(angle) * spread;
      });
    };

    const simulate = () => {
      const size = Math.min(state.width, state.height);
      const centerStrength = mainNode ? 0.008 : 0.02;
      const chargeStrength = -780;
      const hubLinkDistance = size * 0.4;
      const peerLinkDistance = size * 0.28;
      const linkStrength = 0.08;
      const collisionPad = 10;
      const pointerStrength = 0.018;

      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const force = chargeStrength / (dist * dist);
          dx = (dx / dist) * force;
          dy = (dy / dist) * force;
          if (a.fx == null) {
            a.vx -= dx;
            a.vy -= dy;
          }
          if (b.fx == null) {
            b.vx += dx;
            b.vy += dy;
          }
        }
      }

      links.forEach((link) => {
        const { source, target } = link;
        let dx = target.x - source.x;
        let dy = target.y - source.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const touchesHub = source.type === "main" || target.type === "main";
        const linkDistance = touchesHub ? hubLinkDistance : peerLinkDistance;
        const force = (dist - linkDistance) * linkStrength;
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        if (source.fx == null) {
          source.vx += dx;
          source.vy += dy;
        }
        if (target.fx == null) {
          target.vx -= dx;
          target.vy -= dy;
        }
      });

      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const minDist = a.r + b.r + collisionPad;
          if (dist < minDist) {
            const push = (minDist - dist) / dist * 0.85;
            dx *= push;
            dy *= push;
            if (a.fx == null) {
              a.x -= dx;
              a.y -= dy;
            }
            if (b.fx == null) {
              b.x += dx;
              b.y += dy;
            }
          }
        }
      }

      if (state.pointer.active) {
        nodes.forEach((node) => {
          if (node.fx != null) return;
          const dx = state.pointer.x - node.x;
          const dy = state.pointer.y - node.y;
          const dist = Math.hypot(dx, dy) || 1;
          const falloff = Math.max(0, 1 - dist / (Math.min(state.width, state.height) * 0.55));
          node.vx += (dx / dist) * pointerStrength * falloff * 60;
          node.vy += (dy / dist) * pointerStrength * falloff * 60;
        });
      }

      nodes.forEach((node) => {
        if (node.fx != null) {
          node.x = node.fx;
          node.y = node.fy;
          node.vx = 0;
          node.vy = 0;
          return;
        }
        node.vx += -node.x * centerStrength;
        node.vy += -node.y * centerStrength;
        node.vx *= 0.86;
        node.vy *= 0.86;
        node.x += node.vx * state.alpha;
        node.y += node.vy * state.alpha;
      });

      state.alpha += (0.02 - state.alpha) * 0.08;
    };

    const draw = () => {
      const ctx = canvas.getContext("2d");
      const colors = getColors();
      const cx = state.width / 2;
      const cy = state.height / 2;
      const hoverId = state.hover?.id;
      const linked = new Set();

      if (hoverId) {
        linked.add(hoverId);
        links.forEach((link) => {
          if (link.source.id === hoverId) linked.add(link.target.id);
          if (link.target.id === hoverId) linked.add(link.source.id);
        });
      }

      ctx.clearRect(0, 0, state.width, state.height);
      ctx.save();
      ctx.translate(cx, cy);

      links.forEach((link) => {
        const active = hoverId && (link.source.id === hoverId || link.target.id === hoverId);
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.strokeStyle = active ? colors.edgeHover : colors.edge;
        ctx.globalAlpha = active ? 1 : 0.75;
        ctx.lineWidth = active ? 1.6 : 1.2;
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      nodes.forEach((node) => {
        const active = !hoverId || linked.has(node.id);
        let fill = colors.nodeFill;
        let stroke = colors.nodeStroke;
        if (node.type === "main") {
          fill = colors.mainFill;
          stroke = colors.mainStroke;
        } else if (node.type === "tag") {
          fill = colors.tagFill;
          stroke = colors.tagStroke;
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.globalAlpha = active ? 1 : 0.28;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = active && node.id === hoverId ? 2 : 1.4;
        ctx.stroke();
      });

      ctx.restore();
    };

    const toWorld = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left - state.width / 2,
        y: clientY - rect.top - state.height / 2,
      };
    };

    const pickNode = (x, y) => {
      for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i];
        const dist = Math.hypot(node.x - x, node.y - y);
        if (dist <= node.r + 3) return node;
      }
      return null;
    };

    const onPointerMove = (event) => {
      const point = toWorld(event.clientX, event.clientY);
      state.pointer.x = point.x;
      state.pointer.y = point.y;
      state.pointer.active = true;
      state.alpha = Math.max(state.alpha, 0.35);

      if (state.dragging) {
        state.moved = true;
        state.dragging.fx = point.x;
        state.dragging.fy = point.y;
        canvas.classList.add("is-dragging");
        return;
      }

      state.hover = pickNode(point.x, point.y);
      canvas.style.cursor = state.hover?.url ? "pointer" : "grab";
    };

    const onPointerDown = (event) => {
      const point = toWorld(event.clientX, event.clientY);
      const node = pickNode(point.x, point.y);
      if (!node || node.type === "main") return;
      state.dragging = node;
      state.moved = false;
      node.fx = point.x;
      node.fy = point.y;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging");
    };

    const onPointerUp = (event) => {
      const point = toWorld(event.clientX, event.clientY);
      if (state.dragging) {
        if (!state.moved && state.dragging.url) {
          window.location.href = state.dragging.url;
        }
        if (state.dragging.type !== "main") {
          state.dragging.fx = null;
          state.dragging.fy = null;
        }
        state.dragging = null;
        state.alpha = Math.max(state.alpha, 0.5);
      } else {
        const node = pickNode(point.x, point.y);
        if (node?.url) window.location.href = node.url;
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      canvas.classList.remove("is-dragging");
    };

    const onPointerLeave = () => {
      state.pointer.active = false;
      if (!state.dragging) state.hover = null;
    };

    const tick = () => {
      if (!reducedMotion) simulate();
      draw();
      if (!reducedMotion) requestAnimationFrame(tick);
    };

    resize();
    placeInitial();
    for (let i = 0; i < (reducedMotion ? 1 : 200); i += 1) simulate();
    draw();

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointercancel", onPointerUp);

    const observer = new ResizeObserver(() => {
      resize();
      if (mainNode) {
        mainNode.fx = 0;
        mainNode.fy = 0;
      }
    });
    observer.observe(root);

    if (!reducedMotion) requestAnimationFrame(tick);

    window.addEventListener("yskim:theme-change", () => draw());
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
