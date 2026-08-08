import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Root HTML for web.
 * Includes PWA / Add to Home Screen icon metadata.
 * apple-mobile-web-app-capable is what gives the classic iOS Home Screen
 * shell (same as Safari content, but no bottom search bar / browser chrome).
 */
const BASE = (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? process.env.EXPO_BASE_URL ?? '')
  .replace(/\/$/, '');
const asset = (path: string) => `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0a0a0a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Top Tipster" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Top Tipster" />

        <link rel="icon" type="image/png" href={asset('/favicon.png')} />
        <link rel="apple-touch-icon" href={asset('/apple-touch-icon.png')} />
        <link rel="manifest" href={asset('/manifest.json')} />

        <style>{`
          html, body, #root {
            width: 100%;
            max-width: 100%;
            margin: 0;
            padding: 0;
            overflow-x: hidden;
          }

          html {
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }
        `}</style>
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
