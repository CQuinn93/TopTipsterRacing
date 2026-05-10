'use strict';

/**
 * Boots @expo/cli with the same argv as `expo` / `npx expo`.
 *
 * Default: EXPO_NO_DEPENDENCY_VALIDATION=1 skips Expo's remote dependency doctor
 * (calls api.expo.dev). That fetch often fails with the same TLS issues as
 * `npm install` (UNABLE_TO_VERIFY_LEAF_SIGNATURE / "fetch failed").
 *
 * Metro, tunnel, and your app still use the network normally — this is not --offline.
 *
 * Override: set EXPO_NO_DEPENDENCY_VALIDATION=0 in .env or the shell to re-enable
 * the check once HTTPS trust is fixed (corporate CA via NODE_EXTRA_CA_CERTS, etc.).
 */

const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  // dotenv is a devDependency; omit=dev installs skip it
}

if (process.env.EXPO_NO_DEPENDENCY_VALIDATION === undefined) {
  process.env.EXPO_NO_DEPENDENCY_VALIDATION = '1';
}

require('@expo/cli');
