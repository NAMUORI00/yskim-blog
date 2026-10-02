<script>
  // The globe: "Me" at the centre (named only on hover), categories as clusters
  // on the shell, posts (●) and topics (◆) as stars. SVG draws the picture; the
  // HTML overlay carries every name and control so text stays crisp and
  // focusable. Categories are the keyboard targets; stars are pointer targets.
  import { onDestroy } from "svelte";
  import {
    COARSE_HIT,
    computeGlobeScene,
    haloOpacity,
    HIT,
    isNavKey,
    linkOpacity,
    navigateDomains,
    nodeOpacity,
    PREVIEW_DEPTH,
  } from "../../lib/graph/globe-scene.mjs";
  import { DRIFT_PX } from "../../lib/graph/motion.mjs";
  import { createMotionDriver } from "../../lib/graph/motion-driver.mjs";
  import { isFocusVisible, nextId } from "./shared.mjs";

  let {
    graph,
    layout,
    view,
    camera,
    variant = "rail",
    focusId = null,
    activeId = null,
    starId = null,
    currentId = null,
    hiddenDomain = null,
    density = "quiet",
    rovingId = null,
    interactive = true,
    moving = false,
    motion = false,
    paused = false,
    coarse = false,
    label = "",
    describedBy = undefined,
    dragGuard = null,
    onHover = () => {},
    onKeyboardFocus = () => {},
    onOpen = () => {},
    onRove = () => {},
    onCameraKey = null,
    onZoomKey = null,
  } = $props();

  const glowId = nextId("kg3-glow");
  const fx = (value) => Math.round(value * 100) / 100;
  let root = $state(null);
  let previousSides = new Map();

  const scene = $derived(
    computeGlobeScene({ graph, layout, view, camera, variant, focusId, depth: PREVIEW_DEPTH, density, starId, currentId, hiddenDomain, previousSides }),
  );
  const animate = $derived(motion && interactive);
  const roving = $derived(rovingId && graph.domainByKey.has(rovingId) ? rovingId : graph.domains.find((domain) => domain.id !== hiddenDomain)?.key ?? null);
  const hit = $derived(interactive ? HIT[variant] * (coarse && variant === "explorer" ? COARSE_HIT : 1) : 0);
  const focusDomain = $derived(scene.hood?.kind === "domain" ? scene.hood.domain : null);

  let signal = $state(null);
  let signalNonce = 0;
  let pageVisible = $state(true);
  let inView = $state(true);
  const driver = createMotionDriver({
    onSignal: (key) => {
      signalNonce += 1;
      signal = { key, nonce: signalNonce };
    },
  });
  const running = $derived(animate && !paused && pageVisible && inView && DRIFT_PX[variant] > 0);

  const sparks = $derived.by(() => {
    if (!animate || hiddenDomain) return [];
    const toSpark = (link, key, ambient) => ({ key, source: link.source, target: link.target, from: link.a, to: link.b, length: Math.hypot(link.b.x - link.a.x, link.b.y - link.a.y), ambient });
    if (focusDomain) return scene.links.filter((link) => link.tier === "near" && !link.cross).map((link) => toSpark(link, `${focusDomain}|${link.key}`, false));
    if (!scene.hood && signal) {
      const link = scene.links.find((item) => item.key === signal.key);
      if (link) return [toSpark(link, `signal|${signal.nonce}`, true)];
    }
    return [];
  });

  $effect(() => {
    previousSides = new Map([...scene.labels.values()].map((item) => [item.id, item.side]));
  });

  $effect(() => {
    driver.update(
      { graph, layout, view, camera, scene, variant, interactive, activeId: starId ?? activeId, moving, coarse, signals: animate && !scene.hood && !hiddenDomain },
      root,
    );
  });

  $effect(() => {
    if (!running) return;
    driver.start();
    return () => driver.stop();
  });

  $effect(() => {
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) inView = entry.isIntersecting;
    });
    observer.observe(root);
    return () => observer.disconnect();
  });

  $effect(() => {
    const update = () => (pageVisible = document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  });

  onDestroy(() => driver.destroy());

  function guarded(event) {
    return event.detail !== 0 && dragGuard?.moved;
  }

  function enter(event, id, domainKey) {
    if (event.pointerType === "touch") return;
    driver.setPointerTarget(domainKey ?? id);
    if (!moving) onHover(id);
  }

  function leave() {
    driver.setPointerTarget(null);
    onHover(null);
  }

  function focusTarget(id) {
    const target = root?.querySelector(`[data-target-id="${CSS.escape(id)}"]`);
    target?.focus();
  }

  function handleKeyDown(event) {
    const current = event.target.closest?.("[data-target-id]")?.dataset.targetId;
    if (!current) return;
    const arrow = event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown";
    if (event.shiftKey && onCameraKey && arrow) {
      event.preventDefault();
      onCameraKey(event.key);
      return;
    }
    if (onZoomKey && ["+", "=", "-", "_"].includes(event.key)) {
      event.preventDefault();
      onZoomKey(event.key === "-" || event.key === "_" ? -1 : 1);
      return;
    }
    if (!isNavKey(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const targets = new Map();
    for (const item of scene.domains) if (item.domain.id !== hiddenDomain) targets.set(item.domain.key, { x: item.x, y: item.y });
    const next = navigateDomains(graph.domains, targets, current, event.key);
    if (next === current) return;
    focusTarget(next);
    onKeyboardFocus(next);
  }

  const domainName = (domain) => `${domain.label} — 카테고리, 글 ${domain.count}개. 펼치기`;
</script>

<div
  bind:this={root}
  class="kg3-canvas"
  data-variant={variant}
  data-moving={moving ? "true" : undefined}
  data-focus={scene.hood ? scene.hood.kind : undefined}
  data-motion={animate ? (running ? "on" : "paused") : "off"}
  style:width="{view.width}px"
  style:height="{view.height}px"
  onpointermove={interactive ? (event) => driver.pointerMove(event) : undefined}
  onpointerleave={interactive ? () => driver.pointerLeave() : undefined}
>
  <svg class="kg3-svg" width={view.width} height={view.height} viewBox="0 0 {view.width} {view.height}" aria-hidden="true" focusable="false">
    {#if interactive}
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0" stop-color="currentColor" stop-opacity="0.5" />
          <stop offset="0.6" stop-color="currentColor" stop-opacity="0.16" />
          <stop offset="1" stop-color="currentColor" stop-opacity="0" />
        </radialGradient>
      </defs>
    {/if}
    <path class="kg3-equator" d={scene.equator} />
    <g class="kg3-spokes">
      {#each scene.spokes as spoke (spoke.domain)}
        {#if spoke.domain !== hiddenDomain}
          <line class="kg3-spoke" data-domain={spoke.domain} data-state={spoke.state} x1={fx(scene.core.x)} y1={fx(scene.core.y)} x2={fx(spoke.x)} y2={fx(spoke.y)} />
        {/if}
      {/each}
    </g>
    <g class="kg3-halos">
      {#each scene.domains as item (item.domain.id)}
        {#if item.domain.id !== hiddenDomain}
          <circle class="kg3-halo-region" data-domain={item.domain.id} data-state={item.state} cx={fx(item.x)} cy={fx(item.y)} r={fx(item.r)} opacity={fx(haloOpacity(item.state, item.fog))} />
        {/if}
      {/each}
    </g>
    <g class="kg3-links">
      {#each scene.links as link (link.key)}
        {#if !hiddenDomain || (graph.byId.get(link.source).domain !== hiddenDomain && graph.byId.get(link.target).domain !== hiddenDomain)}
          <line
            class="kg3-link"
            data-key={link.key}
            data-source={link.source}
            data-target={link.target}
            data-tier={link.tier}
            data-cross={link.cross ? "true" : undefined}
            data-relation={link.relation}
            x1={fx(link.a.x)}
            y1={fx(link.a.y)}
            x2={fx(link.b.x)}
            y2={fx(link.b.y)}
            opacity={fx(linkOpacity(link.tier, (link.a.fog + link.b.fog) / 2, link.cross))}
          />
        {/if}
      {/each}
    </g>
    {#if sparks.length > 0}
      <g class="kg3-sparks">
        {#each sparks as spark (spark.key)}
          <line
            class="kg3-spark"
            data-ambient={spark.ambient ? "true" : undefined}
            data-source={spark.source}
            data-target={spark.target}
            x1={fx(spark.from.x)}
            y1={fx(spark.from.y)}
            x2={fx(spark.to.x)}
            y2={fx(spark.to.y)}
            stroke-dasharray="9 {fx(spark.length + 18)}"
            style:--kg3-spark-length={fx(spark.length)}
            style:--kg3-spark-segment="9"
          />
        {/each}
      </g>
    {/if}
    <!-- Far to near; the centre's glow sits between the stars behind it and those in front. -->
    <g class="kg3-nodes">
      {#each scene.order as id, index (id)}
        {@const node = graph.byId.get(id)}
        {@const point = scene.points.get(id)}
        {#if index === scene.behind}
          <circle class="kg3-core-glow" cx={fx(scene.core.x)} cy={fx(scene.core.y)} r={variant === "explorer" ? 18 : 15} />
        {/if}
        {#if node && point && node.domain !== hiddenDomain}
          {@const state = scene.states.get(id) ?? "idle"}
          {@const star = id === starId}
          {@const opacity = nodeOpacity(state, point.fog)}
          {@const half = point.r * 1.18}
          <g
            class="kg3-node"
            data-id={id}
            data-kind={node.kind}
            data-state={state}
            data-current={id === currentId ? "true" : undefined}
            data-active={star ? "true" : undefined}
            transform="translate({fx(point.x)} {fx(point.y)})"
            opacity={fx(star ? Math.max(0.9, opacity) : opacity)}
          >
            {#if interactive}<circle class="kg3-glow" r={fx(point.r + 9)} fill="url(#{glowId})" opacity="0" />{/if}
            {#if star}<circle class="kg3-halo" r={fx(point.r + 5)} />{/if}
            {#if star && animate}<circle class="kg3-pulse" r={fx(point.r + 5)} />{/if}
            {#if id === currentId}<circle class="kg3-current" r={fx(point.r + 3)} />{/if}
            {#if node.kind === "topic"}
              <path class="kg3-dot" d="M 0 {fx(-half)} L {fx(half)} 0 L 0 {fx(half)} L {fx(-half)} 0 Z" />
            {:else}
              <circle class="kg3-dot" r={fx(point.r)} />
            {/if}
          </g>
        {/if}
      {/each}
      {#if scene.behind >= scene.order.length}
        <circle class="kg3-core-glow" cx={fx(scene.core.x)} cy={fx(scene.core.y)} r={variant === "explorer" ? 18 : 15} />
      {/if}
    </g>
  </svg>

  <!-- Keys are handled once here for the roving category buttons inside. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_static_element_interactions -->
  <div
    class="kg3-overlay"
    role={interactive ? "group" : undefined}
    aria-label={interactive ? label : undefined}
    aria-describedby={interactive ? describedBy : undefined}
    aria-hidden={interactive ? undefined : "true"}
    onkeydown={interactive ? handleKeyDown : undefined}
  >
    <span
      class="kg3-core-label"
      aria-hidden="true"
      style:left="{fx(scene.core.x - (variant === 'explorer' ? 12 : 9))}px"
      style:top="{fx(scene.core.y - (variant === 'explorer' ? 12 : 9))}px"
      style:width="{variant === 'explorer' ? 24 : 18}px"
      style:height="{variant === 'explorer' ? 24 : 18}px"
    ><b>Me</b></span>

    {#if interactive}
      <!-- Pointer-only hit areas; every action here is also on the category buttons below. -->
      {#each scene.domains as item, index (item.domain.id)}
        {#if item.domain.id !== hiddenDomain}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <span
            class="kg3-region-hit"
            data-domain={item.domain.id}
            aria-hidden="true"
            style:left="{fx(item.x - item.r)}px"
            style:top="{fx(item.y - item.r)}px"
            style:width="{fx(item.r * 2)}px"
            style:height="{fx(item.r * 2)}px"
            style:z-index={2 + index}
            onclick={(event) => {
              if (!guarded(event)) onOpen(item.domain.id);
            }}
            onpointerenter={(event) => enter(event, item.domain.key, item.domain.key)}
            onpointerleave={leave}
          ></span>
        {/if}
      {/each}
      {#each graph.nodes as node (node.id)}
        {@const point = scene.points.get(node.id)}
        {#if point && node.domain !== hiddenDomain}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <span
            class="kg3-star"
            data-node-id={node.id}
            data-domain={node.domain}
            aria-hidden="true"
            style:left="{fx(point.x)}px"
            style:top="{fx(point.y)}px"
            style:width="{hit}px"
            style:height="{hit}px"
            style:z-index={20 + (scene.rank.get(node.id) ?? 0)}
            onclick={(event) => {
              if (!guarded(event)) onOpen(node.domain, node.id);
            }}
            onpointerenter={(event) => enter(event, node.id, null)}
            onpointerleave={leave}
          ></span>
        {/if}
      {/each}
    {/if}

    {#each graph.nodes as node (node.id)}
      {@const placed = scene.labels.get(node.id)}
      {@const point = scene.points.get(node.id)}
      {#if placed && point}
        {@const state = scene.states.get(node.id)}
        {@const star = node.id === starId}
        <span
          class="kg3-label"
          data-node-id={node.id}
          data-kind={node.kind}
          data-state={state}
          data-active={star ? "true" : undefined}
          data-side={placed.side}
          aria-hidden="true"
          style:left="{fx(placed.box.left)}px"
          style:top="{fx(placed.box.top)}px"
          style:font-size="{scene.fontSize}px"
          style:z-index={star ? 420 : 140}
          style:opacity={(state === "idle" || state === "current") && !star ? fx(0.55 + 0.45 * point.fog) : undefined}
        >{node.kind === "topic" ? `#${node.label}` : node.label}</span>
      {/if}
    {/each}

    {#each scene.domains as item (item.domain.id)}
      {@const placed = item.domain.id === hiddenDomain ? undefined : scene.labels.get(item.domain.key)}
      {#if interactive}
        <button
          type="button"
          class="kg3-domain"
          data-target-id={item.domain.key}
          data-domain={item.domain.id}
          data-state={item.state}
          data-labelled={placed ? "true" : undefined}
          data-hidden={item.domain.id === hiddenDomain ? "true" : undefined}
          data-active={item.domain.key === activeId ? "true" : undefined}
          aria-label={domainName(item.domain)}
          tabindex={item.domain.key === roving ? 0 : -1}
          style:left="{fx(placed ? placed.box.left : item.x - 7)}px"
          style:top="{fx(placed ? placed.box.top : item.y - 7)}px"
          style:width="{fx(placed ? placed.box.width : 14)}px"
          style:height="{fx(placed ? placed.box.height : 14)}px"
          style:font-size={placed ? `${scene.domainSize}px` : undefined}
          style:z-index={placed ? (item.state === "focus" ? 360 : 300) : 290}
          onclick={(event) => {
            if (!guarded(event)) onOpen(item.domain.id);
          }}
          onpointerenter={(event) => enter(event, item.domain.key, item.domain.key)}
          onpointerleave={leave}
          onfocus={(event) => {
            onRove(item.domain.key);
            if (isFocusVisible(event.currentTarget)) onKeyboardFocus(item.domain.key);
          }}
          onblur={() => onKeyboardFocus(null)}
        >
          {#if placed}
            <span class="kg3-domain-name">{item.domain.label}</span>
            <span class="kg3-domain-count">{item.domain.count}</span>
          {/if}
        </button>
      {:else if placed}
        <span
          class="kg3-domain kg3-static-domain"
          data-domain={item.domain.id}
          data-state={item.state}
          style:left="{fx(placed.box.left)}px"
          style:top="{fx(placed.box.top)}px"
          style:width="{fx(placed.box.width)}px"
          style:height="{fx(placed.box.height)}px"
          style:font-size="{scene.domainSize}px"
        >
          <span class="kg3-domain-name">{item.domain.label}</span>
          <span class="kg3-domain-count">{item.domain.count}</span>
        </span>
      {/if}
    {/each}
  </div>
</div>
