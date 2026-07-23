CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS list_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id    INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  added_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (list_id, tmdb_id, media_type)
);

CREATE TABLE IF NOT EXISTS watched_movies (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id    INTEGER NOT NULL,
  watched_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tmdb_id)
);

CREATE TABLE IF NOT EXISTS watched_episodes (
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  show_id        INTEGER NOT NULL,
  season_number  INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  watched_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, show_id, season_number, episode_number)
);

CREATE TABLE IF NOT EXISTS ratings (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_id    INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
  rated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, tmdb_id, media_type)
);
