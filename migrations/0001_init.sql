CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  status INTEGER NOT NULL DEFAULT 0,
  question TEXT,
  answer TEXT,
  reviews INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_items_user ON items(user_id, created_at DESC);
