/**
 * Format decimal odds (e.g. 6.5) as bookmaker-style fractional odds (e.g. "11/2").
 */
function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/** Convert decimal odds to fractional string, e.g. 6.5 -> "11/2", 2 -> "Evens". */
export function decimalToFractional(decimal: number): string {
  if (!Number.isFinite(decimal) || decimal < 1) return '—';
  if (decimal >= 1000) return `${Math.round(decimal - 1)}/1`;
  const d = Math.round(decimal * 100) / 100;
  if (d <= 1.01) return '1/100';
  if (d < 2) {
    const x = d - 1;
    if (Math.abs(x - 0.5) < 0.01) return '1/2';
    if (Math.abs(x - 0.33) < 0.02) return '1/3';
    if (Math.abs(x - 0.25) < 0.02) return '1/4';
    if (Math.abs(x - 0.2) < 0.02) return '1/5';
    const num = Math.round(x * 100);
    const g = gcd(num, 100);
    return `${num / g}/${100 / g}`;
  }
  if (Math.abs(d - 2) < 0.01) return 'Evens';
  const x = d - 1;
  const num = Math.round(x * 100);
  const den = 100;
  const g = gcd(num, den);
  const n = num / g;
  const denSimplified = den / g;
  if (denSimplified === 1) return `${n}/1`;
  return `${n}/${denSimplified}`;
}
