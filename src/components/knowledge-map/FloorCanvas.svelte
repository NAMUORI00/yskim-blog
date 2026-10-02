<script>
  // One category opened into three planes: the category, its topics, its posts.
  // Choosing an item lifts its path between the planes; everything else dims.
  // "← 전체 보기" always stays at the top; tall categories scroll below it.
  import {
    computeFloorScene,
    FLOOR_HIT,
    floorViewport,
    isFloorKey,
    LAYER_TITLES,
    layerCounts,
    MARK,
    navigateFloor,
    planeCorners,
    projectFloor,
    slabPoints,
  } from "../../lib/graph/floor-layout.mjs";
  import { isFocusVisible } from "./shared.mjs";

  let {
    map,
    plan,
    domain,
    variant = "rail",
    width,
    height,
    unfold = 1,
    focusId = null,
    pinnedId = null,
    cueId = null,
    rovingId = null,
    currentId = null,
    density = "quiet",
    describedBy = undefined,
    onHover = () => {},
    onKeyboardFocus = () => {},
    onActivate = () => {},
    onRove = () => {},
    onBack = () => {},
    onBackgroundClick = () => {},
  } = $props();

  const HEAD = { rail: 34, explorer: 44 };
  const GRID_U = [-0.5, 0, 0.5];
  const GRID_V = [-1 / 3, 1 / 3];
  const fx = (value) => Math.round(value * 10) / 10;
  const points = (list) => list.map((point) => `${fx(point.x)},${fx(point.y)}`).join(" ");

  let root = $state(null);
  const settled = $derived(unfold >= 1);
  const counts = $derived(layerCounts(map));
  const view = $derived(floorViewport(variant, Math.max(160, width - 16), { counts, maxHeight: Math.max(160, height - HEAD[variant] - 12), unfold }));
  const scene = $derived(computeFloorScene({ map, plan, view, variant, focusId: settled ? focusId : null, currentId, density }));
  const hitSize = $derived(FLOOR_HIT[variant] ?? FLOOR_HIT.rail);
  const roving = $derived(rovingId && map.byId.has(rovingId) ? rovingId : map.nodes[0]?.id ?? null);

  const nodeName = (node) => {
    if (node.layer === "category") return `${node.label} — 카테고리, 글 ${node.count}개`;
    if (node.layer === "topic") return `#${node.label} — 주제, 이 카테고리의 글 ${node.count}개`;
    return `${node.title}${node.date ? `, ${node.date}` : ""} — 글${node.id === currentId ? ", 지금 읽는 글" : ""}`;
  };

  function handleKeyDown(event) {
    const current = event.target.closest?.("[data-node-id]")?.dataset.nodeId;
    if (!current || !isFloorKey(event.key) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const base = new Map([...scene.positions].map(([id, position]) => [id, position.base]));
    const next = navigateFloor(map, base, current, event.key);
    if (next === current) return;
    root?.querySelector(`[data-node-id="${CSS.escape(next)}"]`)?.focus();
    onKeyboardFocus(next);
  }
</script>

<div bind:this={root} class="kg3-dv" data-variant={variant} data-unfolding={settled ? undefined : "true"} style:height="{height}px">
  <div class="kg3-dv-head" style:height="{HEAD[variant]}px" style:opacity={settled ? undefined : Math.min(1, unfold / 0.4)}>
    <button type="button" class="kg3-back" aria-label="전체 보기로 돌아가기" title="전체 보기로 돌아가기 (Esc)" onclick={onBack}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
      전체 보기
    </button>
    <p class="kg3-dv-title">
      <span class="kg3-dv-path">Me</span>
      <span class="kg3-dv-sep" aria-hidden="true">/</span>
      <b>{domain.label}</b>
      <span class="kg3-dv-count">{domain.count}</span>
    </p>
  </div>
  <div class="kg3-dv-scroll" style:top="{HEAD[variant]}px">
    <div class="km-canvas" data-variant={variant} data-moving={settled ? undefined : "true"} data-focus={focusId ? "true" : undefined} style:width="{view.width}px" style:height="{view.height}px">
      <svg class="km-svg" width={view.width} height={view.height} viewBox="0 0 {view.width} {view.height}" aria-hidden="true" focusable="false">
        {#each scene.titles as title (title.layer)}
          {@const corners = planeCorners(view, title.layer)}
          <g class="km-plane" data-layer={title.layer}>
            {#if view.rise > 0.05}<polygon class="km-plane-slab" points={points(slabPoints(corners, 3.2 * view.rise))} />{/if}
            <polygon class="km-plane-face" points={points(corners)} />
            <g class="km-plane-grid">
              {#each GRID_U as u (u)}
                {@const a = projectFloor(view, title.layer, { u, v: -1 })}
                {@const b = projectFloor(view, title.layer, { u, v: 1 })}
                <line x1={fx(a.x)} y1={fx(a.y)} x2={fx(b.x)} y2={fx(b.y)} />
              {/each}
              {#each GRID_V as v (v)}
                {@const a = projectFloor(view, title.layer, { u: -1, v })}
                {@const b = projectFloor(view, title.layer, { u: 1, v })}
                <line x1={fx(a.x)} y1={fx(a.y)} x2={fx(b.x)} y2={fx(b.y)} />
              {/each}
            </g>
          </g>
        {/each}
        <g class="km-side-threads">
          {#each scene.sideThreads as thread (thread.key)}
            <path
              class="km-side-thread"
              data-active={thread.active ? "true" : undefined}
              d="M {fx(thread.a.x)} {fx(thread.a.y)} Q {fx((thread.a.x + thread.b.x) / 2)} {fx(Math.min(thread.a.y, thread.b.y) - 10 - Math.abs(thread.b.x - thread.a.x) * 0.12)} {fx(thread.b.x)} {fx(thread.b.y)}"
            />
          {/each}
        </g>
        <g class="km-threads">
          {#each scene.threads as thread (thread.key)}
            <line
              class="km-thread"
              data-direct={thread.direct ? "true" : undefined}
              x1={fx(thread.a.x)}
              y1={fx(thread.a.y)}
              x2={fx(thread.b.x)}
              y2={fx(thread.b.y)}
              style:--km-len={Math.ceil(Math.hypot(thread.b.x - thread.a.x, thread.b.y - thread.a.y))}
            />
          {/each}
        </g>
        <g class="km-marks">
          {#each map.nodes as node (node.id)}
            {@const position = scene.positions.get(node.id)}
            {#if position}
              {@const half = MARK.topic}
              <g class="km-mark" data-layer={node.layer} data-state={scene.states.get(node.id)} data-current={node.id === currentId ? "true" : undefined}>
                {#if position.lift > 0}
                  <ellipse class="km-shadow" cx={fx(position.base.x)} cy={fx(position.base.y)} rx="5" ry={fx(Math.max(1.2, 5 * view.tilt))} />
                  <line class="km-stem" x1={fx(position.base.x)} y1={fx(position.base.y)} x2={fx(position.top.x)} y2={fx(position.top.y)} />
                {/if}
                <g class="km-glyph" style:transform="translate({fx(position.top.x)}px, {fx(position.top.y)}px)">
                  {#if node.id === focusId}<circle class="km-halo" r={MARK[node.layer] + 5} />{/if}
                  {#if node.id === currentId}<circle class="km-current" r={MARK[node.layer] + 2.6} />{/if}
                  {#if node.layer === "topic"}
                    <path class="km-dot" d="M 0 {-half} L {half} 0 L 0 {half} L {-half} 0 Z" />
                  {:else}
                    <circle class="km-dot" r={MARK[node.layer]} />
                  {/if}
                </g>
              </g>
            {/if}
          {/each}
        </g>
      </svg>
      <!-- Keys are handled once here for the roving node buttons; a click on empty space only unpins. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <div
        class="km-overlay"
        role="group"
        aria-label="{domain.label} — 카테고리, 주제, 글 층으로 펼친 보기"
        aria-describedby={describedBy}
        onkeydown={handleKeyDown}
        onclick={(event) => {
          if (event.target === event.currentTarget) onBackgroundClick();
        }}
      >
        {#each scene.titles as title (title.layer)}
          <div
            class="km-layer-title"
            data-layer={title.layer}
            data-covered={scene.coveredTitles.has(title.layer) ? "true" : undefined}
            aria-hidden="true"
            style:left="{title.box.left}px"
            style:top="{title.box.top}px"
            style:width="{title.box.width}px"
            style:height="{title.box.height}px"
            style:opacity={settled ? undefined : Math.max(0, (unfold - 0.4) / 0.6)}
          >
            <span class="km-layer-glyph" data-layer={title.layer}></span>
            <span class="km-layer-name">{LAYER_TITLES[title.layer]}</span>
            <span class="km-layer-count">{title.count}</span>
          </div>
        {/each}
        {#each map.nodes as node (node.id)}
          {@const position = scene.positions.get(node.id)}
          {#if position}
            {@const placed = scene.labels.get(node.id)}
            {@const hit = hitSize[node.layer]}
            <button
              type="button"
              class="km-node"
              data-node-id={node.id}
              data-layer={node.layer}
              data-state={scene.states.get(node.id)}
              data-labelled={placed ? "true" : undefined}
              data-cue={node.id === cueId ? "true" : undefined}
              data-current={node.id === currentId ? "true" : undefined}
              aria-label={nodeName(node)}
              aria-pressed={pinnedId === node.id}
              tabindex={node.id === roving ? 0 : -1}
              style:left="{position.top.x}px"
              style:top="{position.top.y}px"
              style:width="{hit}px"
              style:height="{hit}px"
              onclick={() => onActivate(node.id)}
              onpointerenter={(event) => {
                if (event.pointerType !== "touch" && settled) onHover(node.id);
              }}
              onpointerleave={() => onHover(null)}
              onfocus={(event) => {
                onRove(node.id);
                if (isFocusVisible(event.currentTarget)) onKeyboardFocus(node.id);
              }}
              onblur={() => onKeyboardFocus(null)}
            >
              {#if placed}
                <span
                  class="km-label"
                  data-side={placed.side}
                  style:left="{placed.box.left - (position.top.x - hit / 2)}px"
                  style:top="{placed.box.top - (position.top.y - hit / 2)}px"
                  style:font-size="{scene.type[node.layer]}px"
                >{node.layer === "topic" ? `#${node.label}` : node.label}</span>
              {/if}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  </div>
</div>
