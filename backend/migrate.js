const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_FILE || path.join(__dirname, 'db', 'game.sqlite3');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

// Журнал WAL для производительности и меньшей блокировки
try { db.pragma('journal_mode = WAL'); } catch {}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  equipped_item_id TEXT,
  updated_at INTEGER
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
`);

console.log('Migration complete. DB at', dbPath);
