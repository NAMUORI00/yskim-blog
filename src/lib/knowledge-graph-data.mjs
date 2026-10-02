// Knowledge-map data derived from the published-post taxonomy.
// Categories are the clusters on the globe, posts and their tags ("topics") are
// the stars, and edges are only facts found in the content: a post carries a
// tag, or a post body links to another post.
import { relatedPosts, UNCATEGORIZED_ID } from "./taxonomy.mjs";

export const GRAPH_VERSION = 1;

const collator = new Intl.Collator("ko");

export const postNodeId = (slug) => `post:${slug}`;
export const topicNodeId = (tagId) => `topic:${tagId}`;
export const domainKey = (domainId) => `category:${domainId}`;

/** A short on-map label: the first clause of a title, trimmed to `max` characters. */
export function shortLabel(title, max = 16) {
  const text = String(title ?? "").trim();
  const head = text.split(/\s*(?:[:|(—–]|\s-\s)/)[0]?.trim() || text;
  const chars = Array.from(head);
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : head;
}

function isoDay(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

export function buildBlogGraph(taxonomy, { identity = {} } = {}) {
  const domainOrder = new Map(taxonomy.categories.map((category, index) => [category.id, index]));
  const nodes = [];
  const links = [];

  for (const post of taxonomy.posts) {
    nodes.push({
      id: postNodeId(post.slug),
      kind: "post",
      domain: post.categoryIds[0],
      categories: [...post.categoryIds],
      label: shortLabel(post.title),
      title: post.title,
      url: post.url,
      date: isoDay(post.date),
      summary: post.summary,
      topics: post.tagIds.map(topicNodeId),
      related: relatedPosts(taxonomy, post.slug, { limit: 3 }).map((item) => postNodeId(item.post.slug)),
      order: post.order,
    });
    for (const tagId of post.tagIds) {
      links.push({ key: `${postNodeId(post.slug)}>${topicNodeId(tagId)}`, source: postNodeId(post.slug), target: topicNodeId(tagId), relation: "tagged" });
    }
  }

  taxonomy.tags.forEach((tag, order) => {
    // A topic sits with the category that uses it most; ties keep category order.
    const counts = new Map();
    for (const slug of tag.posts) {
      for (const id of taxonomy.bySlug.get(slug).categoryIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const domain = [...counts].sort((a, b) => b[1] - a[1] || domainOrder.get(a[0]) - domainOrder.get(b[0]))[0]?.[0] ?? UNCATEGORIZED_ID;
    nodes.push({
      id: topicNodeId(tag.id),
      kind: "topic",
      domain,
      categories: [...tag.categoryIds],
      label: tag.label,
      title: `#${tag.label}`,
      url: tag.url,
      count: tag.count,
      order,
    });
  });

  for (const link of taxonomy.links) {
    links.push({ key: `${postNodeId(link.source)}>${postNodeId(link.target)}`, source: postNodeId(link.source), target: postNodeId(link.target), relation: "linked" });
  }

  const domains = taxonomy.categories.map((category, order) => {
    const posts = category.posts.map(postNodeId);
    const topicCounts = new Map();
    for (const slug of category.posts) {
      for (const tagId of taxonomy.bySlug.get(slug).tagIds) topicCounts.set(topicNodeId(tagId), (topicCounts.get(topicNodeId(tagId)) ?? 0) + 1);
    }
    const topics = [...topicCounts]
      .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
      .map(([id]) => id);
    return {
      id: category.id,
      key: domainKey(category.id),
      label: category.label,
      url: category.url,
      count: category.count,
      latest: isoDay(category.latest),
      uncategorized: Boolean(category.uncategorized),
      order,
      posts,
      topics,
      members: nodes.filter((node) => node.domain === category.id).map((node) => node.id),
    };
  });

  return {
    version: GRAPH_VERSION,
    identity: { name: String(identity.name ?? ""), handle: String(identity.handle ?? "").replace(/^@+/, "") },
    domains,
    nodes,
    links,
  };
}

/** Lookup tables used by layouts, scenes, and the panel (rebuilt on the client from JSON). */
export function indexGraph(graph) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const domainById = new Map(graph.domains.map((domain) => [domain.id, domain]));
  const domainByKey = new Map(graph.domains.map((domain) => [domain.key, domain]));
  const neighbors = new Map(graph.nodes.map((node) => [node.id, []]));
  const linksOf = new Map(graph.nodes.map((node) => [node.id, []]));
  const links = graph.links.filter((link) => byId.has(link.source) && byId.has(link.target));
  for (const link of links) {
    neighbors.get(link.source).push(link.target);
    neighbors.get(link.target).push(link.source);
    linksOf.get(link.source).push(link);
    linksOf.get(link.target).push(link);
  }
  return { ...graph, links, byId, domainById, domainByKey, neighbors, linksOf };
}

/**
 * The stars drawn on the globe. Small blogs show everything; larger ones keep
 * `keep` (e.g. an article and its topics), then the newest posts, then the most
 * used topics, so the overview stays readable. Categories stay visible as
 * clusters either way, and the opened category view always lists everything.
 */
export function selectGlobeNodes(graph, { maxNodes = 160, keep = [] } = {}) {
  if (graph.nodes.length <= maxNodes) return graph.nodes.map((node) => node.id);
  const known = new Set(graph.nodes.map((node) => node.id));
  const chosen = new Set(keep.filter((id) => known.has(id)));
  const posts = graph.nodes.filter((node) => node.kind === "post").sort((a, b) => a.order - b.order);
  const topics = graph.nodes
    .filter((node) => node.kind === "topic")
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.order - b.order);
  for (const node of [...posts, ...topics]) {
    if (chosen.size >= maxNodes) break;
    chosen.add(node.id);
  }
  return graph.nodes.filter((node) => chosen.has(node.id)).map((node) => node.id);
}

/** Restrict an indexed graph to some node ids (links and cluster members follow). */
export function subgraph(graph, ids) {
  const keep = new Set(ids);
  const nodes = graph.nodes.filter((node) => keep.has(node.id));
  const links = graph.links.filter((link) => keep.has(link.source) && keep.has(link.target));
  const domains = graph.domains.map((domain) => ({ ...domain, members: domain.members.filter((id) => keep.has(id)) }));
  return indexGraph({ ...graph, nodes, links, domains });
}

/** What the map knows about the article being read (null on other pages). */
export function articleContext(graph, currentId) {
  const post = currentId ? graph.byId.get(currentId) : null;
  if (!post || post.kind !== "post") return null;
  const linked = (graph.linksOf.get(post.id) ?? []).filter((link) => link.relation === "linked");
  return {
    post,
    domain: graph.domainById.get(post.domain) ?? null,
    categories: post.categories.map((id) => graph.domainById.get(id)).filter(Boolean),
    topics: post.topics.map((id) => graph.byId.get(id)).filter(Boolean),
    linksOut: linked.filter((link) => link.source === post.id).map((link) => graph.byId.get(link.target)),
    linksIn: linked.filter((link) => link.target === post.id).map((link) => graph.byId.get(link.source)),
    related: (post.related ?? []).map((id) => graph.byId.get(id)).filter(Boolean),
  };
}
