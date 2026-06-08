const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const tableSql = `
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_path_status_created
ON comments(path, status, created_at);
`;

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: jsonHeaders });

const normalizePath = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.length > 240 || trimmed.includes("..")) {
    return "";
  }
  return trimmed;
};

const normalizeText = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\r\n/g, "\n").slice(0, maxLength);
};

const getDb = (env) => env.COMMENTS_DB;

const ensureSchema = async (db) => {
  await db.exec(tableSql);
};

const verifyTurnstile = async (request, env, token) => {
  if (!env.TURNSTILE_SECRET_KEY) {
    return false;
  }

  const remoteip = request.headers.get("CF-Connecting-IP") || "";
  const formData = new FormData();
  formData.append("secret", env.TURNSTILE_SECRET_KEY);
  formData.append("response", token || "");
  if (remoteip) {
    formData.append("remoteip", remoteip);
  }
  formData.append("idempotency_key", crypto.randomUUID());

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });
  const result = await response.json().catch(() => ({ success: false }));
  return Boolean(result.success);
};

export async function onRequestGet({ request, env }) {
  const db = getDb(env);
  if (!db) {
    return json({ error: "COMMENTS_DB binding is not configured.", comments: [] }, 503);
  }

  const url = new URL(request.url);
  const path = normalizePath(url.searchParams.get("path"));
  if (!path) {
    return json({ error: "A valid path query parameter is required.", comments: [] }, 400);
  }

  await ensureSchema(db);
  const { results } = await db
    .prepare("SELECT id, author, body, created_at FROM comments WHERE path = ? AND status = 'approved' ORDER BY created_at ASC LIMIT 100")
    .bind(path)
    .all();

  return json({ comments: results || [] });
}

export async function onRequestPost({ request, env }) {
  const db = getDb(env);
  if (!db) {
    return json({ error: "COMMENTS_DB binding is not configured." }, 503);
  }

  const payload = await request.json().catch(() => null);
  if (!payload) {
    return json({ error: "JSON body is required." }, 400);
  }

  const path = normalizePath(payload.path);
  const author = normalizeText(payload.author, 40);
  const body = normalizeText(payload.body, 2000);
  if (!path || author.length < 1 || body.length < 2) {
    return json({ error: "Path, author, and comment body are required." }, 400);
  }

  const turnstileOk = await verifyTurnstile(request, env, payload.turnstileToken);
  if (!turnstileOk) {
    return json({ error: "Turnstile verification failed." }, 403);
  }

  await ensureSchema(db);
  const status = env.COMMENTS_AUTO_APPROVE === "true" ? "approved" : "pending";
  const comment = {
    id: crypto.randomUUID(),
    path,
    author,
    body,
    status,
    created_at: new Date().toISOString(),
  };

  await db
    .prepare("INSERT INTO comments (id, path, author, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(comment.id, comment.path, comment.author, comment.body, comment.status, comment.created_at)
    .run();

  return json({ status: comment.status, id: comment.id }, 201);
}
