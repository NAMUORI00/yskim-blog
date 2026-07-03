(() => {
  const TAU = Math.PI * 2;
  const IDLE_RETURN_MS = 1800;
  const IDLE_SPIN_SPEED = 0.0032;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const sphereRadiusFor = (width, height) => Math.min(width, height) * 0.48;

  function readCssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function getColors() {
    return {
      edge: readCssVar("--line-strong", "#c7ccbf"),
      edgeFocus: readCssVar("--accent", "#305c47"),
      main: readCssVar("--accent-strong", "#162f25"),
      category: readCssVar("--accent-light", "#3f8a65"),
      post: readCssVar("--accent", "#305c47"),
      tag: readCssVar("--muted", "#71786f"),
      nodeStroke: readCssVar("--panel", "#ffffff"),
      text: readCssVar("--text", "#23271f"),
      muted: readCssVar("--muted", "#71786f"),
      labelBg: readCssVar("--panel", "#ffffff"),
      wireframe: readCssVar("--line-strong", "#c7ccbf"),
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

  const levelOf = (type) => (type === "main" ? 0 : type === "category" ? 1 : type === "post" ? 2 : 3);

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
      if (node.type === "category") return 6.2 + Math.min(2.1, weight * 0.45);
      if (node.type === "post") return 5.1 + Math.min(2.1, weight * 0.42);
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

    const rootNode = nodes.find((node) => node.type === "main") || nodes[0] || null;
    const activeNode = nodes.find((node) => node.active) || rootNode;
    const state = {
      width: 0,
      height: 0,
      dpr: 1,
      pointer: null,
      hoverNode: null,
      focusNode: activeNode,
      rootNode,
      rotationX: 0,
      rotationY: 0,
      targetRotationX: 0,
      targetRotationY: 0,
      idleSpinPhase: 0,
      idlePoleBlend: 0,
      targetIdlePoleBlend: 0,
      isIdlePoleView: false,
      laidOut: false,
      raf: 0,
    };
    let idleReturnTimer = 0;

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
      if (level === 1) return base * 0.22;
      if (level === 2) return base * 0.34;
      return base * 0.46;
    };

    const siblingSpread = (level, count) => {
      if (count <= 1) return 0;
      if (level === 1) return TAU / count;
      if (level === 2) return Math.min(0.82, Math.PI / Math.max(3, count));
      return Math.min(0.56, Math.PI / Math.max(4, count + 1));
    };

    const layout = () => {
      const centerX = state.width / 2;
      const centerY = state.height / 2;
      const pad = 18;
      const angles = new Map();

      for (let level = 0; level <= 3; level += 1) {
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

    const sphereVector = (node) => {
      const radius = Math.max(1, sphereRadiusFor(state.width, state.height));
      const nx = clamp((node.x - state.width / 2) / radius, -0.96, 0.96);
      const ny = clamp((node.y - state.height / 2) / radius, -0.96, 0.96);
      const distance = Math.hypot(nx, ny);
      const scale = distance > 0.96 ? 0.96 / distance : 1;
      const x = nx * scale;
      const y = ny * scale;
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      return { x, y, z };
    };

    const rotateSphereVector = (vector) => {
      const cosY = Math.cos(state.rotationY);
      const sinY = Math.sin(state.rotationY);
      const x1 = vector.x * cosY + vector.z * sinY;
      const z1 = -vector.x * sinY + vector.z * cosY;

      const cosX = Math.cos(state.rotationX);
      const sinX = Math.sin(state.rotationX);
      const y2 = vector.y * cosX - z1 * sinX;
      const z2 = vector.y * sinX + z1 * cosX;

      return { x: x1, y: y2, z: z2 };
    };

    const northPole = { x: 0, y: 0, z: 1 };

    const rootPole = () => ({
      x: state.width / 2 + northPole.x,
      y: state.height / 2 + northPole.y,
      depth: northPole.z,
    });

    const cameraAboveNorthPole = true;

    const polarSurfacePoint = (node) => {
      const pole = rootPole();
      if (state.rootNode?.id === node.id) return pole;

      const vector = sphereVector(node);
      const radius = Math.max(1, sphereRadiusFor(state.width, state.height));
      const baseDistance = Math.hypot(vector.x, vector.y);
      const levelFloor = node.level === 1 ? 0.24 : node.level === 2 ? 0.42 : 0.6;
      const surfaceDistance = clamp(Math.max(baseDistance, levelFloor), levelFloor, 0.92);
      const surfaceRadius = radius * surfaceDistance;
      const baseAngle = Math.atan2(vector.y, vector.x);
      const longitude = baseAngle + state.idleSpinPhase;
      const depth = clamp(1 - surfaceDistance * 0.42 + (3 - node.level) * 0.025, 0.48, 0.98);

      return {
        x: pole.x + Math.cos(longitude) * surfaceRadius,
        y: pole.y + Math.sin(longitude) * surfaceRadius,
        depth,
      };
    };

    const sphereDisplayPoint = (node) => {
      const radius = Math.max(1, sphereRadiusFor(state.width, state.height));
      const rotated = rotateSphereVector(sphereVector(node));
      const depth = clamp((rotated.z + 1) / 2, 0, 1);
      const perspective = 0.82 + depth * 0.22;
      return {
        x: state.width / 2 + rotated.x * radius * perspective,
        y: state.height / 2 + rotated.y * radius * perspective,
        depth,
      };
    };

    const blendDisplayPoint = (spherePoint, polarPoint, amount) => ({
      x: lerp(spherePoint.x, polarPoint.x, amount),
      y: lerp(spherePoint.y, polarPoint.y, amount),
      depth: lerp(spherePoint.depth, polarPoint.depth, amount),
    });

    const displayPoint = (node) => {
      const blend = prefersReduced ? state.targetIdlePoleBlend : state.idlePoleBlend;
      if (blend <= 0.001) return sphereDisplayPoint(node);
      if (blend >= 0.999) return polarSurfacePoint(node);
      return blendDisplayPoint(sphereDisplayPoint(node), polarSurfacePoint(node), blend);
    };

    const wireframePoint = (vector) => {
      const radius = Math.max(1, sphereRadiusFor(state.width, state.height));
      const rotated = rotateSphereVector(vector);
      const depth = clamp((rotated.z + 1) / 2, 0, 1);
      const perspective = 0.82 + depth * 0.22;
      return {
        x: state.width / 2 + rotated.x * radius * perspective,
        y: state.height / 2 + rotated.y * radius * perspective,
        depth,
      };
    };

    const drawSphereWireframe = () => {
      if (Math.min(state.width, state.height) <= 1) return;
      ctx.save();
      ctx.strokeStyle = colors.wireframe;
      ctx.lineWidth = 0.45;
      ctx.lineCap = "round";

      const strokeRing = (points, baseAlpha) => {
        ctx.beginPath();
        points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        const averageDepth = points.reduce((sum, point) => sum + point.depth, 0) / points.length;
        ctx.globalAlpha = baseAlpha * (0.45 + averageDepth * 0.55);
        ctx.stroke();
      };

      for (const latitude of [-0.72, -0.38, 0, 0.38, 0.72]) {
        const y = Math.sin(latitude);
        const ring = Math.cos(latitude);
        const points = [];
        for (let index = 0; index <= 80; index += 1) {
          const angle = (index / 80) * TAU;
          points.push(wireframePoint({ x: Math.cos(angle) * ring, y, z: Math.sin(angle) * ring }));
        }
        strokeRing(points, latitude === 0 ? 0.1 : 0.068);
      }

      for (let longitude = 0; longitude < 8; longitude += 1) {
        const angle = (longitude / 8) * TAU;
        const points = [];
        for (let index = 0; index <= 80; index += 1) {
          const latitude = -Math.PI / 2 + (index / 80) * Math.PI;
          const ring = Math.cos(latitude);
          points.push(wireframePoint({
            x: Math.cos(angle) * ring,
            y: Math.sin(latitude),
            z: Math.sin(angle) * ring,
          }));
        }
        strokeRing(points, 0.055);
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const drawNorthPoleWireframe = () => {
      if (Math.min(state.width, state.height) <= 1) return;
      const pole = rootPole();
      const radius = Math.max(1, sphereRadiusFor(state.width, state.height));
      ctx.save();
      ctx.strokeStyle = colors.wireframe;
      ctx.lineWidth = 0.42;
      ctx.lineCap = "round";

      for (const latitude of [0.24, 0.42, 0.6, 0.76, 0.92]) {
        ctx.beginPath();
        ctx.ellipse(
          pole.x,
          pole.y,
          radius * latitude,
          radius * latitude,
          0,
          0,
          TAU,
        );
        ctx.globalAlpha = latitude === 0.6 ? 0.085 : 0.052;
        ctx.stroke();
      }

      for (let longitude = 0; longitude < 10; longitude += 1) {
        const angle = state.idleSpinPhase + (longitude / 10) * TAU;
        ctx.beginPath();
        ctx.moveTo(pole.x, pole.y);
        ctx.lineTo(
          pole.x + Math.cos(angle) * radius * 0.92,
          pole.y + Math.sin(angle) * radius * 0.92,
        );
        ctx.globalAlpha = 0.038;
        ctx.stroke();
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const setRotationTarget = (node) => {
      if (!node) {
        state.targetRotationX = 0;
        state.targetRotationY = 0;
        return;
      }

      const vector = sphereVector(node);
      const rotationY = -Math.atan2(vector.x, vector.z);
      const zAfterY = Math.hypot(vector.x, vector.z);
      const rotationX = Math.atan2(vector.y, zAfterY);
      state.targetRotationX = clamp(rotationX, -1.08, 1.08);
      state.targetRotationY = clamp(rotationY, -1.08, 1.08);
    };

    const cancelIdleReturn = () => {
      if (idleReturnTimer) {
        clearTimeout(idleReturnTimer);
        idleReturnTimer = 0;
      }
      state.targetIdlePoleBlend = 0;
      state.isIdlePoleView = state.idlePoleBlend > 0.001;
    };

    const scheduleIdleReturn = () => {
      if (idleReturnTimer) clearTimeout(idleReturnTimer);
      idleReturnTimer = window.setTimeout(() => {
        idleReturnTimer = 0;
        state.pointer = null;
        state.hoverNode = null;
        state.focusNode = rootNode;
        state.targetIdlePoleBlend = Boolean(rootNode) && cameraAboveNorthPole && !prefersReduced ? 1 : 0;
        state.isIdlePoleView = state.targetIdlePoleBlend > 0;
        setRotationTarget(rootNode);
        canvas.style.cursor = "default";
        scheduleFocus();
      }, IDLE_RETURN_MS);
    };

    const pointerInfluence = (node) => {
      if (!state.pointer) return 0;
      const reach = Math.min(state.width, state.height) * 0.32;
      const point = displayPoint(node);
      const distance = Math.hypot(point.x - state.pointer.x, point.y - state.pointer.y);
      return clamp(1 - distance / reach, 0, 1);
    };

    const nearestNode = (x, y) => {
      let best = null;
      let bestDistance = Infinity;
      for (const node of nodes) {
        const point = displayPoint(node);
        const distance = Math.hypot(point.x - x, point.y - y);
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

      if (state.idlePoleBlend > 0.05 || state.targetIdlePoleBlend > 0) drawNorthPoleWireframe();
      else drawSphereWireframe();

      const focusIds = adjacency.get(state.focusNode?.id) || new Set();
      for (const link of links) {
        const focused = focusIds.has(link.source.id) && focusIds.has(link.target.id);
        const sourceFocus = Math.max(link.source.focus, link.target.focus);
        const source = displayPoint(link.source);
        const target = displayPoint(link.target);
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const normalX = midX - state.width / 2;
        const normalY = midY - state.height / 2;
        const distance = Math.hypot(normalX, normalY) || 1;
        const lift = Math.min(16, Math.hypot(source.x - target.x, source.y - target.y) * 0.08);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(
          midX + (normalX / distance) * lift,
          midY + (normalY / distance) * lift,
          target.x,
          target.y,
        );
        ctx.strokeStyle = focused ? colors.edgeFocus : colors.edge;
        ctx.globalAlpha = focused ? 0.3 + sourceFocus * 0.3 : 0.12 + Math.min(source.depth, target.depth) * 0.08;
        ctx.lineWidth = focused ? 1.1 + sourceFocus * 0.8 : 0.8;
        ctx.lineCap = "round";
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const nodesByDepth = [...nodes].sort((a, b) => displayPoint(a).depth - displayPoint(b).depth);
      for (const node of nodesByDepth) {
        const focus = node.focus;
        const point = displayPoint(node);
        const radius = node.r * (0.86 + point.depth * 0.2) * (1 + focus * 0.32);
        let fill = colors.post;
        if (node.type === "main") fill = colors.main;
        if (node.type === "category") fill = colors.category;
        if (node.type === "tag") fill = colors.tag;

        if (focus > 0.18) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, radius + 5 + focus * 4, 0, TAU);
          ctx.fillStyle = colors.edgeFocus;
          ctx.globalAlpha = 0.08 + focus * 0.12;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(point.x, point.y, radius, 0, TAU);
        ctx.fillStyle = fill;
        ctx.globalAlpha = 0.42 + point.depth * 0.22 + focus * 0.36;
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
        const showLabel = state.hoverNode?.id === node.id;
        if (!showLabel) continue;
        const label = truncate(node.label, node.type === "tag" ? 14 : 20);
        const radius = node.r * (1 + node.focus * 0.32);
        const point = displayPoint(node);
        const fontSize = node.type === "main" || node.type === "category" ? 11 : 9.5;
        ctx.font = `${node.focus > 0.5 ? "700" : "600"} ${fontSize}px ${fontFamily}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = colors.labelBg;
        ctx.globalAlpha = 0.86;
        ctx.strokeText(label, point.x, point.y - radius - 5);
        ctx.globalAlpha = 1;
        ctx.fillStyle = node.focus > 0.5 || node.type === "main" ? colors.text : colors.muted;
        ctx.fillText(label, point.x, point.y - radius - 5);
      }
    };

    const animateFocus = () => {
      state.raf = 0;
      let needsNext = false;
      const nextIdlePoleBlend = prefersReduced
        ? state.targetIdlePoleBlend
        : lerp(state.idlePoleBlend, state.targetIdlePoleBlend, 0.12);
      if (Math.abs(nextIdlePoleBlend - state.targetIdlePoleBlend) > 0.01) {
        needsNext = true;
      }
      state.idlePoleBlend = needsNext ? nextIdlePoleBlend : state.targetIdlePoleBlend;
      state.isIdlePoleView = state.idlePoleBlend > 0.001 || state.targetIdlePoleBlend > 0;

      if (state.targetIdlePoleBlend > 0 && !prefersReduced) {
        state.idleSpinPhase += IDLE_SPIN_SPEED;
        state.rotationX = lerp(state.rotationX, 0, 0.08);
        state.rotationY = lerp(state.rotationY, 0, 0.08);
        needsNext = true;
      } else {
        const nextRotationX = prefersReduced ? state.targetRotationX : lerp(state.rotationX, state.targetRotationX, 0.16);
        const nextRotationY = prefersReduced ? state.targetRotationY : lerp(state.rotationY, state.targetRotationY, 0.16);
        if (
          Math.abs(nextRotationX - state.targetRotationX) > 0.002 ||
          Math.abs(nextRotationY - state.targetRotationY) > 0.002
        ) {
          needsNext = true;
        }
        state.rotationX = needsNext ? nextRotationX : state.targetRotationX;
        state.rotationY = needsNext ? nextRotationY : state.targetRotationY;
      }
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
      setRotationTarget(state.hoverNode);
      updateTargets();
      draw();
    };

    const toLocal = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onPointerMove = (event) => {
      cancelIdleReturn();
      state.pointer = toLocal(event.clientX, event.clientY);
      const hit = nearestNode(state.pointer.x, state.pointer.y) || state.hoverNode;
      state.hoverNode = hit;
      state.focusNode = hit || activeNode;
      setRotationTarget(hit);
      canvas.style.cursor = hit?.url ? "pointer" : "default";
      scheduleFocus();
    };

    const onPointerLeave = () => {
      state.pointer = null;
      state.hoverNode = null;
      state.focusNode = activeNode;
      setRotationTarget(null);
      canvas.style.cursor = "default";
      scheduleFocus();
      scheduleIdleReturn();
    };

    const onClick = (event) => {
      cancelIdleReturn();
      const point = toLocal(event.clientX, event.clientY);
      const hit = nearestNode(point.x, point.y);
      if (hit?.url) window.location.href = hit.url;
    };

    ensureLayout();
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("click", onClick);
    scheduleIdleReturn();

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
