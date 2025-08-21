#!/usr/bin/env node
// Orchestrate: start backend -> wait /ping -> devtunnel host -> capture URL -> set api -> bot:update
// Usage: npm run auto:tunnel  (assumes tunnel & port already created once: devtunnel create stickrpg --allow-anonymous & port create)

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname,'..');
const backendDir = path.join(root,'backend');
const configPath = path.join(root,'frontend','public','config.json');
const botScript = path.join(root,'scripts','update-telegram-webapp.js');

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function waitPing(url='http://localhost:3001/ping', timeoutMs=20000){
  const start=Date.now();
  while(Date.now()-start < timeoutMs){
    try { const res = await fetch(url); if(res.ok) return true; } catch {}
    await wait(500);
  }
  throw new Error('Timeout waiting for backend /ping');
}

function findDevTunnelExe(){
  if (process.platform !== 'win32') return 'devtunnel';
  const base = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA,'Microsoft','WinGet','Packages');
  if (!base || !fs.existsSync(base)) return 'devtunnel';
  const entries = fs.readdirSync(base,{withFileTypes:true});
  for (const e of entries){
    if (!e.isDirectory()) continue;
    if (e.name.toLowerCase().includes('devtunnel')){
      const full = path.join(base,e.name,'devtunnel.exe');
      if (fs.existsSync(full)) return full;
    }
  }
  return 'devtunnel';
}

async function run(){
  console.log('[auto] Starting backend...');
  const backend = spawn('node',['index.js'],{cwd:backendDir, stdio:['ignore','pipe','pipe']});
  backend.stdout.on('data',d=>process.stdout.write('[backend] '+d.toString()));
  backend.stderr.on('data',d=>process.stderr.write('[backend-err] '+d.toString()));
  try { await waitPing(); console.log('[auto] Backend up.'); } catch(e){ console.error('[auto] Backend failed:', e.message); process.exit(1); }

  const devExe = findDevTunnelExe();
  console.log('[auto] Using devtunnel executable:', devExe);
  console.log('[auto] Hosting tunnel (stickrpg)...');
  const host = spawn(devExe,['host','stickrpg'], {cwd:root});
  let tunnelUrl=null; let webAppUrl=null;
  host.stdout.on('data',chunk=>{
    const line = chunk.toString();
    process.stdout.write('[tunnel] '+line);
    if(!tunnelUrl){
      const m = line.match(/https?:\/\/([a-z0-9-]+-3001\.[^\s]+)/i);
      if(m){ tunnelUrl = 'https://'+m[1].replace(/,$/,''); console.log('\n[auto] Captured tunnel URL:', tunnelUrl); }
    }
    if(tunnelUrl && !webAppUrl){
      // Update config.json
      try {
        fs.writeFileSync(configPath, JSON.stringify({ apiBase: tunnelUrl }, null, 2)+'\n');
        console.log('[auto] Updated config.json apiBase');
      } catch(e){ console.warn('[auto] config.json write failed', e.message); }
      webAppUrl = `https://tih1nko.github.io/stickRPG/?api=${tunnelUrl}`;
      // Run bot:update
      console.log('[auto] Updating Telegram bot menu ->', webAppUrl);
      const upd = spawn(process.execPath,[botScript,'--url',webAppUrl], {cwd:root, stdio:'inherit'});
      upd.on('exit', code => {
        console.log('[auto] bot:update exit code', code);
      });
    }
  });
  host.stderr.on('data',d=>process.stderr.write('[tunnel-err] '+d.toString()));
  host.on('exit', code => { console.log('[auto] Tunnel host exited', code); process.exit(code||0); });
}

run();
