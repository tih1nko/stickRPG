const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
// Явно грузим .env из папки backend, даже если процесс стартован из корня
require('dotenv').config({ path: path.join(__dirname, '.env') });
const crypto = require('crypto');
const fetch = global.fetch || require('node-fetch');
// Верификация initData из Telegram WebApp
// Документация: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
function verifyTelegramInitData(initData) {
  if (!process.env.BOT_TOKEN) return { ok: false, error: 'BOT_TOKEN not set' };
  if (!initData) return { ok: false, error: 'No initData' };
  // initData строка вида: key1=value1&key2=value2 ...
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  const dataCheckArr = [];
  for (const [k, v] of [...urlParams.entries()].sort()) {
    dataCheckArr.push(`${k}=${v}`);
  }
  const dataCheckString = dataCheckArr.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const calcHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (calcHash !== hash) return { ok: false, error: 'Invalid hash' };
  // Получаем user
  const userJson = urlParams.get('user');
  let user = null;
  try { user = JSON.parse(userJson); } catch {}
  if (!user || !user.id) return { ok: false, error: 'No user' };
  return { ok: true, user };
}

// Middleware: проверка подписи
function authMiddleware(req, res, next) {
  if (process.env.DEV_MODE === '1') {
    // Dev bypass: используем заголовок x-dev-user или fallback
    const devUser = req.headers['x-dev-user'] || 'dev-user';
    req.tgUser = { id: devUser };
    return next();
  }
  // Временный режим: разрешить dev fallback с GitHub Pages если явно включено
  if (process.env.GHPAGES_DEV_FALLBACK === '1') {
    const origin = req.headers.origin || '';
    if (/github\.io$/i.test(origin) && req.headers['x-dev-user']) {
      req.tgUser = { id: String(req.headers['x-dev-user']) };
      if (process.env.NODE_ENV !== 'production') console.warn('[AUTH] TEMP ghpages fallback x-dev-user=', req.tgUser.id);
      return next();
    }
  }
  const initData = req.headers['x-telegram-init'];
  if (!initData) {
    if (process.env.NODE_ENV !== 'production') console.warn('[AUTH] missing x-telegram-init');
    return res.status(401).json({ error: 'missing init data' });
  }
  const v = verifyTelegramInitData(initData);
  if (!v.ok) {
    if (process.env.NODE_ENV !== 'production') console.warn('[AUTH] invalid init data', v.error);
    return res.status(401).json({ error: v.error || 'invalid init data' });
  }
  req.tgUser = { id: String(v.user.id) };
  // сохраним объект для последующего возможного апдейта (в /auth делается основной апдейт)
  req.tgUserMeta = v.user;
  // Авто-гарантируем наличие пользователя и метаданных, чтобы он появлялся в поиске даже если фронт не вызывал /auth
  try {
    ensureUser(String(v.user.id));
    updateUserMeta(v.user);
    setTimeout(()=>{ flushInviteNotifications(String(v.user.id)); }, 10);
  } catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[AUTH autoEnsure] failed', e.message); }
  return next();
}

// Helper to extract user id from initData (for logging only)
function extractUserIdFromInit(initData) {
  try {
    if (!initData) return null;
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');
    if (!userJson) return null;
    const user = JSON.parse(userJson);
    return user.id ? String(user.id) : null;
  } catch (e) {
    return null;
  }
}

const app = express();
// CORS whitelist: env CORS_ORIGINS="https://tih1nko.github.io,https://tih1nko.github.io/stickRPG,https://localhost:3000"
// Если пусто -> allow any (dev). Поддерживаем ngrok и VS Code Dev Tunnels домены (localtunnel убран).
const rawOrigins = (process.env.CORS_ORIGINS || '').split(',').map(o=>o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    const devRelaxed = process.env.DEV_MODE === '1';
    if (devRelaxed) {
      // В dev разрешаем всё (origin может быть undefined для same-origin fetch)
      if (!origin) return cb(null, true);
      return cb(null, true);
    }
    if (!origin) return cb(null, true);
    // Явно разрешаем localhost / 127.0.0.1 всегда (удобство локальной разработки, даже если DEV_MODE не выставлен)
    if (/^https?:\/\/localhost:\d+$/i.test(origin) || /^https?:\/\/127\.0\.0\.1:\d+$/i.test(origin)) {
      return cb(null, true);
    }
    // Разрешаем GitHub Pages (для статики) — можно дополнительно ограничить через CORS_ORIGINS, но упростим
    if (/^https?:\/\/[^/]+\.github\.io$/i.test(origin)) {
      return cb(null, true);
    }
  // Поддержка доменов: ngrok, старый VS Code (dev.tunnels.api.visualstudio.com) и новый формат devtunnels.ms
  const autoTunnel = /\.ngrok-free\.app$|\.dev\.tunnels\.api\.visualstudio\.com$|\.devtunnels\.ms$/i.test(origin);
    if (rawOrigins.includes(origin) || autoTunnel) {
      return cb(null, true);
    }
    if (process.env.NODE_ENV !== 'production') console.warn('[CORS] blocked', origin);
    return cb(new Error('CORS blocked: ' + origin));
  },
  credentials: false,
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-telegram-init', 'x-dev-user', 'bypass-tunnel-reminder']
}));
// Дополнительный dev-мидлвар вставляющий ACAO для всех ответов (подстраховка, если preflight прошёл вне cors)
app.use((req,res,next)=>{
  const devRelaxed = process.env.DEV_MODE === '1';
  const origin = req.headers.origin;
  if (devRelaxed) {
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary','Origin');
    } else {
      res.header('Access-Control-Allow-Origin','*');
    }
    res.header('Access-Control-Allow-Headers','Content-Type, x-telegram-init, x-dev-user, bypass-tunnel-reminder');
    res.header('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  }
  next();
});
// Explicit OPTIONS fallback for any route (some proxies strip automatic handling)
app.use((req,res,next)=>{
  if (req.method === 'OPTIONS') {
  const origin = req.headers.origin;
  if (origin) { res.header('Access-Control-Allow-Origin', origin); res.header('Vary','Origin'); }
  else res.header('Access-Control-Allow-Origin','*');
    res.header('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    // Используем запрошенные заголовки если браузер прислал их
    const reqHeaders = req.headers['access-control-request-headers'];
    res.header('Access-Control-Allow-Headers', reqHeaders || 'Content-Type, x-telegram-init, x-dev-user, bypass-tunnel-reminder');
    res.header('Access-Control-Max-Age','600');
    return res.sendStatus(204);
  }
  next();
});
// Универсально добавляем ACAO для обычных ответов (если CORS пропустил)
app.use((req,res,next)=>{
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary','Origin');
  }
  next();
});
app.use(express.json());
app.use((req, res, next) => {
  if (req.headers['x-telegram-init']) {
    req.telegramUserId = extractUserIdFromInit(req.headers['x-telegram-init']);
  }
  next();
});

const dbPath = process.env.DB_FILE || path.join(__dirname, 'db', 'game.sqlite3');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
try { db.pragma('journal_mode = WAL'); } catch {}

// Инициализация схемы (создание таблиц, если их нет)
function initSchema() {
  try {
    // Таблица users
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
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
      stickman_anim TEXT
    )`).run();
    // Таблица items
    db.prepare(`CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      base_id TEXT,
      name TEXT,
      type TEXT,
      attack_bonus INTEGER,
      rarity TEXT,
      created_at INTEGER
    )`).run();
    // Индекс по user_id для быстрого выборочного удаления/загрузки
    db.prepare('CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id)').run();
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') console.warn('[SCHEMA INIT] failed', e.message);
  }
}

initSchema();

// Ленивая миграция: добавляем недостающие столбцы
try {
  const pragma = db.prepare("PRAGMA table_info('users')").all();
  const cols = pragma.map(c => c.name);
  if (!cols.includes('last_active')) {
    db.prepare('ALTER TABLE users ADD COLUMN last_active INTEGER').run();
  }
  const addCol = (name, type, def = null) => {
    if (!cols.includes(name)) {
      db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${type}${def!==null?` DEFAULT '${def}'`:''}`).run();
    }
  };
  addCol('skin_tone','TEXT','light');
  addCol('hair_style','TEXT','short');
  addCol('hair_color','TEXT','#35964A');
  addCol('eye_color','TEXT','#3A7ACF');
  addCol('top_slot','TEXT','leaf');
  addCol('bottom_slot','TEXT','leaf');
  addCol('accessory_slot','TEXT','flower');
  addCol('stickman_anim','TEXT'); // JSON с анимациями (walk/attack)
  addCol('coins','INTEGER',0); // внутренняя валюта
  addCol('username','TEXT');
  addCol('first_name','TEXT');
  addCol('last_name','TEXT');
  addCol('party_id','TEXT');
} catch (e) {
  if (process.env.NODE_ENV !== 'production') console.warn('User table alter failed (maybe not created yet).', e.message);
}

