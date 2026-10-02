<script>
  // One working map — the rail, or the wide dialog's stage — with its panel.
  // The rail and the dialog share the explore state (overview / opened category
  // / pin); each has its own camera and transitions. The surface (map + panel +
  // buttons) is one attention region: leaving it for ~3 s returns to the
  // overview, unless keyboard focus is inside or the input is touch.
  import { tick, untrack } from "svelte";
  import { AttentionReturn } from "../../lib/graph/attention.mjs";
  import {
    domainMembers,
    ExploreView,
    homeCamera,
    INITIAL_EXPLORE,
    isAway,
    openDomain,
    pick as pickExplore,
    resolveFocus,
    unpin as unpinExplore,
  } from "../../lib/graph/explore.mjs";
  import { buildFloorMap } from "../../lib/graph/floor-layout.mjs";
  import { clampCamera, fitView, zoomAt } from "../../lib/graph/globe-layout.mjs";
  import { CANVAS_PADDING } from "../../lib/graph/globe-scene.mjs";
  import { subscribeFrames } from "../../lib/graph/motion.mjs";
  import { attachOrbit } from "../../lib/graph/orbit.mjs";
  import { domainKey } from "../../lib/knowledge-graph-data.mjs";
  import FloorCanvas from "./FloorCanvas.svelte";
  import GlobeCanvas from "./GlobeCanvas.svelte";
  import MapOutline from "./MapOutline.svelte";
  import MapPanel from "./MapPanel.svelte";
  import MotionToggle from "./MotionToggle.svelte";
  import { EXPLORER_HINT, HINT_TEXT, nextId, prefersCoarsePointer, sharedTracker } from "./shared.mjs";

  let {
    data,
    variant = "rail",
    explore,
    onExplore,
    motion,
    onMotion = () => {},
    active = true,
    suspended = false,
    paused = false,
    view: viewMode = "space",
    region = null,
    announcement = "",
    onExpand = null,
    expandButton = $bindable(null),
  } = $props();

  const KEY_YAW = 0.14;
  const KEY_PITCH = 0.05;
  const ZOOM_STEP = 1.25;
  const CLEAR_DELAY_MS = 90;
  const GLOBE_FADE = 0.35;
  const hintId = nextId("kg3-hint");

  let root = $state(null);
  let globeEl = $state(null);
  let frameWidth = $state(variant === "rail" ? 292 : 760);
  let frameHeight = $state(variant === "rail" ? 350 : 560);
  let hoverId = $state(null);
  let keyboardId = $state(null);
  let rovingId = $state(null);
  let dragging = $state(false);
  let gliding = $state(false);
  let coarse = $state(false);
  let pending = $state(false);
  let orbitGuard = $state.raw(null);
  let pendingFocus = $state(null);
  let attention = null;
  let hoverTimer = null;
  let keyTimer = null;

  const graph = $derived(data.graph);
  const globeGraph = $derived(data.globeGraph);
  const layout = $derived(data.globe);
  const currentId = $derived(data.current);
  const currentDomain = $derived(currentId ? graph.byId.get(currentId)?.domain ?? null : null);
  const home = $derived(homeCamera(layout, currentDomain));

  const exploreView = untrack(
    () =>
      new ExploreView({
        layout: data.globe,
        home: homeCamera(data.globe, data.current ? data.graph.byId.get(data.current)?.domain ?? null : null),
        reduced: motion.reduced,
        active,
        intro: variant === "rail" && motion.enabled,
        target: explore.mode === "detail" ? explore.domain : null,
        subscribeFrames,
        onChange: (state) => (viewState = state),
      }),
  );
  let viewState = $state.raw(exploreView.snapshot());

  const globeView = $derived(fitView(layout, Math.max(1, frameWidth), Math.max(1, frameHeight), CANVAS_PADDING[variant]));
  const focus = $derived(resolveFocus({ hoverId, keyboardId, pinnedId: explore.pinnedId }, (id) => graph.byId.has(id) || graph.domainByKey.has(id)));
  const floorMap = $derived(viewState.shown ? buildFloorMap(graph, viewState.shown) : null);
  const floorPlan = $derived(viewState.shown ? data.floors.get(viewState.shown) ?? new Map() : null);
  const showDetail = $derived(Boolean(viewState.shown && floorMap && viewState.unfold > 0));
  const globeOpacity = $derived(showDetail ? Math.max(0, 1 - viewState.unfold / GLOBE_FADE) : 1);
  const globeHidden = $derived(showDetail && globeOpacity <= 0);
  const globeLive = $derived(explore.mode === "overview" && !showDetail);
  const moving = $derived(dragging || gliding || viewState.running);
  const overviewFocus = $derived(
    viewState.shown ? domainKey(viewState.shown) : focus.focusId && graph.byId.has(focus.focusId) ? domainKey(graph.byId.get(focus.focusId).domain) : focus.focusId,
  );
  const starId = $derived(globeLive && hoverId && globeGraph.byId.has(hoverId) ? hoverId : null);
  const activeDomain = $derived(
    focus.activeId ? (graph.byId.has(focus.activeId) ? domainKey(graph.byId.get(focus.activeId).domain) : focus.activeId) : null,
  );
  const globeLabel = $derived(
    `지식 지도: 가운데에 ${graph.identity.name || "나"}, 둘레에 카테고리 ${graph.domains.length}곳과 글 ${graph.nodes.filter((node) => node.kind === "post").length}개. 카테고리를 고르면 펼칩니다`,
  );

  $effect(() => exploreView.setReduced(motion.reduced));
  $effect(() => exploreView.setActive(active && viewMode === "space"));
  $effect(() => exploreView.setHome(home));
  $effect(() => exploreView.setTarget(explore.mode === "detail" ? explore.domain : null));
  $effect(() => () => exploreView.destroy());

  $effect(() => {
    coarse = prefersCoarsePointer();
    if (variant === "rail" && untrack(() => motion.enabled)) exploreView.startIntro();
  });

  // Attention region: the surface, or the whole dialog (toolbar included).
  $effect(() => {
    const target = region ?? root;
    if (!target) return;
    const instance = new AttentionReturn({ region: target, doc: document, tracker: sharedTracker(), onReturn: () => back({ silent: true }) });
    instance.onPending = (value) => (pending = value);
    attention = instance;
    untrack(() => instance.update({ away: isAway(explore, viewState.moved), suspended }));
    return () => {
      instance.destroy();
      if (attention === instance) attention = null;
    };
  });

  $effect(() => {
    const away = isAway(explore, viewState.moved);
    const covered = suspended;
    attention?.update({ away, suspended: covered });
  });

  $effect(() => {
    if (!globeEl || !globeLive) return;
    const handle = attachOrbit(globeEl, {
      getCamera: () => viewState.camera,
      getView: () => globeView,
      onChange: (camera) => exploreView.moveCamera(camera),
      onState: (state) => {
        dragging = state.dragging;
        gliding = state.gliding;
      },
      allowZoom: variant === "explorer",
      glide: !motion.reduced,
    });
    orbitGuard = handle.guard;
    return () => {
      handle.destroy();
      orbitGuard = null;
      dragging = false;
      gliding = false;
    };
  });

  /* ── focus handoff between the globe and the layers ───────── */

  let movedFor = null;
  let lastDomain = null;

  $effect(() => {
    if (explore.mode !== "detail" || !showDetail || !viewState.shown) return;
    if (movedFor === viewState.shown) return;
    movedFor = viewState.shown;
    untrack(() => {
      const activeElement = document.activeElement;
      const inGlobe = Boolean(activeElement && globeEl?.contains(activeElement));
      const lost = (!activeElement || activeElement === document.body) && attention?.hadFocus();
      if (!inGlobe && !lost) return;
      tick().then(() => {
        const pinned = explore.pinnedId ? root?.querySelector(`.kg3-dv [data-node-id="${CSS.escape(explore.pinnedId)}"]`) : null;
        (pinned ?? root?.querySelector('.kg3-dv [data-node-id][tabindex="0"]'))?.focus({ preventScroll: true });
      });
    });
  });

  $effect(() => {
    if (explore.mode === "detail") {
      lastDomain = viewState.shown ?? explore.domain;
      return;
    }
    const domain = lastDomain;
    lastDomain = null;
    movedFor = null;
    if (!domain) return;
    untrack(() => {
      rovingId = domainKey(domain);
      const activeElement = document.activeElement;
      const inDetail = Boolean(activeElement && root?.querySelector(".kg3-dv")?.contains(activeElement));
      const lost = (!activeElement || activeElement === document.body) && attention?.hadFocus();
      if (inDetail || lost) pendingFocus = domainKey(domain);
    });
  });

  $effect(() => {
    if (!pendingFocus || globeHidden) return;
    const key = pendingFocus;
    pendingFocus = null;
    tick().then(() => root?.querySelector(`.kg3-globe [data-target-id="${CSS.escape(key)}"]`)?.focus({ preventScroll: true }));
  });

  /* ── actions ──────────────────────────────────────────────── */

  function delayed(setter, timer, id) {
    clearTimeout(timer);
    if (id) {
      setter(id);
      return null;
    }
    return setTimeout(() => setter(null), CLEAR_DELAY_MS);
  }

  function setHover(id) {
    hoverTimer = delayed((value) => (hoverId = value), hoverTimer, id);
  }

  function setKeyboard(id) {
    keyTimer = delayed((value) => (keyboardId = value), keyTimer, id);
  }

  function resetPreview() {
    clearTimeout(hoverTimer);
    clearTimeout(keyTimer);
    hoverId = null;
    keyboardId = null;
  }

  function open(domainId, pinnedId = null) {
    resetPreview();
    onExplore(openDomain(domainId, pinnedId));
    if (pinnedId) rovingId = pinnedId;
  }

  function back({ silent = false } = {}) {
    resetPreview();
    onExplore(INITIAL_EXPLORE, { silent });
    exploreView.resetCamera();
  }

  function togglePin(id) {
    if (explore.mode !== "detail") return;
    onExplore({ ...explore, pinnedId: explore.pinnedId === id ? null : id });
    rovingId = id;
  }

  function unpin() {
    onExplore(unpinExplore(explore));
  }

  function pickItem(id) {
    const next = pickExplore(graph, explore, id);
    if (next.mode !== explore.mode || next.domain !== explore.domain) resetPreview();
    onExplore(next);
    rovingId = id;
  }

  /** Pick inside a given category (an outline section, or the article's own category). */
  function pickWithin(id, domainId) {
    if (explore.mode === "detail" && explore.domain === domainId) pickItem(id);
    else if (domainId && domainMembers(graph, domainId).has(id)) open(domainId, id);
    else pickItem(id);
  }

  /** From the overview panel: topics of the article open the article's own category. */
  function pickInContext(id) {
    pickWithin(id, currentDomain);
  }

  /** Esc: unpin, then back to the whole view. Returns whether it did something. */
  export function escape() {
    if (explore.pinnedId) {
      unpin();
      return true;
    }
    if (explore.mode === "detail") {
      back();
      return true;
    }
    return false;
  }

  function cameraKey(key) {
    const camera = viewState.camera;
    const turn = { ArrowLeft: [-KEY_YAW, 0], ArrowRight: [KEY_YAW, 0], ArrowUp: [0, KEY_PITCH], ArrowDown: [0, -KEY_PITCH] }[key];
    if (!turn) return;
    exploreView.moveCamera(clampCamera({ ...camera, yaw: camera.yaw + turn[0], pitch: camera.pitch + turn[1] }, globeView));
  }

  export function zoomBy(factor) {
    exploreView.animateCamera(zoomAt(viewState.camera, globeView, factor, globeView.width / 2, globeView.height / 2), 240);
  }

  function zoomKey(direction) {
    zoomBy(direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  }

  export function rotate(delta) {
    exploreView.animateCamera(clampCamera({ ...viewState.camera, yaw: viewState.camera.yaw + delta }, globeView));
  }

  export function resetView() {
    exploreView.resetCamera();
  }

  export function initialFocusTarget() {
    return root?.querySelector('.kg3-dv [data-node-id][tabindex="0"]') ?? root?.querySelector('.kg3-globe [data-target-id][tabindex="0"]') ?? null;
  }

  function onKeyDown(event) {
    if (event.key !== "Escape" || variant !== "rail") return;
    if (escape()) event.preventDefault();
  }

  const overview = $derived(explore.mode === "overview");
</script>

<!-- Esc is handled for the whole rail region; the dialog handles its own. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={root}
  class="km-surface"
  data-variant={variant}
  data-mode={explore.mode}
  data-domain={explore.domain ?? undefined}
  data-return-pending={pending ? "true" : undefined}
  onkeydown={onKeyDown}
>
  {#if variant === "rail"}
    <div class="km-head">
      <span class="km-kicker">Knowledge Map</span>
      {#if onExpand}
        <button bind:this={expandButton} type="button" class="km-expand" aria-haspopup="dialog" aria-label="지식 지도 넓게 보기" onclick={onExpand}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" /></svg>
          넓게 보기
        </button>
      {/if}
    </div>
    <p class="km-sub">{overview ? "카테고리를 고르면 주제와 글로 펼칩니다" : "카테고리 · 주제 · 글"}</p>
  {/if}

  <div class="km-surface-body">
    <div
      class={variant === "rail" ? "kg3-frame" : "kg3-stage"}
      data-mode={explore.mode}
      data-dragging={dragging ? "true" : undefined}
      hidden={viewMode === "list"}
      bind:clientWidth={frameWidth}
      bind:clientHeight={frameHeight}
    >
      <div class="kg3-stage-root" data-unfold={showDetail ? (viewState.unfold >= 1 ? "open" : "moving") : "closed"} style:width="{frameWidth}px" style:height="{frameHeight}px">
        <div
          bind:this={globeEl}
          class="kg3-globe"
          data-live={globeLive ? "true" : undefined}
          aria-hidden={explore.mode === "detail" ? "true" : undefined}
          style:opacity={globeOpacity < 1 ? globeOpacity : undefined}
          style:visibility={globeHidden ? "hidden" : undefined}
        >
          <GlobeCanvas
            graph={globeGraph}
            {layout}
            view={globeView}
            camera={viewState.camera}
            {variant}
            focusId={overviewFocus}
            activeId={globeLive ? activeDomain : null}
            {starId}
            currentId={globeGraph.byId.has(currentId) ? currentId : null}
            hiddenDomain={showDetail ? viewState.shown : null}
            density={variant === "explorer" ? "rich" : "quiet"}
            {rovingId}
            {moving}
            motion={motion.enabled}
            paused={paused || globeHidden || !active || viewMode === "list"}
            {coarse}
            label={globeLabel}
            describedBy={hintId}
            dragGuard={orbitGuard}
            onHover={setHover}
            onKeyboardFocus={setKeyboard}
            onOpen={open}
            onRove={(id) => (rovingId = id)}
            onCameraKey={cameraKey}
            onZoomKey={variant === "explorer" ? zoomKey : null}
          />
        </div>
        {#if showDetail && floorMap}
          <FloorCanvas
            map={floorMap}
            plan={floorPlan}
            domain={graph.domainById.get(viewState.shown)}
            {variant}
            width={frameWidth}
            height={frameHeight}
            unfold={viewState.unfold}
            focusId={explore.mode === "detail" ? focus.focusId : null}
            pinnedId={explore.mode === "detail" ? explore.pinnedId : null}
            cueId={explore.mode === "detail" ? focus.cueId : null}
            {rovingId}
            currentId={currentId}
            density={variant === "explorer" ? "rich" : "quiet"}
            describedBy={hintId}
            onHover={setHover}
            onKeyboardFocus={setKeyboard}
            onActivate={togglePin}
            onRove={(id) => (rovingId = id)}
            onBack={() => back()}
            onBackgroundClick={unpin}
          />
        {/if}
      </div>
    </div>

    {#if viewMode === "list"}
      <div class="km-dialog-list">
        <MapOutline {graph} openedId={explore.mode === "detail" ? explore.domain : null} selectedId={explore.pinnedId} {currentId} onOpenDomain={(id) => open(id)} onPick={pickWithin} />
      </div>
    {/if}

    {#if variant === "rail"}
      <div class="kg3-foot"><MotionToggle {motion} onChange={onMotion} /></div>
    {/if}

    <div class="km-inspector">
      <MapPanel
        {graph}
        mode={explore.mode}
        domainId={explore.domain}
        {focus}
        pinnedId={explore.pinnedId}
        context={data.context}
        {currentId}
        onPick={overview ? pickInContext : pickItem}
        onOpenDomain={(id) => open(id)}
        onUnpin={unpin}
      />
    </div>
  </div>
  <p id={hintId} class="km-sr">{HINT_TEXT}{variant === "explorer" ? ` ${EXPLORER_HINT}` : ""}</p>
  <p class="km-sr" aria-live="polite">{announcement}</p>
</div>
