import type { LocationId } from '../engine/types';
import { createRng, hashString, int, next, pick, type Rng } from '../engine/rng';

/**
 * Фоны локаций рисуются в низком разрешении и растягиваются с pixelated.
 * Две пропорции: wide — поле боя (≈3:1), tall — правая панель карты/награды (≈1.3:1).
 */
export type BgVariant = 'wide' | 'tall';

const SIZES: Record<BgVariant, [number, number]> = {
  wide: [240, 78],
  tall: [240, 184],
};

const cache = new Map<string, string>();

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function px(ctx: Ctx, x: number, y: number, color: string): void {
  rect(ctx, x, y, 1, 1, color);
}

function lerpColor(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ─── Лес ───────────────────────────────────────────────────────────────────

function tree(ctx: Ctx, x: number, base: number, h: number, color: string, trunk?: string): void {
  for (let r = 0; r < h; r++) {
    const half = Math.floor((r / h) * (h * 0.42));
    rect(ctx, x - half, base - h + r, half * 2 + 1, 1, color);
  }
  if (trunk) rect(ctx, x - 1, base, 3, Math.max(3, Math.round(h * 0.12)), trunk);
}

function drawForest(ctx: Ctx, rng: Rng, W: number, H: number): void {
  for (let y = 0; y < H; y++) rect(ctx, 0, y, W, 1, lerpColor('#0a0f1e', '#16263a', y / H));
  const starCount = Math.round((W * H) / 600);
  for (let i = 0; i < starCount; i++) px(ctx, int(rng, 0, W - 1), int(rng, 0, Math.round(H * 0.55)), pick(rng, ['#c9d6ff', '#8fa3d6', '#ffffff']));
  const r = Math.max(5, Math.round(H * 0.08));
  const mx = Math.round(W * 0.82);
  const my = Math.round(H * 0.3);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= r * r) px(ctx, mx + dx, my + dy, d > r * r * 0.72 ? '#c8c6b0' : '#e8e6d0');
    }
  }
  const farBase = Math.round(H * 0.8);
  for (let x = -6; x < W + 10; x += int(rng, 10, 16)) tree(ctx, x, farBase, int(rng, Math.round(H * 0.24), Math.round(H * 0.36)), '#0d1f17');
  const nearBase = Math.round(H * 0.88);
  for (let x = -10; x < W + 10; x += int(rng, 22, 34)) tree(ctx, x, nearBase, int(rng, Math.round(H * 0.36), Math.round(H * 0.52)), '#123322', '#2a1a10');
  rect(ctx, 0, nearBase, W, H - nearBase, '#14301c');
  const grass = Math.round((W * (H - nearBase)) / 8);
  for (let i = 0; i < grass; i++) px(ctx, int(rng, 0, W - 1), int(rng, nearBase, H - 1), pick(rng, ['#1b3d24', '#0f2616', '#1a3620']));
  for (let i = 0; i < Math.round(W / 8); i++) {
    const x = int(rng, 0, W - 1);
    const y = int(rng, nearBase + 1, H - 1);
    px(ctx, x, y, '#2f5a33');
    px(ctx, x, y - 1, '#2f5a33');
  }
}

// ─── Склеп ─────────────────────────────────────────────────────────────────

function pillar(ctx: Ctx, x: number, top: number, bottom: number): void {
  rect(ctx, x, top, 12, bottom - top, '#3a3a4a');
  rect(ctx, x + 2, top, 2, bottom - top, '#4a4a5c');
  rect(ctx, x + 9, top, 2, bottom - top, '#2c2c38');
  rect(ctx, x - 2, top - 3, 16, 4, '#44445a');
  rect(ctx, x - 2, bottom - 2, 16, 4, '#44445a');
}

function torch(ctx: Ctx, x: number, y: number): void {
  ctx.fillStyle = 'rgba(255,150,0,0.10)';
  ctx.fillRect(x - 10, y - 10, 22, 22);
  ctx.fillStyle = 'rgba(255,150,0,0.12)';
  ctx.fillRect(x - 5, y - 5, 12, 12);
  rect(ctx, x, y, 2, 7, '#5a3a1a');
  px(ctx, x, y - 1, '#ff9a00');
  px(ctx, x + 1, y - 1, '#ffd166');
  px(ctx, x, y - 2, '#ff6a00');
  px(ctx, x + 1, y - 3, '#ff9a00');
}