// Party tables (idempotent creation)
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS party_invitations (
    id TEXT PRIMARY KEY,
    from_user_id TEXT,
    to_user_id TEXT,
    party_id TEXT,
    status TEXT,
    created_at INTEGER
  )`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS party_members (
    party_id TEXT,
    user_id TEXT,
    role TEXT,
    joined_at INTEGER,
    PRIMARY KEY (party_id, user_id)
  )`).run();
} catch(e) {
  if (process.env.NODE_ENV !== 'production') console.warn('[SCHEMA party] failed', e.message);
}
// Adventure request table
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS party_adventure_requests (
    party_id TEXT PRIMARY KEY,
    requester_id TEXT,
    created_at INTEGER,
  status TEXT,
  decliner_id TEXT,
    accepted_ids TEXT,
    mob_name TEXT,
    mob_hp INTEGER,
    mob_max INTEGER,
    mob_color TEXT,
    mob_xp INTEGER
  )`).run();
} catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[SCHEMA party_adventure] failed', e.message); }
// MIGRATE add accepted_ids if missing (for existing installations prior to column addition)
try {
  const advCols = db.prepare("PRAGMA table_info('party_adventure_requests')").all().map(c=>c.name);
  if (!advCols.includes('accepted_ids')) {
    db.prepare('ALTER TABLE party_adventure_requests ADD COLUMN accepted_ids TEXT').run();
    if (process.env.NODE_ENV !== 'production') console.log('[MIGRATE] party_adventure_requests +accepted_ids');
  }
  const addAdvCol = (name,type) => { if(!advCols.includes(name)) { try { db.prepare(`ALTER TABLE party_adventure_requests ADD COLUMN ${name} ${type}`).run(); if (process.env.NODE_ENV !== 'production') console.log('[MIGRATE] party_adventure_requests +'+name); } catch(e){} } };
  addAdvCol('mob_name','TEXT');
  addAdvCol('mob_hp','INTEGER');
  addAdvCol('mob_max','INTEGER');
  addAdvCol('mob_color','TEXT');
  addAdvCol('mob_xp','INTEGER');
  addAdvCol('mob_damage','TEXT'); // JSON { userId: damage }
  addAdvCol('mob_awarded','INTEGER'); // flag to avoid double-award
} catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[MIGRATE accepted_ids] failed', e.message); }
// MIGRATE notif_sent
try {
  const invCols = db.prepare("PRAGMA table_info('party_invitations')").all().map(c=>c.name);
  if (!invCols.includes('notif_sent')) {
    db.prepare('ALTER TABLE party_invitations ADD COLUMN notif_sent INTEGER DEFAULT 0').run();
    if (process.env.NODE_ENV !== 'production') console.log('[MIGRATE] party_invitations +notif_sent');
  }
} catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[MIGRATE notif_sent] failed', e.message); }

// Индексы для ускорения поиска пользователей по имени / username (ленивая проверка)
try {
  db.prepare('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  db.prepare('CREATE INDEX IF NOT EXISTS idx_users_first_name ON users(first_name)');
  db.prepare('CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name)');
} catch(e) { if (process.env.NODE_ENV !== 'production') console.warn('[SCHEMA index] create failed', e.message); }
// Выполним .run() (в случае если ранее забыли) — индексы создадутся один раз
try {
  db.prepare('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_users_first_name ON users(first_name)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_users_last_name ON users(last_name)').run();
} catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[SCHEMA index run] failed', e.message); }

function updateUserMeta(user){
  if(!user || !user.id) return;
  try {
    db.prepare('UPDATE users SET username=COALESCE(?,username), first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name) WHERE id=?')
      .run(user.username || null, user.first_name || null, user.last_name || null, String(user.id));
  } catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[USER META] update failed', e.message); }
}

function validatePayload(body) {
  if (!body || typeof body !== 'object') return 'Empty body';
  if (!body.userId) return 'Missing userId';
  if (body.data == null) return 'Missing data';
  return null;
}

function ensureUser(userId) {
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!row) {
  const now = Date.now();
  // В исходной версии здесь было 6 плейсхолдеров и 3 переданных параметра => ошибка "bindings count" и создание пользователя падало.
  // Оставляем только необходимые динамические поля (id, updated_at, last_active); остальные — фиксированные дефолты.
  db.prepare(`INSERT INTO users(id, level, xp, updated_at, last_active, skin_tone, hair_style, hair_color, eye_color, top_slot, bottom_slot, accessory_slot)
        VALUES(?,1,0,?,?,'light','short','#35964A','#3A7ACF','leaf','leaf','flower')`).run(userId, now, now);
  }
}

function saveState(userId, data) {
  ensureUser(userId);
  const { level = 1, xp = 0, coins = 0, equipped, inventory = [], customization = {}, animations = null } = data;
  const equipped_item_id = equipped?.id || null;
  const nowTs = Date.now();
  // Гарантируем наличие столбца stickman_anim (если база старая и ленивая миграция не прошла при старте)
  try {
    const info = db.prepare("PRAGMA table_info('users')").all();
    if (!info.some(c => c.name === 'stickman_anim')) {
  if (process.env.NODE_ENV !== 'production') console.warn('[MIGRATE] add stickman_anim');
      db.prepare('ALTER TABLE users ADD COLUMN stickman_anim TEXT').run();
    }
  } catch (e) {
  if (process.env.NODE_ENV !== 'production') console.warn('stickman_anim check/add failed', e.message);
  }
  // Логируем размеры анимационных данных (для отладки сохранения)
  if (animations) {
    try {
      const walkFrames = Array.isArray(animations.walk)? animations.walk.length : 0;
      const attackFrames = Array.isArray(animations.attack)? animations.attack.length : 0;
      const attachCount = Array.isArray(animations.attachments)? animations.attachments.length : 0;
      const jsonStr = JSON.stringify(animations);
  if (process.env.NODE_ENV !== 'production') console.log(`[SAVE] u=${userId} walk=${walkFrames} attack=${attackFrames} att=${attachCount} bytes=${jsonStr.length}`);
    } catch {}
  } else {
  if (process.env.NODE_ENV !== 'production') console.log(`[SAVE] u=${userId} anim=null`);
  }
  db.prepare(`UPDATE users SET level=?, xp=?, coins=?, equipped_item_id=?, updated_at=?, last_active=?,
    skin_tone=?, hair_style=?, hair_color=?, eye_color=?, top_slot=?, bottom_slot=?, accessory_slot=?, stickman_anim=?
    WHERE id=?`)
    .run(level, xp, coins, equipped_item_id, nowTs, nowTs,
      customization.skinTone || 'light',
      customization.hairStyle || 'short',
      customization.hairColor || '#35964A',
      customization.eyeColor || '#3A7ACF',
      customization.top || 'leaf',
      customization.bottom || 'leaf',
      customization.accessory || 'flower',
      animations ? JSON.stringify(animations) : null,
      userId);
  // Верификация записи (diagnostic)
  try {
    const row = db.prepare('SELECT length(stickman_anim) as len FROM users WHERE id=?').get(userId);
  if (process.env.NODE_ENV !== 'production') console.log(`[SAVE-VERIFY] u=${userId} len=${row?row.len:null}`);
  } catch (e) {
  if (process.env.NODE_ENV !== 'production') console.warn('[SAVE-VERIFY] readback failed', e.message);
  }
  // упрощённо: удаляем и вставляем заново предметы пользователя
  const del = db.prepare('DELETE FROM items WHERE user_id = ?');
  del.run(userId);
  const ins = db.prepare('INSERT INTO items(id, user_id, base_id, name, type, attack_bonus, rarity, created_at) VALUES(?,?,?,?,?,?,?,?)');
  const now = Date.now();
  // Защита от дубликатов id в массиве inventory (иначе UNIQUE constraint на items.id)
  const seenIds = new Set();
  for (const it of inventory) {
    if (!it || !it.id) continue;
    if (seenIds.has(it.id)) {
      if (process.env.NODE_ENV !== 'production') console.warn('[SAVE] duplicate item id skipped', userId, it.id);
      continue; // пропускаем повтор
    }
    seenIds.add(it.id);
    try {
      ins.run(it.id, userId, it.id.split('_')[0], it.name, it.type, it.attackBonus, it.rarity, now);
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.warn('[SAVE] insert item failed', it.id, e.message);
    }
  }
}

function loadState(userId) {
  ensureUser(userId);
  const u = db.prepare(`SELECT id, level, xp, coins, equipped_item_id, last_active, updated_at,
    skin_tone, hair_style, hair_color, eye_color, top_slot, bottom_slot, accessory_slot, stickman_anim
    FROM users WHERE id = ?`).get(userId);
  const itemsRaw = db.prepare('SELECT id, base_id, name, type, attack_bonus as attackBonus, rarity FROM items WHERE user_id = ?').all(userId);
  const priceFor = (it) => {
    const base = 10 + (it.attackBonus || 0) * 5;
    const mult = it.rarity === 'rare' ? 4 : it.rarity === 'uncommon' ? 2 : 1;
    return Math.max(1, Math.round(base * mult));
  };
  const items = itemsRaw.map(it => ({ ...it, sellPrice: priceFor(it) }));
  const equipped = items.find(i => i.id === u.equipped_item_id) || null;
  const customization = {
    skinTone: u.skin_tone,
    hairStyle: u.hair_style,
    hairColor: u.hair_color,
    eyeColor: u.eye_color,
    top: u.top_slot,
    bottom: u.bottom_slot,
    accessory: u.accessory_slot,
  };
  let animations = null;
  if (u.stickman_anim) {
    try { animations = JSON.parse(u.stickman_anim); } catch {}
  }
  if (animations) {
    try {
      const walkFrames = Array.isArray(animations.walk)? animations.walk.length : 0;
      const attackFrames = Array.isArray(animations.attack)? animations.attack.length : 0;
      const attachCount = Array.isArray(animations.attachments)? animations.attachments.length : 0;
  const jsonStr = JSON.stringify(animations);
  if (process.env.NODE_ENV !== 'production') console.log(`[LOAD] u=${userId} w=${walkFrames} a=${attackFrames} att=${attachCount} bytes=${jsonStr.length}`);
    } catch {}
  } else {
  if (process.env.NODE_ENV !== 'production') console.log(`[LOAD] u=${userId} anim=null`);
  }
  return { level: u.level, xp: u.xp, coins: u.coins || 0, equipped, inventory: items, customization, animations, last_active: u.last_active, updated_at: u.updated_at };
}

// Пул предметов для серверного оффлайн дропа (синхрон с фронтом)
const ITEM_POOL = [
  { id: 'sword', name: 'Меч', type: 'weapon', attackBonus: 1, rarity: 'common' },
  { id: 'sabre', name: 'Сабля', type: 'weapon', attackBonus: 2, rarity: 'uncommon' },
  { id: 'axe', name: 'Топор', type: 'weapon', attackBonus: 3, rarity: 'rare' },
  { id: 'bow', name: 'Лук', type: 'weapon', attackBonus: 2, rarity: 'uncommon' },
  { id: 'dagger', name: 'Кинжал', type: 'weapon', attackBonus: 1, rarity: 'common' },
  { id: 'shield', name: 'Щит', type: 'shield', attackBonus: 0, rarity: 'uncommon' },
];

function rollDrop() {
  const weighted = ITEM_POOL.map(it => ({
    item: it,
    w: it.rarity === 'common' ? 60 : it.rarity === 'uncommon' ? 30 : 10,
  }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const rec of weighted) {
    if (r < rec.w) return rec.item;
    r -= rec.w;
  }
  return null;
}

function applyIdleRewards(userId, state) {
  const now = Date.now();
  const lastActive = state.last_active || state.updated_at || now;
  const elapsedMs = now - lastActive;
  const minThreshold = 60 * 1000; // не выдаём если меньше минуты
  if (elapsedMs < minThreshold) return null;
  const capMs = 3 * 60 * 60 * 1000; // кап: 3 часа
  const effectiveMs = Math.min(elapsedMs, capMs);
  // модель: один бой каждые 8 секунд
  const fights = Math.floor(effectiveMs / 8000);
  if (fights <= 0) return null;
  let gainedXp = 0;
  const newItems = [];
  for (let i = 0; i < fights; i++) {
    // xp от 5 до 12
    gainedXp += 5 + Math.floor(Math.random() * 8);
    if (Math.random() < 0.18) { // 18% шанс дропа в оффлайне
      const base = rollDrop();
      if (base) {
        const countSame = state.inventory.filter(it => it.id.startsWith(base.id)).length + newItems.filter(it => it.id.startsWith(base.id)).length;
        newItems.push({
          id: base.id + '_' + (countSame + 1),
          base_id: base.id,
          name: base.name,
          type: base.type,
          attackBonus: base.attackBonus,
          rarity: base.rarity
        });
      }
    }
  }
  // Применяем к состоянию
  let level = state.level;
  let xp = state.xp + gainedXp;
  const xpForLevel = (lvl) => 50 + (lvl - 1) * 60;
  let leveled = 0;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level += 1;
    leveled++;
  }
  const mergedInventory = [...state.inventory, ...newItems];
  // Сохраняем
  saveState(userId, { level, xp, coins: state.coins || 0, equipped: state.equipped, inventory: mergedInventory, customization: state.customization || {}, animations: state.animations || null });
  return {
    elapsedMs,
    fights,
    gainedXp,
    leveled,
    items: newItems.map(i => ({ id: i.id, name: i.name, rarity: i.rarity, attackBonus: i.attackBonus }))
  };
}

// --- Продажа предметов ---
function computeItemPrice(it) {
  if (!it) return 0;
  const base = 10 + (it.attack_bonus || it.attackBonus || 0) * 5;
  const mult = it.rarity === 'rare' ? 4 : it.rarity === 'uncommon' ? 2 : 1;
  return Math.max(1, Math.round(base * mult));
}

app.post('/sell', authMiddleware, (req, res) => {
  const { userId, itemId } = req.body || {};
  if (!userId || !itemId) return res.status(400).json({ success:false, error:'bad_request' });
  if (String(req.tgUser.id) !== String(userId)) return res.status(403).json({ success:false, error:'user_mismatch'});
  try {
    ensureUser(userId);
    const user = db.prepare('SELECT equipped_item_id, coins, stickman_anim FROM users WHERE id=?').get(userId);
    if (!user) return res.status(404).json({ success:false, error:'user_not_found' });
    if (user.equipped_item_id === itemId) return res.status(409).json({ success:false, error:'equipped_cannot_sell' });
    // Проверка json анимаций на наличие привязки (attachments)
    if (user.stickman_anim) {
      try {
        const anim = JSON.parse(user.stickman_anim);
        if (Array.isArray(anim.attachments) && anim.attachments.some(a => a.itemId === itemId)) {
          return res.status(409).json({ success:false, error:'attached_cannot_sell' });
        }
      } catch {}
    }
    const it = db.prepare('SELECT id, name, type, attack_bonus, rarity FROM items WHERE user_id=? AND id=?').get(userId, itemId);
    if (!it) return res.status(404).json({ success:false, error:'item_not_found' });
    const price = computeItemPrice(it);
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM items WHERE user_id=? AND id=?').run(userId, itemId);
      db.prepare('UPDATE users SET coins = COALESCE(coins,0) + ?, updated_at=?, last_active=? WHERE id=?')
        .run(price, Date.now(), Date.now(), userId);
      const nu = db.prepare('SELECT coins FROM users WHERE id=?').get(userId);
      return nu.coins;
    });
    const newCoins = tx();
    res.json({ success:true, coins:newCoins, price, removed:itemId });
  } catch (e) {
    console.error('Sell failed', e);
    res.status(500).json({ success:false, error:'sell_failed' });
  }
});

app.post('/save', authMiddleware, (req, res) => {
  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ success: false, error });
  const { userId, data } = req.body;
  if (String(req.tgUser.id) !== String(userId)) return res.status(403).json({ success:false, error:'user_mismatch'});
  try {
    saveState(userId, data);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'save_failed' });
  }
});

// Частичное обновление (merge)
app.post('/merge-save', authMiddleware, (req, res) => {
  const error = validatePayload(req.body);
  if (error) return res.status(400).json({ success: false, error });
  const { userId, data } = req.body;
  if (String(req.tgUser.id) !== String(userId)) return res.status(403).json({ success:false, error:'user_mismatch'});
  try {
    const current = loadState(userId);
    const merged = { ...current, ...data };
    saveState(userId, merged);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'merge_failed' });
  }
});

app.get('/load/:userId', authMiddleware, (req, res) => {
  const userId = req.params.userId;
  if (String(req.tgUser.id) !== String(userId)) return res.status(403).json({ success:false, error:'user_mismatch'});
  try {
  const state = loadState(userId);
  const idle = applyIdleRewards(userId, state);
  const fresh = idle ? loadState(userId) : state; // перезагрузим если модифицировано
  res.json({ data: fresh, success: true, idle });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: 'load_failed' });
  }
});

app.post('/auth', (req, res) => {
  const { initData } = req.body || {};
  const v = verifyTelegramInitData(initData);
  if (!v.ok) return res.status(401).json({ success: false, error: v.error });
  // Гарантируем запись пользователя перед апдейтом метаданных (иначе он не появится в поиске)
  try { ensureUser(String(v.user.id)); } catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[AUTH ensureUser] failed', e.message); }
  updateUserMeta(v.user);
  if (process.env.NODE_ENV !== 'production') console.log('[AUTH] user', v.user.id, v.user.username, 'ok');
  res.json({ success: true, user: v.user });
});

app.get('/ping', (_req, res) => res.json({ pong: true, time: Date.now() }));

// ================= PARTY API =================
function getOrCreatePartyForLeader(leaderId){
  // В SQLite двойные кавычки трактуются как идентификатор, поэтому было no such column: leader
  const ex = db.prepare("SELECT party_id FROM party_members WHERE user_id=? AND role='leader'").get(leaderId);
  if (ex && ex.party_id) return ex.party_id;
  const partyId = 'p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  db.prepare('INSERT OR IGNORE INTO party_members(party_id,user_id,role,joined_at) VALUES(?,?,?,?)')
    .run(partyId, leaderId, 'leader', Date.now());
  db.prepare('UPDATE users SET party_id=? WHERE id=?').run(partyId, leaderId);
  return partyId;
}

// Отправка уведомления в Telegram (если у бота есть токен и пользователь уже взаимодействовал с ботом)
async function sendBotMessage(userId, text){
  if (!process.env.BOT_TOKEN) return false;
  if (process.env.ENABLE_TG_NOTIF === '0') return false; // явное выключение
  const chatId = userId; // для WebApp user.id == chat.id (если user начинал бота)
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`;
  const body = { chat_id: chatId, text, disable_notification: false };
  try {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const j = await r.json();
    if(!j.ok){ if (process.env.NODE_ENV !== 'production') console.warn('[TG NOTIF] send failed', j); return false; }
    if (process.env.NODE_ENV !== 'production') console.log('[TG NOTIF] sent to', userId);
    return true;
  } catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[TG NOTIF] error', e.message); return false; }
}

