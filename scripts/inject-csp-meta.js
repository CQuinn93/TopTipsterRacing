/**
 * Post-build: Inject CSP meta tag to allow 'unsafe-eval'.
 * Expo/Metro web bundles use eval(); default CSP blocks it and breaks the app.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const cspMeta =
  '<meta http-equiv="Content-Security-Policy" content="script-src \'self\' \'unsafe-eval\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\';">';

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.name.endsWith('.html')) {
      let html = fs.readFileSync(fullPath, 'utf8');
      if (html.includes('Content-Security-Policy')) {
        html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, cspMeta);
      } else if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>\n  ${cspMeta}`);
      } else if (html.includes('<head ')) {
        html = html.replace(/<head[^>]*>/, (m) => `${m}\n  ${cspMeta}`);
      } else {
        continue;
      }
      fs.writeFileSync(fullPath, html);
      console.log('Injected CSP meta into', fullPath);
    }
  }
}

if (!fs.existsSync(distDir)) {
  console.error('dist/ not found. Run npm run build:web first.');
  process.exit(1);
}
processDir(distDir);
