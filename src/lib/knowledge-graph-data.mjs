const DEFAULT_HANDLE = "namuori";

const normalizeHandle = (handle) => {
  const explicitLabel = String(handle ?? "").trim();
  const strippedHandle = explicitLabel.replace(/^@+/, "").trim();
  const normalized = strippedHandle || DEFAULT_HANDLE;

  return {
    label: strippedHandle ? explicitLabel : `@${DEFAULT_HANDLE}`,
    slugSource: normalized,
  };
};

export function buildKnowledgeGraph({ posts, handle, currentSlug, postUrl, tagUrl, slugifyTerm }) {
  const nodes = [];
  const links = [];
  const seen = new Set();
  const seenLinks = new Set();

  const addNode = (node) => {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      nodes.push(node);
    }
  };

  const addLink = (link) => {
    const linkId = `${link.source}\0${link.target}`;
    if (!seenLinks.has(linkId)) {
      seenLinks.add(linkId);
      links.push(link);
    }
  };

  const rootHandle = normalizeHandle(handle);
  const rootSlug = slugifyTerm(rootHandle.slugSource);
  const rootId = `profile:${rootSlug}`;
  addNode({ id: rootId, label: rootHandle.label, type: "main", url: "/" });

  for (const post of posts) {
    const postId = `post:${post.data.slug}`;
    addNode({
      id: postId,
      label: post.data.title,
      type: "post",
      url: postUrl(post.data.slug),
      active: post.data.slug === currentSlug,
    });
    addLink({ source: rootId, target: postId });

    for (const tag of post.data.tags) {
      const tagId = `tag:${slugifyTerm(tag)}`;
      addNode({ id: tagId, label: tag, type: "tag", url: tagUrl(tag) });
      addLink({ source: postId, target: tagId });
    }
  }

  return { nodes, links };
}

export function createVisualGraphSubset(graph, { maxNodes = 72 } = {}) {
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
  const requestedMaxNodes = Number.isFinite(maxNodes) ? Math.max(0, Math.floor(maxNodes)) : 72;
  const effectiveMaxNodes = Math.max(requestedMaxNodes, keep.size);

  if (graph.nodes.length <= effectiveMaxNodes) return graph;

  const byDegreeThenId = (a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.id.localeCompare(b.id);

  const addUntilFull = (candidates) => {
    for (const node of candidates) {
      if (keep.size >= effectiveMaxNodes) break;
      keep.add(node.id);
    }
  };

  if (active) {
    const connectedIds = new Set();
    for (const link of graph.links) {
      if (link.source === active.id) connectedIds.add(link.target);
      if (link.target === active.id) connectedIds.add(link.source);
    }
    const connectedNodes = [...connectedIds]
      .filter((nodeId) => !keep.has(nodeId))
      .map((nodeId) => nodesById.get(nodeId))
      .filter(Boolean)
      .sort(byDegreeThenId);
    addUntilFull(connectedNodes);
  }

  const remaining = graph.nodes
    .filter((node) => !keep.has(node.id))
    .sort(byDegreeThenId);
  addUntilFull(remaining);

  const nodes = [...graph.nodes.filter((node) => keep.has(node.id))];
  const links = graph.links.filter((link) => keep.has(link.source) && keep.has(link.target));

  for (const nodeId of keep) {
    if (!nodesById.has(nodeId)) {
      throw new Error(`Missing graph node ${nodeId}`);
    }
  }

  return { nodes, links };
}
