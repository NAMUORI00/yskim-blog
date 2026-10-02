// The knowledge map's data file: graph facts plus the layouts computed once at
// build time, so browsers only project and draw. Served as /knowledge-map.json.
import { buildBlogGraph, indexGraph, selectGlobeNodes, subgraph } from "../knowledge-graph-data.mjs";
import { buildFloorMap, layoutFloorPlan, parsePlan, serializePlan } from "./floor-layout.mjs";
import { layoutGlobe, parseGlobe, serializeGlobe } from "./globe-layout.mjs";

/** Above this many stars the force layout runs on the most connected subset. */
const MAX_LAYOUT_NODES = 900;

const pickNode = (node) => {
  const base = { id: node.id, kind: node.kind, domain: node.domain, categories: node.categories, label: node.label, title: node.title, url: node.url, order: node.order };
  if (node.kind === "post") return { ...base, date: node.date, summary: node.summary, topics: node.topics, related: node.related };
  return { ...base, count: node.count };
};

const pickDomain = (domain) => ({
  id: domain.id,
  key: domain.key,
  label: domain.label,
  url: domain.url,
  count: domain.count,
  latest: domain.latest,
  uncategorized: domain.uncategorized,
  order: domain.order,
  posts: domain.posts,
  topics: domain.topics,
  members: domain.members,
});

export function buildKnowledgeMapPayload(taxonomy, { identity = {} } = {}) {
  const graph = indexGraph(buildBlogGraph(taxonomy, { identity }));
  const laidOut = graph.nodes.length > MAX_LAYOUT_NODES ? subgraph(graph, selectGlobeNodes(graph, { maxNodes: MAX_LAYOUT_NODES })) : graph;
  const globe = layoutGlobe(laidOut);
  const floors = {};
  for (const domain of graph.domains) {
    const map = buildFloorMap(graph, domain.id);
    if (map) floors[domain.id] = serializePlan(layoutFloorPlan(map));
  }
  return {
    version: graph.version,
    identity: graph.identity,
    domains: graph.domains.map(pickDomain),
    nodes: graph.nodes.map(pickNode),
    links: graph.links.map(({ key, source, target, relation }) => ({ key, source, target, relation })),
    globe: serializeGlobe(globe),
    floors,
  };
}

export function parseKnowledgeMapPayload(json) {
  const graph = indexGraph({
    version: json?.version ?? 0,
    identity: json?.identity ?? { name: "", handle: "" },
    domains: Array.isArray(json?.domains) ? json.domains : [],
    nodes: Array.isArray(json?.nodes) ? json.nodes : [],
    links: Array.isArray(json?.links) ? json.links : [],
  });
  const floors = new Map(Object.entries(json?.floors ?? {}).map(([id, plan]) => [id, parsePlan(plan)]));
  return { graph, globe: parseGlobe(json?.globe), floors };
}
