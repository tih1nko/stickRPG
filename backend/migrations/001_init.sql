-- Initial schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  coins INTEGER DEFAULT 0,
  equipped_item_id TEXT,
  updated_at INTEGER,
  last_active INTEGER,
  skin_tone TEXT DEFAULT 'light',
  hair_style TEXT DEFAULT 'short',
  hair_color TEXT DEFAULT '#35964A',
  eye_color TEXT DEFAULT '#3A7ACF',
  top_slot TEXT DEFAULT 'leaf',
  bottom_slot TEXT DEFAULT 'leaf',
  accessory_slot TEXT DEFAULT 'flower',
  stickman_anim TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  party_id TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  base_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  attack_bonus INTEGER DEFAULT 0,
  rarity TEXT,
  created_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_first_name ON users(first_name);
CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name);

CREATE TABLE IF NOT EXISTS party_invitations (
  id TEXT PRIMARY KEY,
  from_user_id TEXT,
  to_user_id TEXT,
  party_id TEXT,
  status TEXT,
  created_at INTEGER,
  notif_sent INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id TEXT,
  user_id TEXT,
  role TEXT,
  joined_at INTEGER,
  PRIMARY KEY (party_id, user_id)
);