// flush invite notifications
async function flushInviteNotifications(userId){
  try {
  const rows = db.prepare("SELECT id, from_user_id FROM party_invitations WHERE to_user_id=? AND status='pending' AND COALESCE(notif_sent,0)=0 LIMIT 15").all(userId);
    if (!rows.length) return;
    if (process.env.NODE_ENV !== 'production') console.log('[FLUSH INVITES] user', userId, 'count', rows.length);
    for (const r of rows) {
      try {
        const fromMeta = db.prepare('SELECT username, first_name FROM users WHERE id=?').get(r.from_user_id) || {};
        const label = fromMeta.username ? '@'+fromMeta.username : (fromMeta.first_name||'Игрок');
        const sent = await sendBotMessage(userId, `${label} приглашает вас в группу (party). Откройте WebApp, чтобы принять.`);
        if (sent) db.prepare('UPDATE party_invitations SET notif_sent=1 WHERE id=?').run(r.id);
      } catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[FLUSH INVITES] one failed', e.message); }
    }
  } catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[FLUSH INVITES] failed', e.message); }
}

// Search users by username prefix (case-insensitive)
app.get('/party/search', authMiddleware, (req,res)=>{
  const q = (req.query.q||'').toString().trim();
  if(!q) return res.json({ success:true, results: [] });
  try {
    // Поддержка символа * для списка (покажем свежих пользователей)
    if(q === '*') {
      const rowsAll = db.prepare(`SELECT id, username, first_name, last_name FROM users
        ORDER BY updated_at DESC LIMIT 30`).all();
      return res.json({ success:true, results: rowsAll });
    }
    // Экранируем спецсимволы LIKE
    const esc = (s)=> s.replace(/[\\%_]/g, m=> '\\'+m);
    const norm = q.startsWith('@') ? q.slice(1) : q; // разрешим ввод с @
    const base = esc(norm);
    const like = `%${base}%`;
    const rows = db.prepare(`SELECT id, username, first_name, last_name, updated_at FROM users
      WHERE (
        (username IS NOT NULL AND username LIKE ? ESCAPE '\\' COLLATE NOCASE) OR
        (first_name IS NOT NULL AND first_name LIKE ? ESCAPE '\\' COLLATE NOCASE) OR
        (last_name IS NOT NULL AND last_name LIKE ? ESCAPE '\\' COLLATE NOCASE)
      )
      ORDER BY updated_at DESC LIMIT 30`).all(like, like, like);
    if (process.env.NODE_ENV !== 'production') console.log('[PARTY SEARCH] q="'+q+'" rows='+rows.length);
    res.json({ success:true, results: rows });
  } catch(e){ res.status(500).json({ success:false, error:'search_failed' }); }
});

