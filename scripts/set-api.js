#!/usr/bin/env node
// Update frontend/public/config.json apiBase.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname,'..','frontend','public','config.json');
const api = process.argv[2];
if(!api){
  console.error('Usage: npm run set:api -- <url>');
  process.exit(1);
}
let next = api.replace(/\/$/,'');
let data = { apiBase: next };
fs.writeFileSync(file, JSON.stringify(data,null,2)+"\n");
console.log('[set-api] apiBase ->', next);
