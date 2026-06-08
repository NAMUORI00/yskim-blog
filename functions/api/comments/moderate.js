const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: jsonHeaders });

const isAuthorized = (request, env) => {
  const expected = env.COMMENTS_ADMIN_TOKEN;
  const actual = request.headers.get("Authorization") || "";
  return Boolean(expected && actual === `Bearer ${expected}`);
};

export async function onRequestGet({ request, env }) {
  if (!isAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!env.COMMENTS_DB) {
    return json({ error: "COMMENTS_DB binding is not configured." }, 503);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";
  const { results } = await env.COMMENTS_DB
    .prepare("SELECT id, path, author, body, status, created_at FROM comments WHERE status = ? ORDER BY created_at DESC LIMIT 100")
    .bind(status)
    .all();

  return json({ comments: results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!isAuthorized(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!env.COMMENTS_DB) {
    return json({ error: "COMMENTS_DB binding is not configured." }, 503);
  }

  const payload = await request.json().catch(() => null);
  const id = typeof payload?.id === "string" ? payload.id : "";
  const action = payload?.action === "approve" ? "approved" : payload?.action === "reject" ? "rejected" : "";
  if (!id || !action) {
    return json({ error: "A valid id and action are required." }, 400);
  }

  await env.COMMENTS_DB
    .prepare("UPDATE comments SET status = ? WHERE id = ?")
    .bind(action, id)
    .run();

  return json({ status: action, id });
}
