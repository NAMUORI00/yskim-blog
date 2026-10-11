<script>
  // The knowledge map island. Loads the map built from the published posts
  // (/knowledge-map.json), then shows it as the right rail on wide screens or as
  // a small card that opens the wide view on narrower ones. The server-rendered
  // list next to this island stays as the fallback until the map is ready.
  import { onMount } from "svelte";
  import { announce, homeCamera, INITIAL_EXPLORE } from "../../lib/graph/explore.mjs";
  import { fitView } from "../../lib/graph/globe-layout.mjs";
  import { CANVAS_PADDING } from "../../lib/graph/globe-scene.mjs";
  import { createMotionPreference } from "../../lib/graph/motion.mjs";
  import { parseKnowledgeMapPayload } from "../../lib/graph/payload.mjs";
  import { articleContext, selectGlobeNodes, subgraph } from "../../lib/knowledge-graph-data.mjs";
  import GlobeCanvas from "./GlobeCanvas.svelte";
  import MapDialog from "./MapDialog.svelte";
  import MapSurface from "./MapSurface.svelte";
  import { safeStorage } from "./shared.mjs";

  let { src, current = null, variant = "rail" } = $props();

  /** Most stars drawn on the globe at once (the opened category view lists all). */
  const GLOBE_STARS = 160;

  let host = $state(null);
  let status = $state("loading");
  let data = $state.raw(null);
  let explore = $state.raw(INITIAL_EXPLORE);
  let dialogOpen = $state(false);
  let announcement = $state("");
  let motion = $state({ reduced: false, choice: "on", enabled: false });
  let preference = null;
  let expandButton = $state(null);
  let openButton = $state(null);
  let thumbWidth = $state(220);
  let thumbHeight = $state(200);

  function prepare(json) {
    const { graph, globe, floors } = parseKnowledgeMapPayload(json);
    const node = current && graph.byId.has(current) ? graph.byId.get(current) : null;
    const keep = node ? [node.id, ...(node.topics ?? [])] : [];
    const ids = selectGlobeNodes(graph, { maxNodes: GLOBE_STARS, keep }).filter((id) => globe.positions.has(id));
    const globeGraph = ids.length === graph.nodes.length ? graph : subgraph(graph, ids);
    return { graph, globeGraph, globe, floors, current: node?.id ?? null, context: articleContext(graph, node?.id ?? null) };
  }

  function mark(state) {
    status = state;
    host?.closest("[data-km-host]")?.setAttribute("data-km-state", state);
  }

  onMount(() => {
    const query = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    preference = createMotionPreference({ storage: safeStorage(), reducedQuery: query });
    const sync = () => (motion = { reduced: preference.reduced, choice: preference.choice, enabled: preference.enabled });
    sync();
    const unsubscribe = preference.subscribe(sync);
    mark("loading");
    const controller = new AbortController();
    fetch(src, { signal: controller.signal, credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        data = prepare(json);
        mark(data.graph.nodes.length ? "ready" : "empty");
      })
      .catch((error) => {
        if (error?.name !== "AbortError") mark("failed");
      });
    return () => {
      unsubscribe();
      controller.abort();
    };
  });

  function setExplore(next, { silent = false } = {}) {
    if (next === explore) return;
    if (!silent && data) {
      const message = announce(data.graph, explore, next);
      if (message) announcement = message;
    }
    explore = next;
  }

  function openDialog() {
    dialogOpen = true;
  }

  function closeDialog() {
    dialogOpen = false;
    // The small card opens fresh each time; the rail keeps what was explored.
    if (variant !== "rail") explore = INITIAL_EXPLORE;
  }

  const thumbView = $derived(data ? fitView(data.globe, Math.max(1, thumbWidth), Math.max(1, thumbHeight), CANVAS_PADDING.compact) : null);
  const thumbCamera = $derived(data ? homeCamera(data.globe, data.current ? data.graph.byId.get(data.current)?.domain ?? null : null) : null);
  const postCount = $derived(data ? data.graph.nodes.filter((node) => node.kind === "post").length : 0);
  const topicCount = $derived(data ? data.graph.nodes.filter((node) => node.kind === "topic").length : 0);
</script>

<div bind:this={host} class="km-root km-island" data-variant={variant} data-status={status}>
  {#if variant === "rail"}
    {#if status === "ready" && data}
      <MapSurface
        {data}
        variant="rail"
        {explore}
        onExplore={setExplore}
        {motion}
        onMotion={(choice) => preference?.set(choice)}
        active={!dialogOpen}
        suspended={dialogOpen}
        paused={dialogOpen}
        {announcement}
        onExpand={openDialog}
        bind:expandButton
      />
    {:else}
      <div class="km-surface" data-variant="rail" aria-busy={status === "loading" ? "true" : undefined}>
        <div class="km-head"><span class="km-kicker">Knowledge Map</span></div>
        <p class="km-sub">카테고리를 고르면 주제와 글로 펼칩니다</p>
        <div class="kg3-frame km-skeleton" aria-hidden="true"><span class="km-skeleton-orb"></span></div>
        {#if status === "failed"}<p class="km-hint">지도를 불러오지 못했습니다. 아래 목록으로 이동할 수 있습니다.</p>{/if}
        {#if status === "empty"}<p class="km-hint">아직 지도에 놓을 글이 없습니다.</p>{/if}
      </div>
    {/if}
  {:else}
    <section class="km-compact" aria-label="지식 지도">
      <div class="km-head">
        <span class="km-kicker">Knowledge Map</span>
        {#if data}<span class="km-compact-count">글 {postCount}개, 주제 {topicCount}개</span>{/if}
      </div>
      <div class="kg3-thumb" bind:clientWidth={thumbWidth} bind:clientHeight={thumbHeight}>
        {#if status === "ready" && data && thumbView && thumbCamera}
          <GlobeCanvas graph={data.globeGraph} layout={data.globe} view={thumbView} camera={thumbCamera} variant="compact" interactive={false} currentId={data.current} />
        {:else}
          <span class="km-skeleton-orb" aria-hidden="true"></span>
        {/if}
      </div>
      {#if status === "ready"}
        <button bind:this={openButton} type="button" class="km-expand km-drawer-open" aria-haspopup="dialog" onclick={openDialog}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" /></svg>
          지식 지도 열기
        </button>
      {:else if status === "failed"}
        <p class="km-hint">지도를 불러오지 못했습니다.</p>
      {:else if status === "empty"}
        <p class="km-hint">아직 지도에 놓을 글이 없습니다.</p>
      {/if}
    </section>
  {/if}

  {#if dialogOpen && data}
    <MapDialog
      {data}
      {explore}
      onExplore={setExplore}
      {motion}
      onMotion={(choice) => preference?.set(choice)}
      {announcement}
      returnFocus={variant === "rail" ? expandButton : openButton}
      onClose={closeDialog}
    />
  {/if}
</div>
