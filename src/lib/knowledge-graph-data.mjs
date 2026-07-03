const stripHandle = (handle) => String(handle || "namuori").replace(/^@+/, "");

export function buildKnowledgeGraph({ posts, handle, currentSlug, postUrl, tagUrl, slugifyTerm }) {
  const nodes = [];
  const links = [];
  const seen = new Set();

  const addNode = (node) => {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      nodes.push(node);
    }
  };

  const rootSlug = slugifyTerm(stripHandle(handle));
  const rootId = `profile:${rootSlug}`;
  addNode({ id: rootId, label: handle, type: "main", url: "/" });

  for (const post of posts) {
    const postId = `post:${post.data.slug}`;
    addNode({
      id: postId,
      label: post.data.title,
      type: "post",
      url: postUrl(post.data.slug),
      active: post.data.slug === currentSlug,
    });
    links.push({ source: rootId, target: postId });

    for (const tag of post.data.tags) {
      const tagId = `tag:${slugifyTerm(tag)}`;
      addNode({ id: tagId, label: tag, type: "tag", url: tagUrl(tag) });
      links.push({ source: postId, target: tagId });
    }
  }

  return { nodes, links };
}

export function createVisualGraphSubset(graph, { maxNodes = 72 } = {}) {
  if (graph.nodes.length <= maxNodes) return graph;

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const link of graph.links) {
    degree.set(link.source, (degree.get(link.source) || 0) + 1);
    degree.set(link.target, (degree.get(link.target) || 0) + 1);
  }

  const keep = new Set();
  const root = graph.nodes.find((node) => node.type === "main");
  const active = graph.nodes.find((node) => node.active);
  if (root) keep.add(root.id);
  if (active) keep.add(active.id);

  if (active) {
    for (const link of graph.links) {
      if (link.source === active.id) keep.add(link.target);
      if (link.target === active.id) keep.add(link.source);
    }
  }

  const remaining = graph.nodes
    .filter((node) => !keep.has(node.id))
    .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.id.localeCompare(b.id));

  for (const node of remaining) {
    if (keep.size >= maxNodes) break;
    keep.add(node.id);
  }

  const nodes = [...graph.nodes.filter((node) => keep.has(node.id))];
  const links = graph.links.filter((link) => keep.has(link.source) && keep.has(link.target));

  for (const nodeId of keep) {
    if (!nodesById.has(nodeId)) {
      throw new Error(`Missing graph node ${nodeId}`);
    }
  }

  return { nodes, links };
}
