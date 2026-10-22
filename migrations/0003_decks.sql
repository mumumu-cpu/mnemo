CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_decks_user ON decks(user_id, created_at);

-- NULL means the memo isn't in any file.
ALTER TABLE items ADD COLUMN deck_id TEXT;
CREATE INDEX idx_items_deck ON items(user_id, deck_id);
