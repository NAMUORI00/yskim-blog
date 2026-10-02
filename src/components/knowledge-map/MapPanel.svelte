<script>
  // The map's reading panel: the same content as the picture, as text — so the
  // map works without seeing it. The first line says how you are looking:
  // preview (pointer/keyboard, may change), pinned (stays until unpinned), or an
  // opened category.
  let {
    graph,
    mode = "overview",
    domainId = null,
    focus = { focusId: null, mode: "idle" },
    pinnedId = null,
    context = null,
    currentId = null,
    onPick = () => {},
    onOpenDomain = () => {},
    onUnpin = () => {},
  } = $props();

  const focusId = $derived(focus.focusId);
  const node = $derived(focusId ? graph.byId.get(focusId) ?? null : null);
  const focusDomain = $derived(focusId && !node ? graph.domainByKey.get(focusId) ?? null : null);
  const opened = $derived(mode === "detail" && domainId ? graph.domainById.get(domainId) ?? null : null);
  const postCount = $derived(graph.nodes.filter((item) => item.kind === "post").length);
  const topicCount = $derived(graph.nodes.filter((item) => item.kind === "topic").length);

  const domainOf = (item) => graph.domainById.get(item.domain) ?? null;
  const posts = (ids) => ids.map((id) => graph.byId.get(id)).filter(Boolean);

  /** Other categories that share at least one topic with `domain`, most shared first. */
  function sharedCategories(domain) {
    const counts = new Map();
    for (const topicId of domain.topics) {
      const topic = graph.byId.get(topicId);
      for (const other of topic?.categories ?? []) if (other !== domain.id) counts.set(other, (counts.get(other) ?? 0) + 1);
    }
    return [...counts]
      .map(([id, count]) => ({ domain: graph.domainById.get(id), count }))
      .filter((item) => item.domain)
      .sort((a, b) => b.count - a.count || a.domain.order - b.domain.order);
  }

  function linkedPosts(post) {
    const links = graph.linksOf.get(post.id) ?? [];
    const out = links.filter((link) => link.relation === "linked" && link.source === post.id).map((link) => graph.byId.get(link.target));
    const into = links.filter((link) => link.relation === "linked" && link.target === post.id).map((link) => graph.byId.get(link.source));
    return { out: out.filter(Boolean), into: into.filter(Boolean) };
  }

  function topicPostsIn(topic, domain) {
    return posts(domain?.posts ?? []).filter((post) => post.topics.includes(topic.id));
  }
</script>

