<script>
  // The same map as a plain list: every category with its posts and topics.
  // Choosing an item updates the panel exactly like choosing it on the map.
  let { graph, openedId = null, selectedId = null, currentId = null, onOpenDomain = () => {}, onPick = () => {} } = $props();

  const itemsOf = (ids) => ids.map((id) => graph.byId.get(id)).filter(Boolean);
</script>

<div class="km-outline kg3-outline">
  {#each graph.domains as domain (domain.id)}
    {@const posts = itemsOf(domain.posts)}
    {@const topics = itemsOf(domain.topics)}
    <section aria-label={domain.label}>
      <h3>
        <button type="button" class="km-outline-item kg3-outline-field" aria-pressed={openedId === domain.id} onclick={() => onOpenDomain(domain.id)}>{domain.label}</button>
        <b>{domain.count}</b>
      </h3>
      <ul>
        {#each posts as post (post.id)}
          <li class="kg3-outline-post">
            <button type="button" class="km-outline-item" data-kind="post" aria-pressed={selectedId === post.id} onclick={() => onPick(post.id, domain.id)}>
              <span class="kg3-glyph" data-kind={post.id === currentId ? "current" : "post"} aria-hidden="true"></span>{post.title}
            </button>
            <time datetime={post.date}>{post.date}</time>
            <a class="kg3-outline-link" href={post.url} aria-label="{post.title} 읽기">읽기</a>
          </li>
        {/each}
      </ul>
      {#if topics.length > 0}
        <p class="kg3-outline-note">주제</p>
        <ul class="km-chips">
          {#each topics as topic (topic.id)}
            <li>
              <button type="button" class="km-chip kg3-chip" data-kind="topic" aria-pressed={selectedId === topic.id} onclick={() => onPick(topic.id, domain.id)}>
                <span class="kg3-glyph" data-kind="topic" aria-hidden="true"></span>{topic.label}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</div>
