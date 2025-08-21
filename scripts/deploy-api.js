#!/usr/bin/env node
// Rebuild frontend with current config.json and push gh-pages via existing script chain
const { spawn } = require('child_process');
function run(cmd, args){
  return new Promise((resolve,reject)=>{
    const p = spawn(cmd,args,{stdio:'inherit',shell:process.platform==='win32'});
    p.on('exit', c=> c===0?resolve():reject(new Error(cmd+' exit '+c)));
  });
}
(async()=>{
  try {
    await run('npm',['--workspace','frontend','run','build']);
    await run('git',['subtree','push','--prefix','frontend/build','origin','gh-pages']);
    console.log('[deploy-api] gh-pages updated');
  } catch(e){
    console.error('[deploy-api] failed', e.message);
    process.exit(1);
  }
})();
