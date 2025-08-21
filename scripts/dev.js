#!/usr/bin/env node
// Simple dev orchestrator: start backend, wait until port responds, then start frontend.
const { spawn } = require('child_process');
const http = require('http');

const BACKEND_CMD = ['npm', ['run','start:backend']];
const FRONTEND_CMD = ['npm', ['run','start:frontend']];
const PORT = process.env.PORT || 3001;

function waitForPort(port, timeoutMs=15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host:'localhost', port, path:'/ping', timeout:2000 }, res => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('Timeout waiting for backend')); 
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function run(cmd, args, name) {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', code => {
    console.log(`[dev] ${name} exited with code ${code}`);
    process.exit(code || 0);
  });
  return child;
}

console.log('[dev] Starting backend...');
const backend = run(BACKEND_CMD[0], BACKEND_CMD[1], 'backend');

waitForPort(PORT).then(()=>{
  console.log('[dev] Backend is up, starting frontend...');
  run(FRONTEND_CMD[0], FRONTEND_CMD[1], 'frontend');
}).catch(err=>{
  console.error('[dev] Failed to detect backend:', err.message);
  process.exit(1);
});
