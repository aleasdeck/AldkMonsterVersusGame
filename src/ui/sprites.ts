import type { SpriteSpec } from '../engine/types';
import { createRng, hashString, next } from '../engine/rng';

/** Общее тело гуманоида (строки 7–15). Символы: . пусто, o контур, s кожа, e глаз, h шлем/волосы, b тело, l ноги, w оружие. */
const BODY = [
  '....obbbbbbo.w..',
  '...obbbbbbbbow..',
  '..osbbbbbbbbsw..',
  '..oobbbbbbbboo..',
  '....obbbbbbo....',
  '....ollllllo....',
  '....oll..llo....',
  '....oll..llo....',
  '...ooo....ooo...',
];

const HEADS: Record<string, string[]> = {
  helmet: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '....ohhhhhho....',
    '....osesseso....',
    '....osssssso....',
    '.....oooooo..w..',
  ],
  hat: [
    '.......oo.......',
    '......ohho......',
    '.....ohhhho.....',
    '...oohhhhhhoo...',
    '....osesseso....',
    '....osssssso....',
    '.....oooooo..w..',
  ],
  hood: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '....ohhhhhho....',
    '....ohesseho....',
    '....ohssssho....',
    '.....oooooo..w..',
  ],
  plume: [
    '.......ww.......',
    '.....oowwoo.....',
    '....ohhhhhho....',
    '....ohhhhhho....',
    '....osesseso....',
    '....ohhhhhho....',
    '.....oooooo..w..',
  ],
  horns: [
    '....w......w....',
    '....woooooow....',
    '....ohhhhhho....',
    '....ohhhhhho....',
    '....osesseso....',
    '....ohhhhhho....',
    '.....oooooo..w..',
  ],
  bare: [
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '....osssssso....',
    '....osesseso....',
    '....osssssso....',
    '.....oooooo..w..',
  ],
  skull: [
    '................',
    '.....oooooo.....',
    '....osssssso....',
    '....osssssso....',
    '....oeesseeo....',
    '....osssssso....',
    '.....oooooo..w..',
  ],
  cap: [
    '..........ww....',
    '.....oooooo.w...',
    '....ohhhhhhow...',
    '....ohhhhhho....',
    '....osesseso....',
    '....osssssso....',
    '.....oooooo..w..',
  ],
  crown: [
    '....w.w..w.w....',
    '....wwwwwwww....',
    '....osssssso....',
    '....osssssso....',
    '....osesseso....',
    '....osssssso....',
    '.....oooooo..w..',
  ],
};

const cache = new Map<string, string>();

export function spriteSize(spec: SpriteSpec): number {
  return spec.type === 'humanoid' ? 16 : (spec.size ?? 16);
}

export function drawGrid(w: number, h: number, colorAt: (x: number, y: number) => string | null): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = colorAt(x, y);
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas.toDataURL();
}

function humanoidUrl(head: string, palette: Record<string, string>): string {
  const rows = [...(HEADS[head] ?? HEADS.bare), ...BODY];
  return drawGrid(16, 16, (x, y) => {
    const ch = rows[y]?.[x] ?? '.';
    if (ch === '.') return null;
    return palette[ch] ?? palette.o ?? '#000';
  });
}

/** Симметричный случайный монстр: 0 пусто, 1 контур, 2 тело, 3 тень, 4 глаз. */
function genBlob(seed: number, size: number): number[][] {
  const rng = createRng(seed);
  const w = size;
  const h = size;
  const half = Math.ceil(w / 2);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const filled: boolean[][] = Array.from({ length: h }, () => Array<boolean>(w).fill(false));
  for (let y = 2; y < h - 2; y++) {
    for (let x = 1; x < half; x++) {
      const dx = (x - cx) / (w / 2);
      const dy = (y - cy) / (h / 2);
      const d = dx * dx + dy * dy;
      const p = d < 0.2 ? 0.95 : d < 0.5 ? 0.7 : d < 0.85 ? 0.35 : 0.05;
      filled[y][x] = next(rng) < p;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const copy = filled.map((r) => r.slice());
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < half; x++) {
        let n = 0;
        if (copy[y - 1][x]) n++;
        if (copy[y + 1][x]) n++;
        if (copy[y][x - 1]) n++;
        const rx = x + 1 < half ? x + 1 : w - 1 - (x + 1);
        if (copy[y][rx]) n++;
        if (copy[y][x] && n < 2) filled[y][x] = false;
        else if (!copy[y][x] && n >= 3) filled[y][x] = true;
      }
    }
  }
  const shade: boolean[][] = Array.from({ length: h }, () => Array<boolean>(w).fill(false));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < half; x++) {
      if (filled[y][x] && y > cy + h * 0.15) shade[y][x] = next(rng) < 0.55;
      else if (filled[y][x]) shade[y][x] = next(rng) < 0.12;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < half; x++) {
      filled[y][w - 1 - x] = filled[y][x];
      shade[y][w - 1 - x] = shade[y][x];
    }
  }
  const g: number[][] = Array.from({ length: h }, () => Array<number>(w).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (filled[y][x]) g[y][x] = shade[y][x] ? 3 : 2;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y][x] !== 0) continue;
      const near =
        (y > 0 && filled[y - 1][x]) ||
        (y < h - 1 && filled[y + 1][x]) ||
        (x > 0 && filled[y][x - 1]) ||
        (x < w - 1 && filled[y][x + 1]);
      if (near) g[y][x] = 1;
    }
  }
  // глаза: первая подходящая строка в верхней трети
  const eyeW = size >= 20 ? 2 : 1;
  outer: for (let y = Math.floor(h * 0.28); y <= Math.floor(h * 0.5); y++) {
    for (const off of [3, 2, 4, 1]) {
      const x = half - off;
      if (x < 1) continue;
      let ok = true;
      for (let i = 0; i < eyeW; i++) if (!filled[y][x + i] || g[y][x + i] === 1) ok = false;
      if (!ok) continue;
      for (let i = 0; i < eyeW; i++) {
        g[y][x + i] = 4;
        g[y][w - 1 - (x + i)] = 4;
      }
      break outer;
    }
  }
  return g;
}

function blobUrl(spec: Extract<SpriteSpec, { type: 'blob' }>, key: string): string {
  const size = spec.size ?? 16;
  const g = genBlob(hashString(spec.seed ?? key), size);
  const colors = [null, spec.palette.outline, spec.palette.body, spec.palette.shade, spec.palette.eye];
  return drawGrid(size, size, (x, y) => colors[g[y][x]] ?? null);
}

export function spriteDataUrl(spec: SpriteSpec, key: string): string {
  const cacheKey = `${key}:${JSON.stringify(spec)}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  const url = spec.type === 'humanoid' ? humanoidUrl(spec.head, spec.palette) : blobUrl(spec, key);
  cache.set(cacheKey, url);
  return url;
}

export function spriteImg(spec: SpriteSpec, key: string, displayPx: number, cls = ''): HTMLImageElement {
  const img = document.createElement('img');
  img.src = spriteDataUrl(spec, key);
  img.width = displayPx;
  img.height = displayPx;
  img.className = `sprite ${cls}`.trim();
  img.draggable = false;
  img.alt = key;
  return img;
}