function drawCrypt(ctx: Ctx, rng: Rng, W: number, H: number): void {
  rect(ctx, 0, 0, W, H, '#1a1a24');
  const floorY = Math.round(H * 0.76);
  const bh = 7;
  const bw = 14;
  for (let y = 0; y < floorY; y += bh) {
    const offset = ((y / bh) % 2) * 7;
    for (let x = -offset; x < W; x += bw) {
      const shade = next(rng);
      rect(ctx, x + 1, y + 1, bw - 2, Math.min(bh - 2, floorY - y - 1), shade < 0.15 ? '#24242f' : shade < 0.6 ? '#2b2b3a' : '#30303f');
      if (shade > 0.92) px(ctx, x + int(rng, 2, bw - 3), y + int(rng, 2, bh - 2), '#1a1a24');
    }
  }
  rect(ctx, 0, floorY, W, H - floorY, '#22222c');
  for (let y = floorY; y < H; y += 10) {
    for (let x = ((y - floorY) / 10) % 2 === 0 ? 0 : -10; x < W; x += 20) {
      rect(ctx, x + 1, y + 1, 18, Math.min(8, H - y - 1), next(rng) < 0.5 ? '#26262f' : '#2a2a34');
    }
  }
  const top = Math.round(H * 0.1);
  pillar(ctx, Math.round(W * 0.1), top, floorY);
  pillar(ctx, Math.round(W * 0.84), top, floorY);
  torch(ctx, Math.round(W * 0.33), Math.round(H * 0.3));
  torch(ctx, Math.round(W * 0.66), Math.round(H * 0.3));
  for (let i = 0; i < 6; i++) {
    const x = int(rng, 10, W - 10);
    const y = int(rng, floorY + 2, H - 3);
    rect(ctx, x, y, 3, 1, '#bdb7a6');
    px(ctx, x + 3, y + 1, '#9a9488');
  }
}

// ─── Пещеры огня ───────────────────────────────────────────────────────────

function drawCaves(ctx: Ctx, rng: Rng, W: number, H: number): void {
  rect(ctx, 0, 0, W, H, '#1c0f0c');
  const noise = Math.round((W * H) / 20);
  for (let i = 0; i < noise; i++) px(ctx, int(rng, 0, W - 1), int(rng, 0, H - 1), pick(rng, ['#2a1410', '#241210', '#331a12', '#1a0c0a']));
  for (let x = int(rng, 0, 10); x < W; x += int(rng, 12, 22)) {
    const len = int(rng, Math.round(H * 0.06), Math.round(H * 0.2));
    for (let r = 0; r < len; r++) {
      const half = Math.floor((1 - r / len) * 3);
      rect(ctx, x - half, r, half * 2 + 1, 1, '#120806');
    }
  }
  const baseline = Math.round(H * 0.85);
  ctx.fillStyle = 'rgba(255,100,0,0.10)';
  ctx.fillRect(0, baseline - Math.round(H * 0.16), W, Math.round(H * 0.2));
  for (let x = 0; x < W; x++) {
    const wave = Math.round(Math.sin(x / 9) * 2 + Math.sin(x / 23) * 3);
    const top = baseline + wave;
    for (let y = top; y < H; y++) {
      px(ctx, x, y, y < top + 2 ? '#ffd166' : y < top + 5 ? '#ff9a00' : '#e04d00');
    }
  }
  for (let i = 0; i < Math.round(W / 6); i++) px(ctx, int(rng, 0, W - 1), int(rng, baseline + 2, H - 1), '#ff6a00');
  for (let i = 0; i < Math.round(W / 6); i++) {
    px(ctx, int(rng, 0, W - 1), int(rng, Math.round(H * 0.35), baseline - 4), pick(rng, ['#ff6a00', '#ffb000', '#ff3b00']));
  }
  for (let i = 0; i < 5; i++) {
    let x = int(rng, 10, W - 10);
    let y = int(rng, Math.round(H * 0.2), Math.round(H * 0.6));
    for (let k = 0; k < int(rng, 6, 14); k++) {
      px(ctx, x, y, k % 3 === 0 ? '#ffb000' : '#ff6a00');
      x += int(rng, -1, 1);
      y += 1;
    }
  }
}

export function locationBackground(id: LocationId, variant: BgVariant = 'tall'): string {
  const key = `${id}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [W, H] = SIZES[variant];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const rng = createRng(hashString(key));
  if (id === 'forest') drawForest(ctx, rng, W, H);
  else if (id === 'crypt') drawCrypt(ctx, rng, W, H);
  else drawCaves(ctx, rng, W, H);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

/** Инлайн-стиль с фоном локации и затемнением поверх. */
export function backgroundStyle(id: LocationId, darken: number, variant: BgVariant = 'tall'): string {
  return `background-image:linear-gradient(rgba(11,11,18,${darken}),rgba(11,11,18,${darken})),url(${locationBackground(id, variant)});background-size:cover;background-position:center;image-rendering:pixelated;`;
}
