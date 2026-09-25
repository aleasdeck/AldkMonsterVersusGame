import { heroSheetInfo } from '../heroSprite';
import { mobMaskNow } from '../mobs';
import { CELL } from './bake';

/**
 * Силуэт бойца в клетках холста эффектов (v0.53): латы блока ложатся по нему, поэтому им не нужен свой рисунок
 * на каждого врага. Враг-лепка отдаёт силуэт своего листа (mobs/index.ts хранит его битами), рисованный герой —
 * кадр своего листа, уменьшенный до сетки 2 px. Кадр — тот, что спрайт показывает прямо сейчас: латы идут за дыханием.
 */
export interface Mask {
  /** Левая верхняя клетка силуэта на холсте. */
  x0: number;
  y0: number;
  w: number;
  h: number;
  /** 1 — клетка фигуры, строками по `w`. */
  m: Uint8Array;
}

/** Прямоугольник спрайта в пикселях поля (кадр боя масштабируется целиком — делим на масштаб слоя). */
export interface FieldRect { x: number; y: number; w: number; h: number }

// ─── Враг-лепка ─────────────────────────────────────────────────────────────

/** Пересэмплированные в клетки холста силуэты: по биту кадра и сдвигу спрайта относительно сетки. */
const mobCache = new WeakMap<Uint8Array, Map<string, Uint8Array>>();

function mobMask(el: HTMLElement, r: FieldRect): Mask | null {
  const mm = mobMaskNow(el);
  if (!mm) return null;
  // Союзник-лепка (волк Волчьего свистка) развёрнут к врагам зеркалом CSS — силуэт тоже зеркалим.
  const flip = !!el.closest('.ally');
  const px = r.w / mm.w;
  const x0 = Math.floor(r.x / CELL), y0 = Math.floor(r.y / CELL);
  const w = Math.ceil((r.x + r.w) / CELL) - x0, h = Math.ceil((r.y + r.h) / CELL) - y0;
  const key = `${(r.x - x0 * CELL).toFixed(1)}:${(r.y - y0 * CELL).toFixed(1)}:${px.toFixed(3)}:${w}:${h}:${flip ? 'm' : ''}`;
  let per = mobCache.get(mm.bits);
  if (!per) mobCache.set(mm.bits, (per = new Map()));
  let m = per.get(key);
  if (!m) {
    m = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      const nj = Math.floor(((y0 + j + 0.5) * CELL - r.y) / px);
      if (nj < 0 || nj >= mm.h) continue;
      for (let i = 0; i < w; i++) {
        const si = Math.floor(((x0 + i + 0.5) * CELL - r.x) / px);
        if (si < 0 || si >= mm.w) continue;
        const k = nj * mm.w + (flip ? mm.w - 1 - si : si);
        if (mm.bits[k >> 3] & (1 << (k & 7))) m[j * w + i] = 1;
      }
    }
    per.set(key, m);
  }
  return { x0, y0, w, h, m };
}

// ─── Рисованный герой ───────────────────────────────────────────────────────

const images = new Map<string, HTMLImageElement>();
const heroCache = new Map<string, Uint8Array>();

/** Лист героя картинкой: тот же файл, что уже рисует спрайт, — браузер отдаёт его из кэша. Пока не загружен — null. */
function sheetImage(url: string): HTMLImageElement | null {
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Номер кадра, который показывает спрайт героя: время CSS-анимации его `::before` (steps по кадрам ряда).
 * Одноразовый клип идёт `jump-none` и замирает на последнем кадре, покой крутится.
 */
function heroFrame(el: HTMLElement, frames: number): number {
  const a = el.getAnimations({ subtree: true }).find((x) => x instanceof CSSAnimation);
  if (!a) return 0;
  const dur = Number(a.effect?.getComputedTiming().duration) || 1;
  const t = Math.max(0, Number(a.currentTime ?? 0));
  if (el.classList.contains('once')) return Math.min(frames - 1, Math.floor(t / (dur / frames)));
  return Math.floor(((t % dur) / dur) * frames) % frames;
}

function heroMask(el: HTMLElement, r: FieldRect): Mask | null {
  const info = heroSheetInfo(el.dataset.hero ?? '');
  const img = info ? sheetImage(info.url) : null;
  if (!info || !img) return null;
  const row = Number(el.style.getPropertyValue('--row') || 0);
  const frame = heroFrame(el, info.frames);
  // Ячейка листа рисуется по центру квадрата спрайта в масштабе box / body (heroSprite.ts, .hero-sprite::before).
  const cellPx = (info.cell * r.w) / info.body;
  const n = Math.max(1, Math.round(cellPx / CELL));
  const key = `${info.url}:${row}:${frame}:${n}`;
  let m = heroCache.get(key);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = n;
    c.height = n;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, frame * info.cell, row * info.cell, info.cell, info.cell, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    m = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++) m[k] = d[k * 4 + 3] > 120 ? 1 : 0;
    if (heroCache.size > 200) heroCache.clear();
    heroCache.set(key, m);
  }
  const x0 = Math.round((r.x + r.w / 2 - (n * CELL) / 2) / CELL), y0 = Math.round((r.y + r.h / 2 - (n * CELL) / 2) / CELL);
  return { x0, y0, w: n, h: n, m };
}

