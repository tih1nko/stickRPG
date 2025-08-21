// Creates 404.html & 200.html copies of index.html for GitHub Pages SPA fallback.
// Cross-platform (Node) replacement for shell copy.
const fs = require('fs');
const path = require('path');
const buildDir = path.join(__dirname, '..', 'build');
const idx = path.join(buildDir, 'index.html');
if (!fs.existsSync(idx)) {
  console.error('[postbuild] index.html not found, skip');
  process.exit(0);
}
for (const name of ['404.html','200.html']) {
  try {
    fs.copyFileSync(idx, path.join(buildDir, name));
    console.log('[postbuild] created', name);
  } catch (e) {
    console.error('[postbuild] failed to create', name, e);
  }
}
