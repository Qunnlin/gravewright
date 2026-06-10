/** Number formatting for incremental-scale values. */

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n < 1000) {
    if (Number.isInteger(n)) return String(n);
    return n < 10 ? n.toFixed(1) : String(Math.floor(n));
  }
  let tier = Math.floor(Math.log10(n) / 3);
  if (tier >= SUFFIXES.length) {
    return n.toExponential(2).replace('e+', 'e');
  }
  const scaled = n / Math.pow(10, tier * 3);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return scaled.toFixed(digits) + SUFFIXES[tier];
}

export function fmtInt(n: number): string {
  return fmt(Math.floor(n));
}

/** "+15%" style helper. */
export function fmtPct(mult: number): string {
  return `${mult >= 0 ? '+' : ''}${Math.round(mult * 100)}%`;
}

/** Multiplier like "x2.50". */
export function fmtMult(m: number): string {
  return '×' + (m >= 100 ? fmt(m) : m.toFixed(2).replace(/\.?0+$/, ''));
}

export function fmtTime(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
