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
      postFill: readCssVar("--panel", "#ffffff"),
      postStroke: readCssVar("--muted", "#71786f"),
      activeFill: readCssVar("--accent-strong", "#162f25"),
      tagFill: readCssVar("--accent-soft", "#edf3ed"),
      tagStroke: readCssVar("--accent-border", "#d9e0d4"),
      text: readCssVar("--text", "#23271f"),
      textMuted: readCssVar("--muted", "#71786f"),
      labelBg: readCssVar("--panel", "#ffffff"),
    };
  }

  function getFontFamily() {
    const value = getComputedStyle(document.body).fontFamily;
    return value || "system-ui, sans-serif";
  }

  function radiusForType(node) {
    if (node.type === "main") return 11;
    if (node.type === "tag") return 5.5;
    return node.active ? 9 : 7;
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

  function truncate(label, max) {
    if (!label) return "";
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
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
      r: radiusForType(node),
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

    // 각 노드의 이웃(호버 강조 + 라벨용)
    const neighbors = new Map(nodes.map((node) => [node.id, new Set([node.id])]));
    links.forEach((link) => {
      neighbors.get(link.source.id).add(link.target.id);
      neighbors.get(link.target.id).add(link.source.id);
    });

    const mainNode = nodes.find((node) => node.type === "main");
    if (mainNode) {
      mainNode.fx = 0;
      mainNode.fy = 0;
    }
    const activeNode = nodes.find((node) => node.active);

    const state = {
      width: 0,
      height: 0,
      dpr: 1,
      alpha: 1,
      dragging: null,
      hover: activeNode || null,
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

    // 동심원 배치: 닉네임(중앙) → 글(안쪽 링) → 태그(바깥 링)
    const placeInitial = () => {
      const size = Math.min(state.width, state.height);
      const posts = nodes.filter((node) => node.type === "post");
      const tags = nodes.filter((node) => node.type === "tag");
      const others = nodes.filter(
        (node) => node.type !== "post" && node.type !== "tag" && node.type !== "main",
      );

      if (mainNode) {
        mainNode.x = 0;
        mainNode.y = 0;
      }

      const placeRing = (items, ring, offset = -Math.PI / 2) => {
        const count = Math.max(items.length, 1);
        items.forEach((node, index) => {
          const angle = (index / count) * Math.PI * 2 + offset;
          node.x = Math.cos(angle) * ring;
          node.y = Math.sin(angle) * ring;
        });
      };

      placeRing(posts, size * 0.26);
      // 태그는 연결된 글 근처에서 출발하도록 글 각도를 따라 배치
      const postAngle = new Map();
      posts.forEach((node, index) => {
        postAngle.set(node.id, (index / Math.max(posts.length, 1)) * Math.PI * 2 - Math.PI / 2);
      });
      tags.forEach((node, index) => {
        const link = links.find((l) => l.target.id === node.id && l.source.type === "post");
        const base = link ? postAngle.get(link.source.id) : (index / Math.max(tags.length, 1)) * Math.PI * 2;
        const jitter = ((index % 3) - 1) * 0.18;
        const angle = (base ?? 0) + jitter;
        node.x = Math.cos(angle) * size * 0.44;
        node.y = Math.sin(angle) * size * 0.44;
      });
      placeRing(others, size * 0.4);
    };

    const simulate = () => {
      const size = Math.min(state.width, state.height);
      const centerStrength = mainNode ? 0.008 : 0.02;
      const chargeStrength = -640;
      const hubLinkDistance = size * 0.3;
      const tagLinkDistance = size * 0.2;
      const linkStrength = 0.085;
      const collisionPad = 9;
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
        const linkDistance = touchesHub ? hubLinkDistance : tagLinkDistance;
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
      const fontFamily = getFontFamily();
      const cx = state.width / 2;
      const cy = state.height / 2;
      const hoverId = state.hover?.id;
      const linked = hoverId ? neighbors.get(hoverId) : null;

      ctx.clearRect(0, 0, state.width, state.height);
      ctx.save();
      ctx.translate(cx, cy);

      links.forEach((link) => {
        const active = hoverId && (link.source.id === hoverId || link.target.id === hoverId);
        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.strokeStyle = active ? colors.edgeHover : colors.edge;
        ctx.globalAlpha = hoverId ? (active ? 0.95 : 0.18) : 0.7;
        ctx.lineWidth = active ? 1.7 : 1.1;
        ctx.stroke();
      });

      ctx.globalAlpha = 1;
      nodes.forEach((node) => {
        const isLinked = !hoverId || linked.has(node.id);
        let fill = colors.nodeFill;
        let stroke = colors.nodeStroke;
        if (node.type === "main") {
          fill = colors.mainFill;
          stroke = colors.mainStroke;
        } else if (node.type === "tag") {
          fill = colors.tagFill;
          stroke = colors.tagStroke;
        } else if (node.active) {
          fill = colors.activeFill;
          stroke = colors.mainStroke;
        } else {
          fill = colors.postFill;
          stroke = colors.postStroke;
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.globalAlpha = isLinked ? 1 : 0.22;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = node.id === hoverId ? 2.4 : node.active ? 2 : 1.4;
        ctx.stroke();
      });

      // 라벨: 닉네임/현재 글은 항상, 그 외엔 호버한 노드와 그 이웃만 (옵시디언 스타일)
      ctx.globalAlpha = 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      nodes.forEach((node) => {
        const showAlways = node.type === "main" || node.active;
        const showOnHover = hoverId && linked.has(node.id);
        if (!showAlways && !showOnHover) return;

        const emphasized = node.id === hoverId || node.type === "main" || node.active;
        const fontSize = node.type === "main" ? 12 : 10.5;
        ctx.font = `${emphasized ? "600" : "500"} ${fontSize}px ${fontFamily}`;
        const text = truncate(node.label, node.type === "tag" ? 12 : 18);
        const ty = node.y + node.r + 3;

        // 가독성용 외곽선
        ctx.lineWidth = 3;
        ctx.strokeStyle = colors.labelBg;
        ctx.globalAlpha = 0.85;
        ctx.strokeText(text, node.x, ty);

        ctx.globalAlpha = 1;
        ctx.fillStyle = emphasized ? colors.text : colors.textMuted;
        ctx.fillText(text, node.x, ty);
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

      state.hover = pickNode(point.x, point.y) || activeNode || null;
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
      if (!state.dragging) state.hover = activeNode || null;
    };

    const tick = () => {
      if (!reducedMotion) simulate();
      draw();
      if (!reducedMotion) requestAnimationFrame(tick);
    };

    resize();
    placeInitial();
    for (let i = 0; i < (reducedMotion ? 1 : 240); i += 1) simulate();
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
