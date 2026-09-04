/** Детерминированный PRNG (mulberry32). Состояние хранится в объекте и сериализуется вместе с забегом. */
export interface Rng {
  state: number;
}

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Число в [0, 1). */
export function next(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Целое в [min, max] включительно. */
export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(next(rng) * (max - min + 1));
}

export function chance(rng: Rng, p: number): boolean {
  return next(rng) < p;
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick from empty array');
  return arr[int(rng, 0, arr.length - 1)];
}

export function shuffle<T>(rng: Rng, arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(rng, 0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Взвешенный выбор. */
export function weighted<T>(rng: Rng, items: readonly { item: T; weight: number }[]): T {
  const total = items.reduce((s, it) => s + it.weight, 0);
  if (total <= 0) throw new Error('weighted: total weight is 0');
  let r = next(rng) * total;
  for (const it of items) {
    r -= it.weight;
    if (r < 0) return it.item;
  }
  return items[items.length - 1].item;
}

/** FNV-1a хэш строки в 32-битное число (сиды спрайтов). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
