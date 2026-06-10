/** Seedable PRNG (mulberry32) so headless tests are deterministic. */

let state = (Math.floor(Math.random() * 2 ** 31) ^ 0x9e3779b9) >>> 0;

export function seedRng(seed: number): void {
  state = seed >>> 0;
}

export function rnd(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [a, b] inclusive. */
export function rndInt(a: number, b: number): number {
  return a + Math.floor(rnd() * (b - a + 1));
}

/** Float in [a, b). */
export function rndf(a: number, b: number): number {
  return a + rnd() * (b - a);
}

export function chance(p: number): boolean {
  return rnd() < p;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Weighted pick: items paired with positive weights. */
export function pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let roll = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}