// DEBUG: список первых N пользователей
app.get('/debug/users', (req,res)=>{
  try {
    const rows = db.prepare('SELECT id, username, first_name, last_name, updated_at FROM users ORDER BY updated_at DESC LIMIT 100').all();
    res.json({ success:true, users: rows });
  } catch(e){ res.status(500).json({ success:false, error:'debug_users_failed' }); }
});

// Invite
app.post('/party/invite', authMiddleware, (req,res)=>{
  const startedAt = Date.now();
  let { username } = req.body || {};
  if(!username){
    if (process.env.NODE_ENV !== 'production') console.warn('[INVITE] reject missing_username from', req.tgUser.id);
    return res.status(400).json({ success:false, error:'missing_username' });
  }
  if (username.startsWith('@')) username = username.slice(1);
  username = username.trim();
  if (!username){
    if (process.env.NODE_ENV !== 'production') console.warn('[INVITE] reject empty_after_trim from', req.tgUser.id);
    return res.status(400).json({ success:false, error:'missing_username' });
  }
  let partyId = null;
  try {
    const target = db.prepare('SELECT id FROM users WHERE lower(username)=lower(?)').get(username);
    if(!target){
      if (process.env.NODE_ENV !== 'production') console.warn('[INVITE] user_not_found', username, 'from', req.tgUser.id);
      return res.status(404).json({ success:false, error:'user_not_found' });
    }
    if(String(target.id) === String(req.tgUser.id)){
      if (process.env.NODE_ENV !== 'production') console.warn('[INVITE] self_invite attempt', req.tgUser.id);
      return res.status(400).json({ success:false, error:'self_invite' });
    }
    partyId = getOrCreatePartyForLeader(req.tgUser.id);
    const dupe = db.prepare("SELECT id FROM party_invitations WHERE from_user_id=? AND to_user_id=? AND party_id=? AND status='pending'")
      .get(req.tgUser.id, target.id, partyId);
    if(dupe){
      if (process.env.NODE_ENV !== 'production') console.log('[INVITE] duplicate', dupe.id, 'party', partyId, 'from', req.tgUser.id, 'to', target.id);
      return res.json({ success:true, invitationId: dupe.id, duplicate:true, partyId });
    }
    const invId = 'inv_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    try {
      db.prepare('INSERT INTO party_invitations(id,from_user_id,to_user_id,party_id,status,created_at) VALUES(?,?,?,?,?,?)')
        .run(invId, req.tgUser.id, target.id, partyId, 'pending', Date.now());
    } catch(dbErr){
      if (process.env.NODE_ENV !== 'production') console.error('[INVITE ERROR] insert_failed', dbErr.message);
      return res.status(500).json({ success:false, error:'db_insert_failed' });
    }
    if (process.env.NODE_ENV !== 'production') console.log('[INVITE] created inv', invId, 'party', partyId, 'from', req.tgUser.id, 'to', target.id);
    (async()=>{
      try {
        const fromMeta = db.prepare('SELECT username, first_name FROM users WHERE id=?').get(req.tgUser.id) || {};
        const label = fromMeta.username ? '@'+fromMeta.username : (fromMeta.first_name||'Игрок');
        const sent = await sendBotMessage(target.id, `${label} приглашает вас в группу (party). Откройте WebApp, чтобы принять.`);
        if (sent) { try { db.prepare('UPDATE party_invitations SET notif_sent=1 WHERE id=?').run(invId); } catch(errUpd){ if (process.env.NODE_ENV !== 'production') console.warn('[INVITE NOTIF] flag update failed', errUpd.message); } }
        else if (process.env.NODE_ENV !== 'production') console.warn('[INVITE NOTIF] not sent (user maybe not started bot)');
      } catch(e){ if (process.env.NODE_ENV !== 'production') console.warn('[INVITE NOTIF] failed', e.message); }
    })();
    const took = Date.now() - startedAt;
    res.json({ success:true, invitationId: invId, partyId, notif:true, tookMs:took });
  } catch(e){
    if (process.env.NODE_ENV !== 'production') console.error('[INVITE ERROR] unexpected', { from:req.tgUser.id, usernameAttempt:username, partyIdAttempt:partyId, msg:e.message });
    res.status(500).json({ success:false, error:'invite_failed' });
  }
});

