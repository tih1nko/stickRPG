#!/usr/bin/env node
// Update Telegram bot menu button to open the WebApp URL.
// Usage:
//   1) Put BOT_TOKEN=123456:ABC... into backend/.env (NOT committed) or export BOT_TOKEN
//   2) Provide target game URL via --url or it will try to build from frontend/public/config.json
//   3) Run: npm run bot:update -- --url https://tih1nko.github.io/stickRPG/?api=...
// This script calls setChatMenuButton with a web_app button.

const fs = require('fs');
const path = require('path');

// Minimal .env parser (avoid needing dotenv at root)
try {
  const envFile = path.join(__dirname,'..','backend','.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile,'utf8').split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const k = line.slice(0,idx).trim();
      const v = line.slice(idx+1).trim().replace(/^['"]|['"]$/g,'');
      if (!(k in process.env)) process.env[k] = v;
    }
  }
} catch(e) {
  console.warn('[bot:update] .env parse failed', e.message);
}

const args = process.argv.slice(2);
let urlArg = null;
for (let i=0;i<args.length;i++) {
  if (args[i] === '--url' && args[i+1]) { urlArg = args[i+1]; i++; }
}

async function main(){
  const token = process.env.BOT_TOKEN;
  if(!token){
    console.error('[bot:update] BOT_TOKEN not found in backend/.env');
    process.exit(1);
  }
  let webAppUrl = urlArg;
  if(!webAppUrl){
    // Attempt to construct from config.json + assume GitHub Pages root
    try {
      const cfgPath = path.join(__dirname,'..','frontend','public','config.json');
      const cfg = JSON.parse(fs.readFileSync(cfgPath,'utf8'));
      if(cfg.apiBase){
        webAppUrl = `https://tih1nko.github.io/stickRPG/?api=${cfg.apiBase}`;
      }
    } catch{};
  }
  if(!webAppUrl){
    console.error('[bot:update] No --url provided and unable to derive. Abort.');
    process.exit(1);
  }
  console.log('[bot:update] Setting web_app URL ->', webAppUrl);
  const body = {
    menu_button: {
      type: 'web_app',
      text: 'Play',
      web_app: { url: webAppUrl }
    }
  };
  const endpoint = `https://api.telegram.org/bot${token}/setChatMenuButton`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if(!json.ok){
      console.error('[bot:update] Failed:', json);
      process.exit(1);
    }
    console.log('[bot:update] OK');
  } catch(e){
    console.error('[bot:update] Error', e.message);
    process.exit(1);
  }
}

main();
