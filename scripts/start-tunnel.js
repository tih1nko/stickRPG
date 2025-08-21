#!/usr/bin/env node
// Start localtunnel and update config.json automatically
const lt = require('localtunnel');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
(async () => {
  const port = Number(process.env.PORT) || 3001;
  const tunnel = await lt({ port });
  console.log('[tunnel] url =', tunnel.url);
  // Update config.json
  const cfgPath = path.join(__dirname,'..','frontend','public','config.json');
  try {
    fs.writeFileSync(cfgPath, JSON.stringify({ apiBase: tunnel.url }, null, 2)+"\n");
    console.log('[tunnel] updated config.json');
  } catch(e){ console.warn('[tunnel] write failed', e); }
  console.log('Now run: npm run deploy:pages OR open the site with ?api='+tunnel.url);
  tunnel.on('close', ()=> console.log('[tunnel] closed'));
})();
