// Resolves a Notion-uploaded media/file block to a fresh download URL at request
// time and redirects to it. This keeps heavy media (video, audio, attachments)
// hosted by Notion instead of being downloaded into the build, while avoiding
// Notion's ~1 hour signed-URL expiry by re-resolving on demand.
//
// A KV cache (binding MEDIA_CACHE) holds the resolved URL for a short TTL so the
// Notion API is queried at most once per media block per ~45 minutes, shared
// across all visitors. Requires the `NOTION_TOKEN` Pages secret. The build emits
// `/media/<block-id>` links via scripts/notion-content.mjs when NOTION_MEDIA_MODE=proxy.

const TTL_SECONDS = 2700; // 45 min, under Notion's ~1h signed-URL expiry

function redirect(url) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Cache-Control": `public, max-age=${TTL_SECONDS}`,
    },
  });
}

export async function onRequestGet(context) {
  const { params, env } = context;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  if (!id || !/^[0-9a-fA-F-]{32,36}$/.test(id)) {
    return new Response("Invalid media id.", { status: 400 });
  }

  const cacheKey = `media:${id}`;

  // 1. Serve from the KV cache when a fresh URL is still stored.
  if (env.MEDIA_CACHE) {
    const cached = await env.MEDIA_CACHE.get(cacheKey);
    if (cached) {
      return redirect(cached);
    }
  }

  // 2. Cache miss: resolve a fresh URL from Notion.
  if (!env.NOTION_TOKEN) {
    return new Response("NOTION_TOKEN is not configured for this Pages project.", {
      status: 500,
    });
  }

  let response;
  try {
    response = await fetch(`https://api.notion.com/v1/blocks/${id}`, {
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
      },
    });
  } catch {
    return new Response("Failed to reach Notion.", { status: 502 });
  }

  if (!response.ok) {
    return new Response("Notion block not found.", {
      status: response.status === 404 ? 404 : 502,
    });
  }

  const block = await response.json();
  const node = block && block.type ? block[block.type] : null;
  const url = node?.file?.url || node?.external?.url;
  if (!url) {
    return new Response("No media URL on this block.", { status: 404 });
  }

  // 3. Store the resolved URL for subsequent requests.
  if (env.MEDIA_CACHE) {
    context.waitUntil(env.MEDIA_CACHE.put(cacheKey, url, { expirationTtl: TTL_SECONDS }));
  }

  return redirect(url);
}
