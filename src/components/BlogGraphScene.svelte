<script>
  import { onMount } from "svelte";

  export let graph = { nodes: [], links: [] };
  export let label = "지식 그래프 3D 레이어";

  let canvas;
  let status = "idle";

  const prefersReducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const cssColor = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  onMount(() => {
    let disposed = false;
    let frame = 0;
    let cleanup = () => {};

    const start = async () => {
      if (!canvas || prefersReducedMotion()) {
        status = "reduced";
        return;
      }

      try {
        const THREE = await import("three");
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        camera.position.set(0, 0, 9);

        const root = new THREE.Group();
        scene.add(root);
        const disposedMaterials = new Set();
        const disposeMaterial = (material) => {
          const materials = Array.isArray(material) ? material : [material];
          for (const item of materials) {
            if (item && !disposedMaterials.has(item)) {
              item.dispose();
              disposedMaterials.add(item);
            }
          }
        };

        const materialFor = (node) => {
          const color =
            node.type === "main"
              ? cssColor("--accent-strong", "#17402f")
              : node.active
                ? cssColor("--accent", "#275f47")
                : node.type === "tag"
                  ? cssColor("--muted", "#626a60")
                  : cssColor("--text", "#171a17");
          return new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: node.active ? 0.96 : 0.76,
          });
        };

        const nodeMap = new Map();
        const countByLevel = new Map();
        const nextIndex = new Map();
        const levelOf = (node) => (node.type === "main" ? 0 : node.type === "post" ? 1 : 2);
        for (const node of graph.nodes) {
          const level = levelOf(node);
          countByLevel.set(level, (countByLevel.get(level) || 0) + 1);
        }

        for (const node of graph.nodes) {
          const level = levelOf(node);
          const index = nextIndex.get(level) || 0;
          nextIndex.set(level, index + 1);
          const total = countByLevel.get(level) || 1;
          const angle = level === 0 ? -Math.PI / 2 : -Math.PI / 2 + (Math.PI * 2 * index) / total;
          const radius = level === 0 ? 0 : level === 1 ? 2.15 : 3.45;
          const depth = level === 0 ? 0.35 : level === 1 ? 0 : -0.55;
          const size = node.type === "main" ? 0.16 : node.active ? 0.13 : 0.095;
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 18, 18), materialFor(node));
          mesh.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, depth);
          mesh.userData = { id: node.id, url: node.url };
          root.add(mesh);
          nodeMap.set(node.id, mesh);
        }

        const linkMaterial = new THREE.LineBasicMaterial({
          color: cssColor("--accent", "#275f47"),
          transparent: true,
          opacity: 0.18,
        });
        for (const link of graph.links) {
          const source = nodeMap.get(link.source);
          const target = nodeMap.get(link.target);
          if (!source || !target) continue;
          const geometry = new THREE.BufferGeometry().setFromPoints([
            source.position.clone(),
            target.position.clone(),
          ]);
          root.add(new THREE.Line(geometry, linkMaterial));
        }

        const resize = () => {
          const rect = canvas.getBoundingClientRect();
          const width = Math.max(1, rect.width);
          const height = Math.max(1, rect.height);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };

        const refreshTheme = () => {
          for (const node of graph.nodes) {
            const mesh = nodeMap.get(node.id);
            if (mesh) {
              const previousMaterial = mesh.material;
              mesh.material = materialFor(node);
              disposeMaterial(previousMaterial);
            }
          }
          linkMaterial.color.set(cssColor("--accent", "#275f47"));
        };

        const animate = () => {
          if (disposed) return;
          root.rotation.z += 0.0018;
          root.rotation.x = Math.sin(performance.now() / 4200) * 0.08;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(animate);
        };

        const openFocusedNode = (event) => {
          const active = graph.nodes.find((node) => node.active);
          if (active?.url && event.detail === 2) window.location.href = active.url;
        };

        resize();
        refreshTheme();
        animate();
        status = "ready";

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        window.addEventListener("yskim:theme-change", refreshTheme);
        canvas.addEventListener("click", openFocusedNode);

        cleanup = () => {
          cancelAnimationFrame(frame);
          resizeObserver.disconnect();
          window.removeEventListener("yskim:theme-change", refreshTheme);
          canvas.removeEventListener("click", openFocusedNode);
          renderer.dispose();
          for (const child of root.children) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) disposeMaterial(child.material);
          }
        };
      } catch {
        status = "fallback";
      }
    };

    start();

    return () => {
      disposed = true;
      cleanup();
    };
  });
</script>

<div class="knowledge-scene" data-state={status} aria-label={label}>
  <canvas bind:this={canvas} class="knowledge-scene__canvas" aria-hidden="true"></canvas>
</div>