// Incoming invitations
app.get('/party/invitations', authMiddleware, (req,res)=>{
  try {
  const rows = db.prepare("SELECT id, from_user_id, party_id, created_at FROM party_invitations WHERE to_user_id=? AND status='pending' ORDER BY created_at DESC")
      .all(req.tgUser.id);
    const enriched = rows.map(r=>{
      const u = db.prepare('SELECT username, first_name, last_name FROM users WHERE id=?').get(r.from_user_id) || {};
      return { ...r, from: { id:r.from_user_id, username:u.username, first_name:u.first_name, last_name:u.last_name } };
    });
    res.json({ success:true, invitations: enriched });
  } catch(e){ res.status(500).json({ success:false, error:'list_failed' }); }
});

// Accept invitation
app.post('/party/accept', authMiddleware, (req,res)=>{
  const { invitationId } = req.body || {};
  if(!invitationId) return res.status(400).json({ success:false, error:'missing_invitationId' });
  try {
    const inv = db.prepare('SELECT * FROM party_invitations WHERE id=?').get(invitationId);
    if(!inv || inv.to_user_id !== String(req.tgUser.id) || inv.status !== 'pending') return res.status(404).json({ success:false, error:'invitation_not_found' });
    db.transaction(()=>{
      // Одинарные кавычки для строкового литерала в SQLite
      db.prepare("UPDATE party_invitations SET status='accepted' WHERE id=?").run(invitationId);
      db.prepare('INSERT OR IGNORE INTO party_members(party_id,user_id,role,joined_at) VALUES(?,?,?,?)')
        .run(inv.party_id, req.tgUser.id, 'member', Date.now());
      db.prepare('UPDATE users SET party_id=? WHERE id=?').run(inv.party_id, req.tgUser.id);
    })();
    res.json({ success:true, partyId: inv.party_id });
  } catch(e){ res.status(500).json({ success:false, error:'accept_failed' }); }
});

