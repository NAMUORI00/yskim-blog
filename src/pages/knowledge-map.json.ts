import type { APIRoute } from "astro";
import { getTaxonomy } from "../lib/posts";
import { getSiteProfile } from "../lib/profile";
import { buildKnowledgeMapPayload } from "../lib/graph/payload.mjs";

// Built with the site from the published posts; pages fetch it with the build's
// asset version, so a new publish never mixes with a cached map.
export const GET: APIRoute = async () => {
  const taxonomy = await getTaxonomy();
  const profile = await getSiteProfile();
  const payload = buildKnowledgeMapPayload(taxonomy, { identity: { name: profile.name, handle: profile.handle } });
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
