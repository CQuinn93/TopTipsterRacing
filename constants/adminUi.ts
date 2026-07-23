/**
 * Admin surface palette — distinct from football green and racing gold.
 * Cool steel blue keeps admin tools visually separate from competition modes.
 */
export const ADMIN_UI = {
  accentLight: '#3d5a80',
  accentDark: '#8ba4c4',
  accentMutedLight: 'rgba(61, 90, 128, 0.16)',
  accentMutedDark: 'rgba(139, 164, 196, 0.22)',
  decorLight: 'rgba(61, 90, 128, 0.2)',
  decorDark: 'rgba(139, 164, 196, 0.28)',
  bgLight: ['#f5f7fa', '#e8eef4', '#f7f8fa'] as const,
  bgDark: ['#080a0e', '#0e1218', '#090b0f'] as const,
} as const;

export function getAdminAccent(isDark: boolean) {
  return {
    accent: isDark ? ADMIN_UI.accentDark : ADMIN_UI.accentLight,
    accentMuted: isDark ? ADMIN_UI.accentMutedDark : ADMIN_UI.accentMutedLight,
    decor: isDark ? ADMIN_UI.decorDark : ADMIN_UI.decorLight,
    bg: isDark ? ADMIN_UI.bgDark : ADMIN_UI.bgLight,
  };
}
