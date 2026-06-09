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

CREATE TABLE IF NOT EXISTS reactions (
  path TEXT NOT NULL,
  reaction TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (path, reaction)
);
