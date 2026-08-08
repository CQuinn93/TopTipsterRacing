/**
 * Write public/manifest.json (and dist copy after export).
 * Keep this close to the classic iOS Home Screen shape that hid Safari chrome
 * (no bottom search bar, no system back/forward). Avoid extra manifest fields
 * (id / scope / display_override) that can change how iOS presents the app.
 */
const fs = require('fs');
const path = require('path');

const raw = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? '';
const base =
  !raw || raw === '/'
    ? ''
    : `/${String(raw).replace(/^\/+|\/+$/g, '')}`;

// Relative start_url "." matched the previously-working Home Screen behaviour.
// For subpath hosts, point at that folder explicitly.
const startUrl = base ? `${base}/` : '.';

const manifest = {
  name: 'Top Tipster',
  short_name: 'Top Tipster',
  description: 'Fantasy sports competitions from Top Tipster',
  start_url: startUrl,
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0a0a0a',
  theme_color: '#0a0a0a',
  icons: [
    {
      src: base ? `${base}/favicon.png` : 'favicon.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: base ? `${base}/icon-192.png` : 'icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: base ? `${base}/icon-512.png` : 'icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: base ? `${base}/apple-touch-icon.png` : 'apple-touch-icon.png',
      sizes: '180x180',
      type: 'image/png',
      purpose: 'any',
    },
  ],
};

const json = `${JSON.stringify(manifest, null, 2)}\n`;
const publicPath = path.join(__dirname, '..', 'public', 'manifest.json');
fs.writeFileSync(publicPath, json);
console.log('Wrote', publicPath, `{ start_url: ${startUrl} }`);

const distPath = path.join(__dirname, '..', 'dist', 'manifest.json');
if (fs.existsSync(path.join(__dirname, '..', 'dist'))) {
  fs.writeFileSync(distPath, json);
  console.log('Wrote', distPath);
}
