/**
 * GitHub Pages serves 404.html for unknown paths (e.g. /<competitionId> on refresh).
 * Copy the SPA shell there so deep links reload into Expo Router instead of a hard 404.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexHtml = path.join(distDir, 'index.html');
const notFoundHtml = path.join(distDir, '404.html');

if (!fs.existsSync(indexHtml)) {
  console.error('dist/index.html not found. Run npm run build:web first.');
  process.exit(1);
}

fs.copyFileSync(indexHtml, notFoundHtml);
console.log('Wrote SPA fallback', notFoundHtml);
