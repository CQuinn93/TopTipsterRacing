import { router } from 'expo-router';

import { wcHref } from '@/features/wc2026/utils/href';

/** Push the ante-post stage hub onto the stack (use from WC home). */
export function openAntePostHubFromHome() {
  router.push(wcHref('/(wc2026)/ante-post-navigation'));
}

/** Pop the current ante-post stage screen (group / knockout pickers). */
export function goBackFromAntePostStage() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(wcHref('/(wc2026)/(tabs)'));
}

/** Pop the ante-post hub back to wherever it was opened from (WC home tab). */
export function goBackFromAntePostHub() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(wcHref('/(wc2026)/(tabs)'));
}
