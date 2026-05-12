import type { ImageSource } from 'expo-image';

/** Normalise DB / FIFA codes to keys used in `imageMap`. */
function normalizeCountryCode(raw: string): string {
  const u = (raw ?? '').trim().toUpperCase();
  const aliases: Record<string, string> = {
    ENG: 'GB',
    SCO: 'SC',
    WALES: 'WAL',
    WAL: 'WAL',
    NIR: 'NIR',
    UKR: 'UA',
    XKX: 'XK',
    RKS: 'XK',
    CUR: 'CW',
  };
  return aliases[u] ?? u;
}

// Metro requires full string literals for each asset path.
const imageMap: Record<string, ImageSource> = {
  US: require('@/assets/wc2026/images/USA.svg'),
  CA: require('@/assets/wc2026/images/Canada.svg'),
  MX: require('@/assets/wc2026/images/Mexico.svg'),
  BR: require('@/assets/wc2026/images/Brazil.svg'),
  AR: require('@/assets/wc2026/images/Argentina.svg'),
  FR: require('@/assets/wc2026/images/France.svg'),
  DE: require('@/assets/wc2026/images/Germany.svg'),
  ES: require('@/assets/wc2026/images/Spain.svg'),
  IT: require('@/assets/wc2026/images/Italy.svg'),
  NL: require('@/assets/wc2026/images/Netherlands.svg'),
  BE: require('@/assets/wc2026/images/Belgium.svg'),
  PT: require('@/assets/wc2026/images/Portugal.svg'),
  GB: require('@/assets/wc2026/images/England.svg'),
  SC: require('@/assets/wc2026/images/Scotland.svg'),
  HR: require('@/assets/wc2026/images/Croatia.svg'),
  AT: require('@/assets/wc2026/images/Austria.svg'),
  CH: require('@/assets/wc2026/images/Switzerland.svg'),
  DK: require('@/assets/wc2026/images/Denmark.svg'),
  NO: require('@/assets/wc2026/images/Norway.svg'),
  SE: require('@/assets/wc2026/images/Sweden.svg'),
  PL: require('@/assets/wc2026/images/Poland.svg'),
  JP: require('@/assets/wc2026/images/Japan.svg'),
  KR: require('@/assets/wc2026/images/South Korea.svg'),
  SA: require('@/assets/wc2026/images/Saudi Arabia.svg'),
  AU: require('@/assets/wc2026/images/Australia.svg'),
  IR: require('@/assets/wc2026/images/Iran.svg'),
  QA: require('@/assets/wc2026/images/Qatar.svg'),
  JO: require('@/assets/wc2026/images/Jordan.svg'),
  UZ: require('@/assets/wc2026/images/Uzbekistan.svg'),
  SN: require('@/assets/wc2026/images/Senegal.svg'),
  MA: require('@/assets/wc2026/images/Morroco.svg'),
  EG: require('@/assets/wc2026/images/Egypt.svg'),
  GH: require('@/assets/wc2026/images/Ghana.svg'),
  TN: require('@/assets/wc2026/images/Tunisia.svg'),
  CI: require('@/assets/wc2026/images/Ivory Coast.svg'),
  DZ: require('@/assets/wc2026/images/Algeria.svg'),
  ZA: require('@/assets/wc2026/images/South Africa.svg'),
  CV: require('@/assets/wc2026/images/Cape Verde.svg'),
  JM: require('@/assets/wc2026/images/Jamaica.svg'),
  CR: require('@/assets/wc2026/images/USA.svg'),
  HT: require('@/assets/wc2026/images/Haiti.svg'),
  PA: require('@/assets/wc2026/images/Panama.svg'),
  CW: require('@/assets/wc2026/images/Curacao.svg'),
  /** FIFA code (same flag as CW). */
  CUW: require('@/assets/wc2026/images/Curacao.svg'),
  UY: require('@/assets/wc2026/images/Uruguay.svg'),
  CL: require('@/assets/wc2026/images/USA.svg'),
  CO: require('@/assets/wc2026/images/Colombia.svg'),
  EC: require('@/assets/wc2026/images/Ecuador.svg'),
  PY: require('@/assets/wc2026/images/Paraguay.svg'),
  PE: require('@/assets/wc2026/images/USA.svg'),
  NZ: require('@/assets/wc2026/images/New Zeland.svg'),
  RO: require('@/assets/wc2026/images/Romania.svg'),
  AL: require('@/assets/wc2026/images/Albania.svg'),
  BA: require('@/assets/wc2026/images/Bosnia.svg'),
  SK: require('@/assets/wc2026/images/Slovakia.svg'),
  MK: require('@/assets/wc2026/images/North Macedonia.svg'),
  UA: require('@/assets/wc2026/images/Ukraine.svg'),
  BO: require('@/assets/wc2026/images/Bolivia.svg'),
  CZ: require('@/assets/wc2026/images/Czech Republic.svg'),
  NIR: require('@/assets/wc2026/images/Northern Ireland.svg'),
  NC: require('@/assets/wc2026/images/New Caledonia.svg'),
  SR: require('@/assets/wc2026/images/Suriname.svg'),
  IQ: require('@/assets/wc2026/images/Iraq.svg'),
  TR: require('@/assets/wc2026/images/Turkey.svg'),
  IE: require('@/assets/wc2026/images/Ireland.svg'),
  WAL: require('@/assets/wc2026/images/Wales.svg'),
  CD: require('@/assets/wc2026/images/DR Congo.svg'),
  XK: require('@/assets/wc2026/images/Kosovo.svg'),
  TBD_UEFA_A: require('@/assets/wc2026/images/USA.svg'),
  TBD_UEFA_B: require('@/assets/wc2026/images/USA.svg'),
  TBD_UEFA_C: require('@/assets/wc2026/images/USA.svg'),
  TBD_UEFA_D: require('@/assets/wc2026/images/USA.svg'),
  TBD_IC_2: require('@/assets/wc2026/images/USA.svg'),
  TBD_PLAYOFF_1: require('@/assets/wc2026/images/USA.svg'),
};

const defaultImage: ImageSource = require('@/assets/wc2026/images/USA.svg');

/**
 * Resolve bundled circular flag artwork for a team country code.
 * Falls back to USA artwork when unknown (same behaviour as the WC app).
 */
export function getTeamImage(countryCode: string, countryName?: string): ImageSource {
  let key = normalizeCountryCode(countryCode);
  if (!imageMap[key] && countryName) {
    const n = countryName.toLowerCase();
    if (n.includes('curaçao') || n.includes('curacao')) {
      key = 'CW';
    }
  }
  return imageMap[key] ?? defaultImage;
}
