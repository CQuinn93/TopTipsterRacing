/**
 * Approximate kit/primary colours for LMS team chips (identification only — not official crests).
 * Keyed by slug and short_name. Extend when the season squad changes.
 */
export type TeamChipColours = { primary: string; secondary: string; text: string };

const DEFAULT: TeamChipColours = {
  primary: '#374151',
  secondary: '#9ca3af',
  text: '#fafafa',
};

const BY_SLUG: Record<string, TeamChipColours> = {
  arsenal: { primary: '#EF0107', secondary: '#FFFFFF', text: '#FFFFFF' },
  'aston-villa': { primary: '#670E36', secondary: '#95BFE5', text: '#FFFFFF' },
  bournemouth: { primary: '#DA291C', secondary: '#000000', text: '#FFFFFF' },
  brentford: { primary: '#E30613', secondary: '#FFFFFF', text: '#FFFFFF' },
  brighton: { primary: '#0057B8', secondary: '#FFFFFF', text: '#FFFFFF' },
  chelsea: { primary: '#034694', secondary: '#FFFFFF', text: '#FFFFFF' },
  coventry: { primary: '#77B3E3', secondary: '#FFFFFF', text: '#0a0a0a' },
  'crystal-palace': { primary: '#1B458F', secondary: '#C4122E', text: '#FFFFFF' },
  everton: { primary: '#003399', secondary: '#FFFFFF', text: '#FFFFFF' },
  fulham: { primary: '#000000', secondary: '#FFFFFF', text: '#FFFFFF' },
  hull: { primary: '#F5A12D', secondary: '#000000', text: '#0a0a0a' },
  ipswich: { primary: '#0033A0', secondary: '#FFFFFF', text: '#FFFFFF' },
  leeds: { primary: '#FFCD00', secondary: '#1D428A', text: '#0a0a0a' },
  liverpool: { primary: '#C8102E', secondary: '#FFFFFF', text: '#FFFFFF' },
  'manchester-city': { primary: '#6CABDD', secondary: '#FFFFFF', text: '#0a0a0a' },
  'manchester-united': { primary: '#DA291C', secondary: '#FBE122', text: '#FFFFFF' },
  newcastle: { primary: '#241F20', secondary: '#FFFFFF', text: '#FFFFFF' },
  'nottingham-forest': { primary: '#DD0000', secondary: '#FFFFFF', text: '#FFFFFF' },
  sunderland: { primary: '#EB172B', secondary: '#FFFFFF', text: '#FFFFFF' },
  tottenham: { primary: '#132257', secondary: '#FFFFFF', text: '#FFFFFF' },
  // Common extras if sync brings them in mid-season
  wolverhampton: { primary: '#FDB913', secondary: '#000000', text: '#0a0a0a' },
  wolves: { primary: '#FDB913', secondary: '#000000', text: '#0a0a0a' },
  burnley: { primary: '#6C1D45', secondary: '#99D6EA', text: '#FFFFFF' },
  'west-ham': { primary: '#7A263A', secondary: '#1BB1E7', text: '#FFFFFF' },
};

const BY_CODE: Record<string, TeamChipColours> = {
  ARS: BY_SLUG.arsenal,
  AVL: BY_SLUG['aston-villa'],
  BOU: BY_SLUG.bournemouth,
  BRE: BY_SLUG.brentford,
  BHA: BY_SLUG.brighton,
  CHE: BY_SLUG.chelsea,
  COV: BY_SLUG.coventry,
  CRY: BY_SLUG['crystal-palace'],
  EVE: BY_SLUG.everton,
  FUL: BY_SLUG.fulham,
  HUL: BY_SLUG.hull,
  IPS: BY_SLUG.ipswich,
  LEE: BY_SLUG.leeds,
  LIV: BY_SLUG.liverpool,
  MCI: BY_SLUG['manchester-city'],
  MUN: BY_SLUG['manchester-united'],
  NEW: BY_SLUG.newcastle,
  NFO: BY_SLUG['nottingham-forest'],
  SUN: BY_SLUG.sunderland,
  TOT: BY_SLUG.tottenham,
  WOL: BY_SLUG.wolves,
  BUR: BY_SLUG.burnley,
  WHU: BY_SLUG['west-ham'],
};

export function lmsTeamChipColours(opts: {
  slug?: string | null;
  shortName?: string | null;
}): TeamChipColours {
  const slug = opts.slug?.trim().toLowerCase();
  if (slug && BY_SLUG[slug]) return BY_SLUG[slug];
  const code = opts.shortName?.trim().toUpperCase();
  if (code && BY_CODE[code]) return BY_CODE[code];
  return DEFAULT;
}

export function lmsTeamCode(opts: {
  shortName?: string | null;
  name?: string | null;
}): string {
  const short = opts.shortName?.trim();
  if (short) return short.slice(0, 3).toUpperCase();
  const name = opts.name?.trim();
  if (name) return name.slice(0, 3).toUpperCase();
  return '?';
}

/**
 * User-facing club name without a trailing FC / AFC suffix.
 * Keeps leading "AFC" in names like "AFC Bournemouth".
 */
export function lmsDisplayTeamName(name?: string | null): string {
  const raw = name?.trim() ?? '';
  if (!raw) return '';
  return raw.replace(/\s+A?\.?F\.?C\.?$/i, '').trim() || raw;
}
