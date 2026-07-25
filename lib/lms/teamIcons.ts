import type { ImageSourcePropType } from 'react-native';
import { lmsTeamCode } from '@/lib/lms/teamColours';

/**
 * Local kit icons (assets/Icons/{CODE}.png) — identification art, not official crests.
 * Metro requires static require() paths.
 */
const TEAM_ICON_BY_CODE: Record<string, ImageSourcePropType> = {
  ARS: require('../../assets/Icons/ARS.png'),
  AST: require('../../assets/Icons/AST.png'),
  // DB / football-data TLA for Aston Villa
  AVL: require('../../assets/Icons/AST.png'),
  BHA: require('../../assets/Icons/BHA.png'),
  BOU: require('../../assets/Icons/BOU.png'),
  BRE: require('../../assets/Icons/BRE.png'),
  CHE: require('../../assets/Icons/CHE.png'),
  COV: require('../../assets/Icons/COV.png'),
  CRY: require('../../assets/Icons/CRY.png'),
  EVE: require('../../assets/Icons/EVE.png'),
  FUL: require('../../assets/Icons/FUL.png'),
  HUL: require('../../assets/Icons/HUL.png'),
  IPS: require('../../assets/Icons/IPS.png'),
  LEE: require('../../assets/Icons/LEE.png'),
  LIV: require('../../assets/Icons/LIV.png'),
  MCI: require('../../assets/Icons/MCI.png'),
  MUN: require('../../assets/Icons/MUN.png'),
  NEW: require('../../assets/Icons/NEW.png'),
  NFO: require('../../assets/Icons/NFO.png'),
  SUN: require('../../assets/Icons/SUN.png'),
  TOT: require('../../assets/Icons/TOT.png'),
};

const SLUG_TO_CODE: Record<string, string> = {
  arsenal: 'ARS',
  'aston-villa': 'AST',
  bournemouth: 'BOU',
  brentford: 'BRE',
  brighton: 'BHA',
  chelsea: 'CHE',
  coventry: 'COV',
  'crystal-palace': 'CRY',
  everton: 'EVE',
  fulham: 'FUL',
  hull: 'HUL',
  ipswich: 'IPS',
  leeds: 'LEE',
  liverpool: 'LIV',
  'manchester-city': 'MCI',
  'manchester-united': 'MUN',
  newcastle: 'NEW',
  'nottingham-forest': 'NFO',
  sunderland: 'SUN',
  tottenham: 'TOT',
};

export function lmsTeamIconSource(opts: {
  shortName?: string | null;
  name?: string | null;
  slug?: string | null;
}): ImageSourcePropType | null {
  const slug = opts.slug?.trim().toLowerCase();
  if (slug && SLUG_TO_CODE[slug]) {
    const fromSlug = TEAM_ICON_BY_CODE[SLUG_TO_CODE[slug]];
    if (fromSlug) return fromSlug;
  }

  const code = lmsTeamCode({ shortName: opts.shortName, name: opts.name });
  return TEAM_ICON_BY_CODE[code] ?? null;
}
