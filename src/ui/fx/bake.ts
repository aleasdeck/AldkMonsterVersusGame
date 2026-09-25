import { Painter, type Model, type Style } from '../mobs/pixel';
import { MOB_STYLE } from '../mobs/styles';

/**
 * Лепка эффектов (v0.52.7): кадры эффекта рисует тот же Painter, что лепит врагов, — фигуры, части, свет сверху
 * слева, рамп из пяти тонов, контур и декали, пиксель 2 px поля. Стиль общий с врагами, только контровой свет
 * слабее: эффект не стоит на тёмном фоне, он поверх бойцов.
 *
 * Модуль без DOM до последнего шага: `bakeRgba` отдаёт RGBA-кадры (их считают тесты и tools/fx-sheet.mjs),
 * `bake` кладёт их в холсты для слоя эффектов (layer.ts).
 */
export const FX_STYLE: Style = { ...MOB_STYLE, id: 'fx', rim: 0.3, texture: 0.7 };

/** Единиц поля на клетку холста эффектов: сетка эффектов совпадает с сеткой лепки и фонов. */
export const CELL = FX_STYLE.d;

export interface RgbaFrame { px: Uint8ClampedArray; W: number; H: number }
/** Кадр эффекта на холсте: картинка и якорь — клетка, которая встаёт в точку эффекта. */
export interface FxFrame { c: HTMLCanvasElement; W: number; H: number; ax: number; ay: number }

export interface BakeOpts {
  /** Растворение по кадрам, 0..1 (fade[i] — доля погасших клеток i-го кадра). */
  fade?: number[];
  /** Прозрачность всего клипа: газ и пар чуть просвечивают. */
  alpha?: number;
}

// ─── Шум и мелочи ───────────────────────────────────────────────────────────

/** Детерминированный шум клетки 0..1: одно и то же от запуска к запуску, как у лепки врагов. */
export function hashCell(i: number, j: number): number {
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Поток случайных чисел от сида (mulberry32): разброс частиц — от сида эффекта, а не от Math.random. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// ─── Растворение ────────────────────────────────────────────────────────────

/** Сколько растворение «съедает» клетку по её расстоянию до края фигуры: край уходит первым. */
const EDGE = [0, 1, 0.55, 0.2];

/**
 * Пиксельное растворение: клетки гаснут целиком, а не становятся полупрозрачными. Первыми уходят клетки у края
 * фигуры, внутри — вразброс по шуму, поэтому клуб тает, а не покрывается ровной сеткой. Шум не зависит от кадра:
 * клетка, погасшая на меньшем `level`, погасла и на большем.
 */
export function dissolve(px: Uint8ClampedArray, W: number, H: number, level: number): void {
  if (level <= 0) return;
  const dist = new Uint8Array(W * H).fill(9);
  const q: number[] = [];
  for (let k = 0; k < W * H; k++) if (px[k * 4 + 3] === 0) { dist[k] = 0; q.push(k); }
  // Клетки у рамки кадра тоже считаются краем.
  for (let i = 0; i < W; i++) for (const j of [0, H - 1]) { const k = j * W + i; if (dist[k] > 1) { dist[k] = 1; q.push(k); } }
  for (let j = 0; j < H; j++) for (const i of [0, W - 1]) { const k = j * W + i; if (dist[k] > 1) { dist[k] = 1; q.push(k); } }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % W, j = (k / W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= W || b >= H) continue;
      const n = b * W + a;
      if (dist[n] > dist[k] + 1) {
        dist[n] = dist[k] + 1;
        if (dist[n] < 4) q.push(n);
      }
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (px[k * 4 + 3] === 0) continue;
      const t = 0.45 * hashCell(i, j) + 0.55 * (EDGE[dist[k]] ?? 0);
      if (level >= 1 || t > 1 - level) px[k * 4 + 3] = 0;
    }
  }
}

// ─── Запекание ──────────────────────────────────────────────────────────────

/**
 * RGBA-кадры клипа эффекта: `n` кадров, модель рисует в своих координатах вокруг точки (0, 0) — она же якорь.
 * `w`×`h` — рамка в единицах поля (кратно 4, чтобы якорь лёг в клетку), ход клипа `u` 0..1, номер кадра `f`.
 * Земли у эффекта нет: линия земли далеко внизу, затенение у пола не трогает эффект.
 */
export function bakeRgba(w: number, h: number, n: number, draw: (p: Painter, u: number, f: number) => void, o: BakeOpts = {}): RgbaFrame[] {
  const model: Model = { id: 'fx', w, h, ground: 1e5, pad: 0, draw: () => {} };
  const out: RgbaFrame[] = [];
  for (let f = 0; f < n; f++) {
    const u = n > 1 ? f / (n - 1) : 0;
    const p = new Painter(model, FX_STYLE, 0, 'attack', u);
    p.scope(1, w / 2, h / 2, () => draw(p, u, f));
    const px = p.finish();
    dissolve(px, p.W, p.H, o.fade?.[f] ?? 0);
    if (o.alpha !== undefined) for (let k = 3; k < px.length; k += 4) if (px[k] === 255) px[k] = Math.round(255 * o.alpha);
    out.push({ px, W: p.W, H: p.H });
  }
  return out;
}

/** Клип эффекта: рамка в единицах поля, число кадров, лепка кадра и растворение. Его же рисуют тесты и tools/fx-sheet.mjs. */
export interface FxClip {
  w: number;
  h: number;
  n: number;
  draw: (p: Painter, u: number, f: number) => void;
  opts?: BakeOpts;
}

const cache = new Map<string, FxFrame[]>();

/** Кадры клипа на холстах, один раз на ключ: эффект одного вида рисуется за сессию однажды. */
export function bake(key: string, clip: FxClip): FxFrame[] {
  const hit = cache.get(key);
  if (hit) return hit;
  const { w, h } = clip;
  const frames = bakeRgba(w, h, clip.n, clip.draw, clip.opts).map(({ px, W, H }) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(px), W, H), 0, 0);
    return { c, W, H, ax: Math.floor(w / 2 / CELL), ay: Math.floor(h / 2 / CELL) };
  });
  cache.set(key, frames);
  return frames;
}
