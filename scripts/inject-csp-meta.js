/**
 * Post-build: Inject CSP + iOS Home Screen (PWA) meta into dist HTML.
 *
 * Why PWA injection lives here:
 * - web.output is "single", so Expo uses a generated SPA shell and does NOT
 *   apply app/+html.tsx. Without these tags in the final index.html, iOS
 *   "Add to Home Screen" opens in Safari (domain bar + bottom chrome) instead
 *   of the native-like standalone shell.
 *
 * Expo/Metro web bundles also use eval(); CSP must allow 'unsafe-eval'.
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');

const rawBase = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? '';
const base =
  !rawBase || rawBase === '/'
    ? ''
    : `/${String(rawBase).replace(/^\/+|\/+$/g, '')}`;
const asset = (p) => `${base}${p.startsWith('/') ? p : `/${p}`}`;

const cspMeta =
  '<meta http-equiv="Content-Security-Policy" content="script-src \'self\' \'unsafe-eval\' \'unsafe-inline\'; worker-src \'self\'; style-src \'self\' \'unsafe-inline\';">';

const pwaHead = [
  '<meta name="theme-color" content="#0a0a0a" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  '<meta name="apple-mobile-web-app-title" content="Top Tipster" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="application-name" content="Top Tipster" />',
  `<link rel="apple-touch-icon" href="${asset('/apple-touch-icon.png')}" />`,
  `<link rel="manifest" href="${asset('/manifest.json')}" />`,
].join('\n    ');

function ensureCsp(html) {
  if (html.includes('Content-Security-Policy')) {
    return html.replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, cspMeta);
  }
  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>\n  ${cspMeta}`);
  }
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n  ${cspMeta}`);
  }
  return html;
}

function ensureViewportFit(html) {
  return html.replace(
    /<meta([^>]*name=["']viewport["'][^>]*)>/i,
    (full, attrs) => {
      if (/viewport-fit\s*=\s*cover/i.test(attrs)) return full;
      if (/content=["'][^"']*["']/i.test(attrs)) {
        const nextAttrs = attrs.replace(
          /content=(["'])([^"']*)\1/i,
          (_m, q, content) => {
            const parts = content
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
              .filter((p) => !/^viewport-fit\s*=/i.test(p));
            parts.push('viewport-fit=cover');
            return `content=${q}${parts.join(', ')}${q}`;
          }
        );
        return `<meta${nextAttrs}>`;
      }
      return full;
    }
  );
}

function ensurePwaMeta(html) {
  let out = html;

  // Drop older copies so rebuilds stay idempotent.
  out = out.replace(
    /\s*<meta[^>]*name=["']apple-mobile-web-app-(?:capable|status-bar-style|title)["'][^>]*>/gi,
    ''
  );
  out = out.replace(
    /\s*<meta[^>]*name=["']mobile-web-app-capable["'][^>]*>/gi,
    ''
  );
  out = out.replace(
    /\s*<meta[^>]*name=["']application-name["'][^>]*>/gi,
    ''
  );
  out = out.replace(/\s*<link[^>]*rel=["']manifest["'][^>]*>/gi, '');
  out = out.replace(/\s*<link[^>]*rel=["']apple-touch-icon["'][^>]*>/gi, '');

  // Keep a single theme-color.
  out = out.replace(/\s*<meta[^>]*name=["']theme-color["'][^>]*>/gi, '');

  out = ensureViewportFit(out);

  if (out.includes('</head>')) {
    out = out.replace('</head>', `    ${pwaHead}\n  </head>`);
  } else if (out.includes('<head>')) {
    out = out.replace('<head>', `<head>\n    ${pwaHead}`);
  }

  return out;
}

function processDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      processDir(fullPath);
    } else if (entry.name.endsWith('.html')) {
      let html = fs.readFileSync(fullPath, 'utf8');
      html = ensureCsp(html);
      html = ensurePwaMeta(html);
      fs.writeFileSync(fullPath, html);
      console.log('Injected CSP + PWA meta into', fullPath);
    }
  }
}

if (!fs.existsSync(distDir)) {
  console.error('dist/ not found. Run npm run build:web first.');
  process.exit(1);
}
processDir(distDir);