// Decline
app.post('/party/decline', authMiddleware, (req,res)=>{
  const { invitationId } = req.body || {};
  if(!invitationId) return res.status(400).json({ success:false, error:'missing_invitationId' });
  try {
    const inv = db.prepare('SELECT * FROM party_invitations WHERE id=?').get(invitationId);
    if(!inv || inv.to_user_id !== String(req.tgUser.id) || inv.status !== 'pending') return res.status(404).json({ success:false, error:'invitation_not_found' });
    db.prepare("UPDATE party_invitations SET status='declined' WHERE id=?").run(invitationId);
    res.json({ success:true });
  } catch(e){ res.status(500).json({ success:false, error:'decline_failed' }); }
});

// Outgoing (sent) invitations
app.get('/party/sent', authMiddleware, (req,res)=>{
  try {
    const rows = db.prepare("SELECT id, to_user_id, party_id, status, created_at FROM party_invitations WHERE from_user_id=? AND status='pending' ORDER BY created_at DESC")
      .all(req.tgUser.id);
    const enriched = rows.map(r=>{
      const u = db.prepare('SELECT username, first_name, last_name FROM users WHERE id=?').get(r.to_user_id) || {};
      return { ...r, to: { id:r.to_user_id, username:u.username, first_name:u.first_name, last_name:u.last_name } };
    });
    res.json({ success:true, invitations: enriched });
  } catch(e){ res.status(500).json({ success:false, error:'sent_list_failed' }); }
});

// Party state
app.get('/party/state', authMiddleware, (req,res)=>{
  try {
    const row = db.prepare('SELECT party_id FROM users WHERE id=?').get(req.tgUser.id);
    if(!row || !row.party_id) return res.json({ success:true, party:null });
    const partyId = row.party_id;
    const members = db.prepare('SELECT pm.user_id, pm.role, u.username, u.first_name, u.last_name, u.stickman_anim, u.skin_tone, u.hair_style, u.hair_color, u.eye_color, u.top_slot, u.bottom_slot, u.accessory_slot FROM party_members pm JOIN users u ON u.id=pm.user_id WHERE pm.party_id=?')
      .all(partyId);
    const formatted = members.map(m=>{
      let anim=null; try{ if(m.stickman_anim) anim=JSON.parse(m.stickman_anim);}catch{}
      return {
        id: m.user_id,
        role: m.role,
        username: m.username,
        first_name: m.first_name,
        last_name: m.last_name,
        customization: { skinTone:m.skin_tone, hairStyle:m.hair_style, hairColor:m.hair_color, eyeColor:m.eye_color, top:m.top_slot, bottom:m.bottom_slot, accessory:m.accessory_slot },
        animations: anim
      };
    });
    res.json({ success:true, party:{ partyId, members: formatted } });
  } catch(e){ res.status(500).json({ success:false, error:'party_state_failed' }); }
});

