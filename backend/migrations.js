const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const dbPath = process.env.DB_FILE || path.join(__dirname, 'db', 'game.sqlite3');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
try { db.pragma('journal_mode = WAL'); } catch {}

db.prepare(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)` ).run();

function getCurrVersion(){
  const row = db.prepare('SELECT value FROM _meta WHERE key=?').get('schema_version');
  return row ? parseInt(row.value,10) : 0;
}
function setCurrVersion(v){
  db.prepare('INSERT INTO _meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('schema_version', String(v));
}

const migrationsDir = path.join(__dirname, 'migrations');
if(!fs.existsSync(migrationsDir)) { console.log('No migrations dir, skipping'); process.exit(0); }
const files = fs.readdirSync(migrationsDir)
  .filter(f=>/^\d+_.+\.sql$/.test(f))
  .sort((a,b)=>{
    const na = parseInt(a.split('_')[0],10); const nb = parseInt(b.split('_')[0],10); return na-nb;
  });

const current = getCurrVersion();
let applied = 0;
for(const f of files){
  const num = parseInt(f.split('_')[0],10);
  if(num <= current) continue;
  const full = path.join(migrationsDir, f);
  const sql = fs.readFileSync(full,'utf8');
  console.log('Applying migration', f);
  try {
    db.exec('BEGIN');
    db.exec(sql);
    setCurrVersion(num);
    db.exec('COMMIT');
    applied++;
  } catch(e){
    console.error('Migration failed for', f, e.message);
    try { db.exec('ROLLBACK'); } catch {}
    process.exit(1);
  }
}
console.log(applied ? `Applied ${applied} migration(s). Now at version ${getCurrVersion()}` : 'No new migrations. Version '+current);