{#snippet modeRow(kind, hint)}
  <div class="kg3-mode-row" data-mode={kind}>
    <span class="kg3-mode">
      {#if kind === "pinned"}<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M5 2h6l-1 4 2 2H4l2-2-1-4Zm3 6v6" /></svg>{/if}
      {kind === "pinned" ? "고정됨" : kind === "open" ? "펼친 카테고리" : "미리 보기"}
    </span>
    {#if kind === "pinned"}
      <button type="button" class="km-pin-clear" onclick={onUnpin}>고정 풀기</button>
    {:else}
      <span class="kg3-mode-hint">{hint}</span>
    {/if}
  </div>
{/snippet}

{#snippet postChip(post)}
  <button type="button" class="km-chip kg3-chip" data-kind="post" data-current={post.id === currentId ? "true" : undefined} title={post.title} onclick={() => onPick(post.id)}>
    <span class="kg3-glyph" data-kind="post" aria-hidden="true"></span>{post.label}
  </button>
{/snippet}

{#snippet topicChip(topic)}
  <button type="button" class="km-chip kg3-chip" data-kind="topic" title={topic.title} onclick={() => onPick(topic.id)}>
    <span class="kg3-glyph" data-kind="topic" aria-hidden="true"></span>{topic.label}
  </button>
{/snippet}

{#snippet categoryView(domain, rowMode)}
  {@const shared = sharedCategories(domain)}
  {@const list = posts(domain.posts)}
  <section class="km-detail kg3-detail" aria-label={domain.label} data-focus="domain" data-mode={rowMode}>
    {@render modeRow(rowMode, rowMode === "open" ? "Esc · 전체 보기" : "누르거나 Enter로 펼치기")}
    <p class="km-detail-kicker"><span>카테고리 · 글 {domain.count} · 주제 {domain.topics.length}</span></p>
    <h3 class="km-detail-title">{domain.label}</h3>
    {#if domain.latest}<p class="kg3-meta">최근 글 {domain.latest}</p>{/if}
    {#if rowMode === "preview"}
      <ul class="kg3-plain-list">
        {#each list.slice(0, 3) as post (post.id)}<li>{post.title}</li>{/each}
      </ul>
    {:else}
      <div class="km-detail-section">
        <h4>이 카테고리의 글 <b>{list.length}</b></h4>
        <ul class="kg3-post-list">
          {#each list.slice(0, 8) as post (post.id)}
            <li>
              <a href={post.url} aria-current={post.id === currentId ? "page" : undefined}>{post.title}</a>
              <time datetime={post.date}>{post.date}</time>
            </li>
          {/each}
        </ul>
      </div>
      {#if shared.length > 0}
        <div class="km-detail-section kg3-two-step">
          <h4>주제를 함께 쓰는 카테고리</h4>
          <ul class="km-chips">
            {#each shared as item (item.domain.id)}
              <li><button type="button" class="km-chip kg3-field-chip" onclick={() => onOpenDomain(item.domain.id)}>{item.domain.label} <b>{item.count}</b></button></li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if domain.url}<a class="km-locate" href={domain.url}>카테고리 글 목록 <span aria-hidden="true">→</span></a>{/if}
    {/if}
  </section>
{/snippet}

{#if mode === "overview" || !opened}
  {#if node}
    {@const domain = domainOf(node)}
    <section class="km-detail kg3-detail" aria-label={node.title} data-focus="node" data-mode="preview">
      {@render modeRow("preview", "누르면 펼쳐서 고정")}
      <p class="km-detail-kicker"><span>{domain?.label ?? ""} · {node.kind === "post" ? "글" : "주제"}</span></p>
      <h3 class="km-detail-title">{node.title}</h3>
      {#if node.kind === "post"}
        {#if node.date}<p class="kg3-meta">{node.date}</p>{/if}
        {#if node.summary}<p class="km-detail-text">{node.summary}</p>{/if}
      {:else}
        <p class="kg3-meta">글 {node.count}개</p>
      {/if}
    </section>
  {:else if focusDomain}
    {@render categoryView(focusDomain, "preview")}
  {:else}
    <section class="km-detail kg3-detail" aria-label="지식 지도 요약" data-focus="overview">
      {#if context}
        <div class="kg3-current">
          <p class="km-detail-kicker"><span>지금 읽는 글</span></p>
          <h3 class="km-detail-title">{context.post.title}</h3>
          <p class="kg3-meta">{context.post.date}{#if context.domain} · {context.domain.label}{/if}</p>
          {#if context.topics.length > 0}
            <ul class="km-chips">
              {#each context.topics as topic (topic.id)}<li>{@render topicChip(topic)}</li>{/each}
            </ul>
          {/if}
          {#if context.related.length > 0}
            <div class="km-detail-section">
              <h4>이어 읽기</h4>
              <ul class="kg3-post-list">
                {#each context.related as post (post.id)}
                  <li><a href={post.url}>{post.title}</a><time datetime={post.date}>{post.date}</time></li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      {/if}
      <div class="km-detail-section">
        <h4>카테고리 <b>{graph.domains.length}</b></h4>
        <ul class="km-chips kg3-fields">
          {#each graph.domains as domain (domain.id)}
            <li><button type="button" class="km-chip kg3-field-chip" onclick={() => onOpenDomain(domain.id)}>{domain.label} <b>{domain.count}</b></button></li>
          {/each}
        </ul>
      </div>
      <ul class="km-legend kg3-legend">
        <li><span class="kg3-glyph" data-kind="post" aria-hidden="true"></span>글 <b>{postCount}</b></li>
        <li><span class="kg3-glyph" data-kind="topic" aria-hidden="true"></span>주제 <b>{topicCount}</b></li>
        {#if context}<li><span class="kg3-glyph" data-kind="current" aria-hidden="true"></span>지금 읽는 글</li>{/if}
      </ul>
    </section>
  {/if}
{:else if node && node.kind === "post"}
  {@const domain = domainOf(node)}
  {@const linked = linkedPosts(node)}
  {@const topics = node.topics.map((id) => graph.byId.get(id)).filter(Boolean)}
  <section class="km-detail kg3-detail" aria-label={node.title} data-focus="node" data-kind="post" data-mode={pinnedId === node.id ? "pinned" : "preview"}>
    {@render modeRow(pinnedId === node.id ? "pinned" : "preview", "누르거나 Enter로 고정")}
    <p class="km-detail-kicker"><span>{domain?.label ?? ""} · 글{node.date ? ` · ${node.date}` : ""}</span></p>
    <h3 class="km-detail-title">{node.title}</h3>
    {#if node.id === currentId}<ul class="kg3-badges"><li>지금 읽는 글</li></ul>{/if}
    {#if node.summary}<p class="km-detail-text">{node.summary}</p>{/if}
    {#if topics.length > 0}
      <div class="km-detail-section">
        <h4>주제 <b>{topics.length}</b></h4>
        <ul class="km-chips">
          {#each topics as topic (topic.id)}<li>{@render topicChip(topic)}</li>{/each}
        </ul>
      </div>
    {/if}
    {#if linked.out.length + linked.into.length > 0}
      <div class="km-detail-section">
        <h4>본문 링크로 이어진 글</h4>
        <ul class="km-chips">
          {#each [...linked.out, ...linked.into.filter((post) => !linked.out.includes(post))] as post (post.id)}<li>{@render postChip(post)}</li>{/each}
        </ul>
      </div>
    {/if}
    {#if node.id !== currentId}<a class="km-locate" href={node.url}>글 읽기 <span aria-hidden="true">→</span></a>{/if}
  </section>
{:else if node && node.kind === "topic"}
  {@const inCategory = topicPostsIn(node, opened)}
  {@const others = node.categories.filter((id) => id !== opened.id).map((id) => graph.domainById.get(id)).filter(Boolean)}
  <section class="km-detail kg3-detail" aria-label={node.title} data-focus="node" data-kind="topic" data-mode={pinnedId === node.id ? "pinned" : "preview"}>
    {@render modeRow(pinnedId === node.id ? "pinned" : "preview", "누르거나 Enter로 고정")}
    <p class="km-detail-kicker"><span>주제 · 전체 글 {node.count}</span></p>
    <h3 class="km-detail-title">{node.title}</h3>
    {#if inCategory.length > 0}
      <div class="km-detail-section">
        <h4>{opened.label}의 글 <b>{inCategory.length}</b></h4>
        <ul class="km-chips">
          {#each inCategory as post (post.id)}<li>{@render postChip(post)}</li>{/each}
        </ul>
      </div>
    {/if}
    {#if others.length > 0}
      <div class="km-detail-section kg3-two-step">
        <h4>다른 카테고리</h4>
        <ul class="km-chips">
          {#each others as domain (domain.id)}
            <li><button type="button" class="km-chip kg3-field-chip" onclick={() => onOpenDomain(domain.id)}>{domain.label}</button></li>
          {/each}
        </ul>
      </div>
    {/if}
    <a class="km-locate" href={node.url}>주제 글 목록 <span aria-hidden="true">→</span></a>
  </section>
{:else}
  {@render categoryView(opened, pinnedId && pinnedId === focusId ? "pinned" : "open")}
{/if}
