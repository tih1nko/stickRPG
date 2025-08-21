#!/usr/bin/env node
// Create/update a stamp file so build always has a new commit hash difference
const fs = require('fs');
const path = require('path');
const stampPath = path.join(__dirname,'..','frontend','public','deploy-stamp.txt');
const ts = new Date().toISOString();
fs.writeFileSync(stampPath, ts+"\n");
console.log('[deploystamp] wrote', stampPath, ts);