/** Силуэт спрайта бойца: лепка врага или союзника, рисованный герой; иначе null (процедурный спрайт — без лат). */
export function fighterMask(el: HTMLElement, r: FieldRect): Mask | null {
  if (el.classList.contains('mob-sheet')) return mobMask(el, r);
  if (el.classList.contains('hero-sprite')) return heroMask(el, r);
  return null;
}

// ─── Кольца вокруг силуэта ──────────────────────────────────────────────────

interface Rings { P: number; W: number; H: number; out: Uint8Array; inn: Uint8Array; nx: Float32Array; ny: Float32Array }
const rings = new WeakMap<Uint8Array, Rings>();
/** Поле вокруг силуэта, клеток: дальше латы и жар не расходятся. */
const PAD = 7;

/** Расстояние от силуэта наружу (1 — контур) и внутрь (1 — крайняя клетка фигуры) и нормаль наружу для света. */
function ringsOf(M: Mask): Rings {
  const hit = rings.get(M.m);
  if (hit) return hit;
  const P = PAD, W = M.w + 2 * P, H = M.h + 2 * P;
  const out = new Uint8Array(W * H).fill(99), inn = new Uint8Array(W * H).fill(99);
  const qo: number[] = [], qi: number[] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = i - P, y = j - P, k = j * W + i;
      const inside = x >= 0 && y >= 0 && x < M.w && y < M.h && M.m[y * M.w + x] === 1;
      if (inside) { out[k] = 0; qo.push(k); } else { inn[k] = 0; qi.push(k); }
    }
  }
  const bfs = (d: Uint8Array, q: number[]): void => {
    for (let h = 0; h < q.length; h++) {
      const k = q[h], i = k % W, j = (k / W) | 0;
      if (d[k] >= 6) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const n = b * W + a;
        if (d[n] > d[k] + 1) { d[n] = d[k] + 1; q.push(n); }
      }
    }
  };
  bfs(out, qo);
  bfs(inn, qi);
  const nx = new Float32Array(W * H), ny = new Float32Array(W * H);
  const f = (q: number): number => (out[q] === 0 ? -inn[q] : out[q]);
  for (let j = 1; j < H - 1; j++) {
    for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      const gx = f(k + 1) - f(k - 1), gy = f(k + W) - f(k - W);
      const l = Math.hypot(gx, gy) || 1;
      nx[k] = gx / l;
      ny[k] = gy / l;
    }
  }
  const r: Rings = { P, W, H, out, inn, nx, ny };
  rings.set(M.m, r);
  return r;
}

/**
 * Обход клеток вокруг силуэта: клетка холста, расстояние наружу (`dOut`, 0 — фигура) и внутрь (`dIn`),
 * освещённость −1..1 (свет сверху слева, как у лепки) и нормаль наружу по x — с какой стороны клетка.
 */
export function eachRing(M: Mask, fn: (x: number, y: number, dOut: number, dIn: number, lit: number, nx: number) => void): void {
  const R = ringsOf(M);
  for (let j = 0; j < R.H; j++) {
    for (let i = 0; i < R.W; i++) {
      const k = j * R.W + i;
      fn(M.x0 - R.P + i, M.y0 - R.P + j, R.out[k], R.inn[k], R.nx[k] * -0.55 + R.ny[k] * -0.83, R.nx[k]);
    }
  }
}

/** Рамка фигуры в клетках холста: где у силуэта ноги, макушка и бока. */
export function maskBounds(M: Mask): { left: number; right: number; top: number; bottom: number } | null {
  let left = Infinity, right = -1, top = Infinity, bottom = -1;
  for (let j = 0; j < M.h; j++) {
    for (let i = 0; i < M.w; i++) {
      if (!M.m[j * M.w + i]) continue;
      left = Math.min(left, i);
      right = Math.max(right, i);
      top = Math.min(top, j);
      bottom = Math.max(bottom, j);
    }
  }
  return right < 0 ? null : { left: M.x0 + left, right: M.x0 + right, top: M.y0 + top, bottom: M.y0 + bottom };
}
