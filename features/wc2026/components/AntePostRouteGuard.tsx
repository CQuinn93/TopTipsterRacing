import { Redirect } from 'expo-router';

import { WC_ANTE_POST_ENABLED } from '@/features/wc2026/constants/product';
import { wcHref } from '@/features/wc2026/utils/href';

/** Redirects to selections when ante-post is disabled in the main football product. */
export function AntePostRouteGuard() {
  if (WC_ANTE_POST_ENABLED) return null;
  return <Redirect href={wcHref('/(wc2026)/(tabs)/selections')} />;
}
