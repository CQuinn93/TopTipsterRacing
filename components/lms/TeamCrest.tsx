/**
 * DISABLED — club crest images (trademark risk).
 * Prefer `TeamColourChip` for identification.
 *
 * Restore the previous implementation (expo-image + crest_url) if the product
 * later obtains logo rights. Previous shape:
 *
 *   props: { uri?: string | null; size?: number; label?: string }
 *   - placeholder View when !uri
 *   - <Image source={{ uri }} cachePolicy="memory-disk" ... />
 *
 * Call sites previously passed team.crest_url; sync still may populate crest_url
 * on lms_teams for a future switch-back (see scripts/sync-lms-football.ts).
 */
export function TeamCrest(_props: {
  uri?: string | null;
  size?: number;
  label?: string;
}) {
  return null;
}
