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

function moon(ctx: Ctx, mx: number, my: number, r: number, light: string, shade: string): void {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= r * r) px(ctx, mx + dx, my + dy, d > r * r * 0.72 ? shade : light);
    }
  }
}

function stars(ctx: Ctx, rng: Rng, W: number, H: number, upTo: number, colors: string[]): void {
  const count = Math.round((W * H) / 600);
  for (let i = 0; i < count; i++) px(ctx, int(rng, 0, W - 1), int(rng, 0, Math.round(H * upTo)), pick(rng, colors));
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
  stars(ctx, rng, W, H, 0.55, ['#c9d6ff', '#8fa3d6', '#ffffff']);
  moon(ctx, Math.round(W * 0.82), Math.round(H * 0.3), Math.max(5, Math.round(H * 0.08)), '#e8e6d0', '#c8c6b0');
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

// ─── Болота ────────────────────────────────────────────────────────────────

function deadTree(ctx: Ctx, rng: Rng, x: number, base: number, h: number, color: string): void {
  rect(ctx, x, base - h, 2, h, color);
  const branches = int(rng, 2, 4);
  for (let i = 0; i < branches; i++) {
    const y = base - h + int(rng, 2, Math.max(3, Math.round(h * 0.6)));
    const len = int(rng, 3, 7);
    const dir = next(rng) < 0.5 ? -1 : 1;
    rect(ctx, dir < 0 ? x - len : x + 2, y, len, 1, color);
    px(ctx, dir < 0 ? x - len : x + 1 + len, y - 1, color);
  }
}

function drawSwamp(ctx: Ctx, rng: Rng, W: number, H: number): void {
  for (let y = 0; y < H; y++) rect(ctx, 0, y, W, 1, lerpColor('#0a1410', '#1c2e22', y / H));
  stars(ctx, rng, W, H, 0.4, ['#8fa38f', '#c9d6c0']);
  moon(ctx, Math.round(W * 0.16), Math.round(H * 0.26), Math.max(4, Math.round(H * 0.07)), '#cfe0b0', '#a8b890');
  // туман полосами
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(140,180,140,0.07)';
    ctx.fillRect(0, Math.round(H * (0.45 + i * 0.09)) + int(rng, -2, 2), W, Math.max(2, Math.round(H * 0.05)));
  }
  const waterY = Math.round(H * 0.74);
  for (let x = -4; x < W + 6; x += int(rng, 18, 32)) deadTree(ctx, rng, x, waterY, int(rng, Math.round(H * 0.3), Math.round(H * 0.55)), '#0b160f');
  // вода с бликами
  rect(ctx, 0, waterY, W, H - waterY, '#10261c');
  for (let y = waterY + 1; y < H; y += 3) {
    const shift = int(rng, 0, 12);
    for (let x = shift; x < W; x += int(rng, 10, 22)) rect(ctx, x, y, int(rng, 3, 8), 1, y % 2 === 0 ? '#1c3a2a' : '#173324');
  }
  // отражение луны
  for (let y = waterY + 1; y < H; y += 2) rect(ctx, Math.round(W * 0.16) - int(rng, 1, 3), y, int(rng, 2, 5), 1, '#3a5a3a');
  // кувшинки и камыши
  for (let i = 0; i < Math.round(W / 24); i++) rect(ctx, int(rng, 0, W - 4), int(rng, waterY + 2, H - 2), 3, 1, '#2f5a3a');
  for (let i = 0; i < Math.round(W / 7); i++) {
    const x = int(rng, 0, W - 1);
    const len = int(rng, 5, Math.max(6, Math.round(H * 0.16)));
    rect(ctx, x, waterY - len, 1, len + 2, '#2a4a2a');
    rect(ctx, x, waterY - len - 2, 1, 2, '#5a6a3a');
  }
  // светлячки
  for (let i = 0; i < Math.round(W / 12); i++) px(ctx, int(rng, 0, W - 1), int(rng, Math.round(H * 0.35), waterY - 2), pick(rng, ['#c8ff70', '#e0ff90', '#a0e060']));
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

// ─── Осквернённый улей ─────────────────────────────────────────────────────

function hexCell(ctx: Ctx, x: number, y: number, color: string): void {
  rect(ctx, x + 2, y, 8, 1, color);
  rect(ctx, x + 1, y + 1, 10, 6, color);
  rect(ctx, x + 2, y + 7, 8, 1, color);
}

function drawHive(ctx: Ctx, rng: Rng, W: number, H: number): void {
  rect(ctx, 0, 0, W, H, '#150c1c');
  const floorY = Math.round(H * 0.8);
  const cw = 12;
  const ch = 9;
  for (let row = 0, y = -4; y < floorY; row++, y += ch) {
    const offset = (row % 2) * 6;
    for (let x = -offset - 12; x < W; x += cw) {
      const r = next(rng);
      const color = r < 0.08 ? '#a07020' : r < 0.2 ? '#2a1a30' : r < 0.6 ? '#3a2818' : '#4a3520';
      hexCell(ctx, x, y, color);
      if (r < 0.08) px(ctx, x + int(rng, 3, 8), y + int(rng, 2, 5), '#e0ff60');
      else if (r > 0.9) px(ctx, x + int(rng, 3, 8), y + int(rng, 2, 5), '#1a1020');
    }
  }
  // слизь свисает сверху
  for (let i = 0; i < Math.round(W / 14); i++) {
    const x = int(rng, 0, W - 1);
    const len = int(rng, 3, Math.max(4, Math.round(H * 0.16)));
    rect(ctx, x, 0, 1, len, '#7a4a9a');
    px(ctx, x, len, '#c080d0');
  }
  // свечение сот
  ctx.fillStyle = 'rgba(200,160,40,0.06)';
  ctx.fillRect(0, Math.round(H * 0.2), W, Math.round(H * 0.4));
  // хитиновый пол
  rect(ctx, 0, floorY, W, H - floorY, '#24162a');
  for (let i = 0; i < Math.round(W / 4); i++) {
    const x = int(rng, 0, W - 3);
    const y = int(rng, floorY + 1, H - 2);
    rect(ctx, x, y, int(rng, 2, 4), 1, pick(rng, ['#34203c', '#3c2444', '#1c1022']));
  }
  for (let i = 0; i < 5; i++) {
    const x = int(rng, 4, W - 6);
    rect(ctx, x, floorY - 2, 3, 2, '#c0b0d0');
    px(ctx, x + 1, floorY - 3, '#e0d0e8');
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

// ─── Пиратский корабль ─────────────────────────────────────────────────────

function drawShip(ctx: Ctx, rng: Rng, W: number, H: number): void {
  for (let y = 0; y < H; y++) rect(ctx, 0, y, W, 1, lerpColor('#060a18', '#111c34', y / H));
  stars(ctx, rng, W, H, 0.5, ['#c9d6ff', '#ffffff', '#8fa3d6']);
  moon(ctx, Math.round(W * 0.78), Math.round(H * 0.22), Math.max(4, Math.round(H * 0.06)), '#e8e6d0', '#c8c6b0');
  const seaY = Math.round(H * 0.56);
  const deckY = Math.round(H * 0.74);
  // море
  rect(ctx, 0, seaY, W, deckY - seaY, '#0c1a34');
  for (let y = seaY + 1; y < deckY; y += 2) {
    for (let x = int(rng, 0, 8); x < W; x += int(rng, 9, 18)) rect(ctx, x, y, int(rng, 2, 6), 1, y % 4 === 1 ? '#1c3a5a' : '#152c48');
  }
  for (let y = seaY + 1; y < deckY; y += 2) rect(ctx, Math.round(W * 0.78) - int(rng, 1, 3), y, int(rng, 2, 4), 1, '#5a6a7a');
  // мачта и парус
  const mastX = Math.round(W * 0.3);
  rect(ctx, mastX + 4, Math.round(H * 0.08), 38, Math.round(H * 0.42), '#d8d0b8');
  for (let y = Math.round(H * 0.08); y < Math.round(H * 0.5); y += 4) rect(ctx, mastX + 4, y, 38, 1, '#b8b0a0');
  rect(ctx, mastX + 4, Math.round(H * 0.08), 38, 1, '#8a7a60');
  rect(ctx, mastX, 0, 4, deckY, '#4a2e18');
  rect(ctx, mastX + 1, 0, 1, deckY, '#6a4a2a');
  rect(ctx, mastX - 8, Math.round(H * 0.07), 20, 2, '#4a2e18');
  // такелаж
  for (let k = 0; k < 2; k++) {
    const x0 = mastX + 2;
    const y0 = Math.round(H * 0.08);
    const x1 = k === 0 ? 6 : W - 6;
    const steps = Math.abs(x1 - x0);
    for (let i = 0; i <= steps; i += 2) px(ctx, x0 + ((x1 - x0) * i) / steps, y0 + ((deckY - 4 - y0) * i) / steps, '#8a6a40');
  }
  // перила
  rect(ctx, 0, deckY - 5, W, 1, '#6a4a2a');
  for (let x = 2; x < W; x += 12) rect(ctx, x, deckY - 5, 2, 5, '#3a2412');
  // палуба
  rect(ctx, 0, deckY, W, H - deckY, '#5a3a20');
  for (let y = deckY; y < H; y += 5) {
    rect(ctx, 0, y, W, 1, '#3a2412');
    for (let x = int(rng, 0, 20); x < W; x += int(rng, 24, 40)) {
      rect(ctx, x, y + 1, 1, 4, '#3a2412');
      px(ctx, x + 2, y + 2, '#2a1a0c');
    }
  }
  for (let i = 0; i < Math.round(W / 10); i++) px(ctx, int(rng, 0, W - 1), int(rng, deckY + 1, H - 1), pick(rng, ['#6a4a2a', '#4a2e18']));
  // фонарь
  const lx = Math.round(W * 0.9);
  const ly = deckY - 14;
  ctx.fillStyle = 'rgba(255,170,60,0.12)';
  ctx.fillRect(lx - 9, ly - 8, 20, 22);
  rect(ctx, lx, ly, 3, 5, '#3a2412');
  px(ctx, lx + 1, ly + 2, '#ffd166');
  px(ctx, lx + 1, ly - 1, '#6a4a2a');
}

const DRAWERS: Record<LocationId, (ctx: Ctx, rng: Rng, W: number, H: number) => void> = {
  forest: drawForest,
  swamp: drawSwamp,
  crypt: drawCrypt,
  hive: drawHive,
  caves: drawCaves,
  ship: drawShip,
};

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
  DRAWERS[id](ctx, rng, W, H);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

/** Инлайн-стиль с фоном локации и затемнением поверх. */
export function backgroundStyle(id: LocationId, darken: number, variant: BgVariant = 'tall'): string {
  return `background-image:linear-gradient(rgba(11,11,18,${darken}),rgba(11,11,18,${darken})),url(${locationBackground(id, variant)});background-size:cover;background-position:center;image-rendering:pixelated;`;
}
