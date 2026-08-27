/** Racecourse catalog for competition setup (Ireland + Britain). */

export const IRISH_COURSES = [
  'Ballinrobe',
  'Bellewstown',
  'Clonmel',
  'Cork',
  'The Curragh',
  'Down Royal',
  'Downpatrick',
  'Dundalk',
  'Fairyhouse',
  'Galway',
  'Gowran Park',
  'Kilbeggan',
  'Killarney',
  'Laytown',
  'Leopardstown',
  'Limerick',
  'Listowel',
  'Naas',
  'Navan',
  'Punchestown',
  'Roscommon',
  'Sligo',
  'Thurles',
  'Tipperary',
  'Tramore',
  'Wexford',
].sort((a, b) => a.localeCompare(b));

export const ENGLAND_COURSES = [
  'Aintree',
  'Ascot',
  'Bath',
  'Beverley',
  'Brighton',
  'Carlisle',
  'Cartmel',
  'Catterick Bridge',
  'Chelmsford City',
  'Cheltenham',
  'Chester',
  'Doncaster',
  'Epsom Downs',
  'Exeter',
  'Fakenham',
  'Fontwell Park',
  'Goodwood',
  'Great Yarmouth',
  'Haydock Park',
  'Hereford',
  'Hexham',
  'Huntingdon',
  'Kempton Park',
  'Leicester',
  'Lingfield Park',
  'Ludlow',
  'Market Rasen',
  'Newbury',
  'Newcastle',
  'Newmarket',
  'Newton Abbot',
  'Nottingham',
  'Plumpton',
  'Pontefract',
  'Redcar',
  'Ripon',
  'Salisbury',
  'Sandown Park',
  'Sedgefield',
  'Southwell',
  'Stratford-on-Avon',
  'Taunton',
  'Thirsk',
  'Uttoxeter',
  'Warwick',
  'Wetherby',
  'Wincanton',
  'Windsor',
  'Wolverhampton',
  'Worcester',
  'York',
].sort((a, b) => a.localeCompare(b));

export const RACING_COURSES = [...IRISH_COURSES, ...ENGLAND_COURSES];

export type RacingCourseRegion = 'all' | 'ireland' | 'england';

export function coursesForRegion(region: RacingCourseRegion): string[] {
  if (region === 'ireland') return IRISH_COURSES;
  if (region === 'england') return ENGLAND_COURSES;
  return RACING_COURSES;
}

/** Festival end date from start + length in days (inclusive). */
export function festivalEndDateFromStart(startYmd: string, dayCount: number): string {
  const days = Math.max(1, Math.floor(dayCount));
  const d = new Date(`${startYmd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return startYmd;
  d.setUTCDate(d.getUTCDate() + (days - 1));
  return d.toISOString().slice(0, 10);
}