// Leave party
app.post('/party/leave', authMiddleware, (req,res)=>{
  try {
    const row = db.prepare('SELECT party_id FROM users WHERE id=?').get(req.tgUser.id);
    if(!row || !row.party_id) return res.json({ success:true, left:false });
    const partyId = row.party_id;
    const members = db.prepare('SELECT user_id, role FROM party_members WHERE party_id=?').all(partyId);
    const me = members.find(m=> m.user_id === String(req.tgUser.id));
    if(!me) return res.json({ success:true, left:false });
    // remove member
    const tx = db.transaction(()=>{
      db.prepare('DELETE FROM party_members WHERE party_id=? AND user_id=?').run(partyId, req.tgUser.id);
      db.prepare('UPDATE users SET party_id=NULL WHERE id=?').run(req.tgUser.id);
      if(me.role === 'leader') {
        const rest = members.filter(m=> m.user_id !== String(req.tgUser.id));
        if(rest.length === 0) {
          // disband: clear party_id for safety already done for leaving member; others none
        } else {
          // promote first
          db.prepare("UPDATE party_members SET role='leader' WHERE party_id=? AND user_id=?").run(partyId, rest[0].user_id);
        }
      }
  // Cancel any active/pending adventure if ANY member leaves (групповой поход прерывается)
  try { db.prepare('DELETE FROM party_adventure_requests WHERE party_id=?').run(partyId); } catch {}
    });
    tx();
    res.json({ success:true, left:true });
  } catch(e){ res.status(500).json({ success:false, error:'leave_failed' }); }
});

// Adventure: request start (initiator automatically enters adventure; others see prompt)
app.post('/party/adventure/request', authMiddleware, (req,res)=>{
  try {
    const row = db.prepare('SELECT party_id FROM users WHERE id=?').get(req.tgUser.id);
    if(!row || !row.party_id) return res.status(400).json({ success:false, error:'no_party' });
    const partyId = row.party_id;
  // Проверяем что инициатор лидер
  const mem = db.prepare("SELECT role FROM party_members WHERE party_id=? AND user_id=?").get(partyId, req.tgUser.id);
  if(!mem || mem.role !== 'leader') return res.status(403).json({ success:false, error:'not_leader' });
    // Upsert request (replace existing)
    db.prepare('INSERT INTO party_adventure_requests(party_id, requester_id, created_at, status, decliner_id, accepted_ids, mob_name, mob_hp, mob_max, mob_color, mob_xp, mob_damage) VALUES(?,?,?,?,NULL,?,?,?,?,?,?,?) ON CONFLICT(party_id) DO UPDATE SET requester_id=excluded.requester_id, created_at=excluded.created_at, status=excluded.status, decliner_id=NULL, accepted_ids=excluded.accepted_ids, mob_name=NULL, mob_hp=NULL, mob_max=NULL, mob_color=NULL, mob_xp=NULL, mob_damage=NULL')
      .run(partyId, req.tgUser.id, Date.now(), 'pending', '', null, null, null, null, null, null);
    res.json({ success:true });
  } catch(e){ res.status(500).json({ success:false, error:'adventure_request_failed' }); }
});

// Adventure: respond
app.post('/party/adventure/respond', authMiddleware, (req,res)=>{
  const { accept } = req.body || {};
  try {
    const row = db.prepare('SELECT party_id FROM users WHERE id=?').get(req.tgUser.id);
    if(!row || !row.party_id) return res.status(400).json({ success:false, error:'no_party' });
    const partyId = row.party_id;
    const reqRow = db.prepare('SELECT * FROM party_adventure_requests WHERE party_id=?').get(partyId);
    if(!reqRow) return res.status(404).json({ success:false, error:'no_request' });
    if(reqRow.requester_id === String(req.tgUser.id)) return res.status(400).json({ success:false, error:'requester_cannot_respond' });
    if(reqRow.status !== 'pending') return res.json({ success:true, status:reqRow.status });
    if(accept) {
      // Записываем принятие
      let accepted = (reqRow.accepted_ids||'').split(',').filter(Boolean);
      if(!accepted.includes(String(req.tgUser.id))) accepted.push(String(req.tgUser.id));
      // Список участников (кроме инициатора)
      const others = db.prepare('SELECT user_id FROM party_members WHERE party_id=? AND user_id<>?').all(partyId, reqRow.requester_id).map(r=>String(r.user_id));
      const allAccepted = others.every(id=> accepted.includes(id));
      if(allAccepted){
        // Генерируем моба
        const mobs = [
          { name:'Слизень', base:10, color:'#5c9' },
          { name:'Паук', base:14, color:'#9c5' },
          { name:'Гоблин', base:18, color:'#c95' },
          { name:'Скелет', base:22, color:'#ccc' },
          { name:'Орк', base:28, color:'#8a5' }
        ];
        const pick = mobs[Math.floor(Math.random()*mobs.length)];
        const variance = 0.7 + Math.random()*0.6;
        const max = Math.round(pick.base * variance);
        const xp = Math.max(5, Math.round(max * (1.2 + Math.random()*0.6)));
        db.prepare("UPDATE party_adventure_requests SET status='active', accepted_ids=?, mob_name=?, mob_hp=?, mob_max=?, mob_color=?, mob_xp=? WHERE party_id=? AND status='pending'")
          .run(accepted.join(','), pick.name, max, max, pick.color, xp, partyId);
        return res.json({ success:true, accepted:true, ready:true, active:true });
      } else {
        db.prepare('UPDATE party_adventure_requests SET accepted_ids=? WHERE party_id=? AND status=\'pending\'').run(accepted.join(','), partyId);
        return res.json({ success:true, accepted:true, ready:false });
      }
    } else {
      db.prepare("UPDATE party_adventure_requests SET status='declined', decliner_id=? WHERE party_id=? AND status='pending'")
        .run(req.tgUser.id, partyId);
      return res.json({ success:true, declined:true });
    }
  } catch(e){ res.status(500).json({ success:false, error:'adventure_respond_failed' }); }
});

// Adventure: status polling
app.get('/party/adventure/status', authMiddleware, (req,res)=>{
  try {
    const row = db.prepare('SELECT party_id FROM users WHERE id=?').get(req.tgUser.id);
    if(!row || !row.party_id) return res.json({ success:true, request:null });
    const partyId = row.party_id;
    const reqRow = db.prepare('SELECT * FROM party_adventure_requests WHERE party_id=?').get(partyId);
    if(!reqRow) return res.json({ success:true, request:null });
    // Expire after 2 minutes
    if(Date.now() - reqRow.created_at > 120000) {
      try { db.prepare('DELETE FROM party_adventure_requests WHERE party_id=?').run(partyId); } catch {}
      return res.json({ success:true, request:null });
    }
    // If requester sees a declined -> auto consume (delete) after reporting once
    if(reqRow.status === 'declined' && reqRow.requester_id === String(req.tgUser.id)) {
      try { db.prepare('DELETE FROM party_adventure_requests WHERE party_id=?').run(partyId); } catch {}
    }
  res.json({ success:true, request: reqRow });
  } catch(e){ res.status(500).json({ success:false, error:'adventure_status_failed' }); }
});

