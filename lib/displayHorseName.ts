/**
 * Strip country suffixes like (IRE), (GB), (USA) from horse names for display only.
 * The full name is kept in the DB and when saving selections.
 */
export function displayHorseName(name: string): string {
  if (!name || typeof name !== 'string') return name;
  return name.replace(/\s*\([A-Z]{2,3}\)\s*$/, '').trim();
}
