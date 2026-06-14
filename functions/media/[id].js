// Resolves a Notion-uploaded media/file block to a fresh download URL at request
// time and redirects to it. This keeps heavy media (video, audio, attachments)
// hosted by Notion instead of being downloaded into the build, while avoiding
// Notion's ~1 hour signed-URL expiry by re-resolving on demand.
//
// Requires the `NOTION_TOKEN` environment variable on the Cloudflare Pages
// project (Production + Preview). The build emits `/media/<block-id>` links via
// scripts/notion-content.mjs when NOTION_MEDIA_MODE=proxy.

export async function onRequestGet(context) {
  const { params, env } = context;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  if (!env.NOTION_TOKEN) {
    return new Response("NOTION_TOKEN is not configured for this Pages project.", {
      status: 500,
    });
  }
  if (!id || !/^[0-9a-fA-F-]{32,36}$/.test(id)) {
    return new Response("Invalid media id.", { status: 400 });
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

  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      // Notion signed URLs last ~1 hour; cache the redirect for less than that.
      "Cache-Control": "public, max-age=2700",
    },
  });
}