// Adventure: attack shared mob
app.post('/party/adventure/attack', authMiddleware, (req,res)=>{
  try {
    const row = db.prepare('SELECT party_id FROM users WHERE id=?').get(req.tgUser.id);
    if(!row || !row.party_id) return res.status(400).json({ success:false, error:'no_party' });
    const partyId = row.party_id;
    const reqRow = db.prepare('SELECT * FROM party_adventure_requests WHERE party_id=?').get(partyId);
    if(!reqRow || reqRow.status!=='active') return res.status(400).json({ success:false, error:'not_active' });
    if(reqRow.mob_hp <=0) return res.json({ success:true, mob_hp:0, defeated:true });
    // базовый урон
    const dmg = 3 + Math.floor(Math.random()*3);
    const newHp = Math.max(0, reqRow.mob_hp - dmg);
    // damage log
    let damageLog = {};
    if(reqRow.mob_damage){ try { damageLog = JSON.parse(reqRow.mob_damage); } catch { damageLog = {}; } }
    const uid = String(req.tgUser.id);
    damageLog[uid] = (damageLog[uid]||0) + dmg;
    db.prepare('UPDATE party_adventure_requests SET mob_hp=?, mob_damage=? WHERE party_id=?').run(newHp, JSON.stringify(damageLog), partyId);
    let defeated = false; let xpShares=null; let coinsPerUser = null;
    if(newHp === 0){ defeated = true; // compute xp split normalized
      const totalDmg = Object.values(damageLog).reduce((a,b)=> a + (typeof b==='number'? b:0),0) || 1;
      const members = db.prepare('SELECT user_id FROM party_members WHERE party_id=?').all(partyId).map(r=> String(r.user_id));
      // proportional raw values
      const raw = members.map(id=>({ id, part: (damageLog[id]||0)/totalDmg }));
      // initial rounding
      let remainingXp = reqRow.mob_xp;
      xpShares = raw.map(r=>{ const base = Math.floor(reqRow.mob_xp * r.part); remainingXp -= base; return { userId:r.id, xp: base }; });
      // distribute leftover (due to floor) by descending fractional part
      const fractional = raw.map(r=>({ id:r.id, frac: (reqRow.mob_xp * r.part) - Math.floor(reqRow.mob_xp * r.part) }))
        .sort((a,b)=> b.frac - a.frac);
      for(let i=0;i<remainingXp;i++){ if(fractional[i]) { const idx = xpShares.findIndex(s=> s.userId===fractional[i].id); if(idx>=0) xpShares[idx].xp +=1; } }
      // coins: simple rule (e.g. 20% of xp each user got) rounded
      coinsPerUser = xpShares.map(s=>({ userId:s.userId, coins: Math.max(1, Math.round(s.xp*0.2)) }));
      // prevent double-award: mark mob_hp already zero and if a flag not set
      if(!reqRow.mob_awarded){
        const awardTx = db.transaction(()=>{
          xpShares.forEach(s=>{
            const cur = db.prepare('SELECT level, xp FROM users WHERE id=?').get(s.userId);
            if(!cur) return;
            let level = cur.level||1; let xp = cur.xp||0; xp += s.xp;
            // simple level curve (mirror client) 50 + (lvl-1)*60
            const need = (l)=> 50 + (l-1)*60;
            while(xp >= need(level)){ xp -= need(level); level++; }
            db.prepare('UPDATE users SET level=?, xp=?, coins = COALESCE(coins,0)+?, updated_at=?, last_active=? WHERE id=?')
              .run(level, xp, coinsPerUser.find(c=>c.userId===s.userId)?.coins||0, Date.now(), Date.now(), s.userId);
          });
          db.prepare('ALTER TABLE party_adventure_requests ADD COLUMN mob_awarded INTEGER').run(); // in case not exists
          db.prepare('UPDATE party_adventure_requests SET mob_awarded=1 WHERE party_id=?').run(partyId);
        });
        try { awardTx(); } catch(e) { /* ignore award race */ }
      }
    }
    res.json({ success:true, mob_hp:newHp, mob_max:reqRow.mob_max, defeated, dmg, mob_xp:reqRow.mob_xp, damage:damageLog, xpShares, coins: coinsPerUser });
  } catch(e){ res.status(500).json({ success:false, error:'attack_failed' }); }
});

// Adventure: finish (any member can finish; removes request row so клиенты выйдут из похода)
app.post('/party/adventure/finish', authMiddleware, (req,res)=>{
  try {
    const row = db.prepare('SELECT party_id FROM users WHERE id=?').get(req.tgUser.id);
    if(!row || !row.party_id) return res.json({ success:true, finished:false });
    const partyId = row.party_id;
    try { db.prepare('DELETE FROM party_adventure_requests WHERE party_id=?').run(partyId); } catch {}
    return res.json({ success:true, finished:true });
  } catch(e){ res.status(500).json({ success:false, error:'adventure_finish_failed' }); }
});

// DEBUG: кто я по заголовку x-telegram-init
app.get('/debug/whoami', (req, res) => {
  const initData = req.headers['x-telegram-init'];
  if (!initData) return res.status(400).json({ ok:false, error:'missing x-telegram-init' });
  const v = verifyTelegramInitData(initData);
  if (!v.ok) return res.status(401).json({ ok:false, error:v.error });
  res.json({ ok:true, user:v.user });
});

// DEBUG: получить сырые анимации пользователя
app.get('/debug/anim/:userId', authMiddleware, (req, res) => {
  const userId = req.params.userId;
  if (String(req.tgUser.id) !== String(userId)) return res.status(403).json({ success:false, error:'user_mismatch'});
  try {
    const row = db.prepare('SELECT stickman_anim FROM users WHERE id=?').get(userId);
    if (!row) return res.status(404).json({ success:false, error:'not_found'});
    let parsed = null;
    if (row.stickman_anim) {
      try { parsed = JSON.parse(row.stickman_anim); } catch (e) { parsed = { parseError: String(e) }; }
    }
    res.json({ success:true, rawLength: row.stickman_anim? row.stickman_anim.length:0, animations: parsed });
  } catch (e) {
    res.status(500).json({ success:false, error:'debug_failed' });
  }
});

// DEBUG: схема таблицы users
app.get('/debug/schema', (_req, res) => {
  try {
    const info = db.prepare("PRAGMA table_info('users')").all();
    res.json({ success:true, columns: info.map(c=>({ name:c.name, type:c.type, dflt:c.dflt_value })) });
  } catch (e) {
    res.status(500).json({ success:false, error:'schema_failed' });
  }
});

// Корневой маршрут / и статическая раздача фронтенда (если собран билд)
const frontendBuildDir = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(frontendBuildDir)) {
  app.use(express.static(frontendBuildDir));
  app.get('/', (_req, res) => {
    res.sendFile(path.join(frontendBuildDir, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => res.json({ success: true, service: 'tg-afk-backend', build: false }));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend listening on :${PORT} (DEV_MODE=${process.env.DEV_MODE || '0'})`);
});

module.exports = { app, verifyTelegramInitData };
