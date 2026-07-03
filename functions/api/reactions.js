import {
  REACTION_KEYS,
  applyReactionDelta,
  emptyReactionCounts,
  normalizePath,
  normalizeReaction,
  rowsToReactionCounts,
} from "./_reactions-core.mjs";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const tableSql = `
CREATE TABLE IF NOT EXISTS reactions (
  path TEXT NOT NULL,
  reaction TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (path, reaction)
);
`;

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: jsonHeaders });

const getDb = (env) => env.COMMENTS_DB;

const ensureSchema = async (db) => {
  await db.exec(tableSql);
};

const readCounts = async (db, path) => {
  const { results } = await db
    .prepare("SELECT reaction, count FROM reactions WHERE path = ?")
    .bind(path)
    .all();
  return rowsToReactionCounts(results || []);
};

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const path = normalizePath(url.searchParams.get("path"));
  if (!path) {
    return json({ error: "A valid path query parameter is required.", reactions: emptyReactionCounts() }, 400);
  }

  const db = getDb(env);
  if (!db) {
    return json({ reactions: emptyReactionCounts(), mode: "local", keys: REACTION_KEYS });
  }

  await ensureSchema(db);
  return json({ reactions: await readCounts(db, path), mode: "shared", keys: REACTION_KEYS });
}

export async function onRequestPost({ request, env }) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return json({ error: "JSON body is required.", reactions: emptyReactionCounts() }, 400);
  }

  const path = normalizePath(payload.path);
  const previousReaction = normalizeReaction(payload.previousReaction);
  const reaction = normalizeReaction(payload.reaction);
  if (!path || (!reaction && !previousReaction)) {
    return json({ error: "A valid path and reaction change are required.", reactions: emptyReactionCounts() }, 400);
  }

  const db = getDb(env);
  if (!db) {
    return json({
      reactions: applyReactionDelta(emptyReactionCounts(), previousReaction, reaction),
      mode: "local",
      keys: REACTION_KEYS,
    }, 202);
  }

  await ensureSchema(db);
  const now = new Date().toISOString();
  if (previousReaction && previousReaction !== reaction) {
    await db
      .prepare("UPDATE reactions SET count = MAX(count - 1, 0), updated_at = ? WHERE path = ? AND reaction = ?")
      .bind(now, path, previousReaction)
      .run();
  }
  if (reaction && previousReaction !== reaction) {
    await db
      .prepare(`
        INSERT INTO reactions (path, reaction, count, updated_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(path, reaction)
        DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
      `)
      .bind(path, reaction, now)
      .run();
  }

  const reactions = await readCounts(db, path);
  return json({ reactions, mode: "shared", keys: REACTION_KEYS });
}
