// Черновики «лепки приёмов» со страницы обсуждения (v0.52.6): эффекты боя из того же движка, что враги (pixel.ts), в сетке 2 px.
// В игру не входит: движок эффектов и перенесённые семейства живут в src/ui/fx/, здесь — снимок черновиков для следующих фаз.
// Кадры каждого эффекта лепятся Painter'ом: фигуры, свет, рамп из пяти тонов, контур, декали.
// Движение по полю и частицы (искры, капли, угли) — клетками той же сетки на холсте эффектов.
import { Painter, buildRamp, type Mat, type Model, type Style } from '../../src/ui/mobs/pixel';
import { MOB_STYLE } from '../../src/ui/mobs/styles';

export const FX_STYLE: Style = { ...MOB_STYLE, id: 'fx', rim: 0.3, texture: 0.7 };
const D = 2;

// ─── Кадры ──────────────────────────────────────────────────────────────────

export interface Frame { c: HTMLCanvasElement; W: number; H: number; ax: number; ay: number }

const hashCell = (i: number, j: number): number => {
  let h = Math.imul(i * 374761393 + j * 668265263, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Пиксельное растворение: клетки гаснут целиком, а не становятся прозрачными. Первыми уходят клетки у края
 * фигуры, внутри — вразброс, поэтому клуб тает, а не покрывается ровной сеткой.
 */
function dissolve(px: Uint8ClampedArray, W: number, H: number, level: number): void {
  if (level <= 0) return;
  const dist = new Uint8Array(W * H).fill(9);
  const q: number[] = [];
  for (let k = 0; k < W * H; k++) if (px[k * 4 + 3] === 0) { dist[k] = 0; q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % W, j = (k / W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= W || b >= H) continue;
      const n = b * W + a;
      if (dist[n] > dist[k] + 1) { dist[n] = dist[k] + 1; if (dist[n] < 4) q.push(n); }
    }
  }
  const EDGE = [0, 1, 0.55, 0.2];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (px[k * 4 + 3] === 0) continue;
    const t = 0.45 * hashCell(i, j) + 0.55 * (EDGE[dist[k]] ?? 0);
    if (t > 1 - level) px[k * 4 + 3] = 0;
  }
}

export interface BakeOpts { fade?: number[]; alpha?: number }

/**
 * Клип эффекта: `n` кадров, модель рисует в своих координатах вокруг точки (0, 0) — она же якорь кадра.
 * `w`×`h` — рамка в единицах поля (кратно 4), ход клипа `u` 0..1, номер кадра `f`.
 */
export function bake(w: number, h: number, n: number, draw: (p: Painter, u: number, f: number) => void, o: BakeOpts = {}): Frame[] {
  const model: Model = { id: 'fx', w, h, ground: 1e5, pad: 0, draw: () => {} };
  const out: Frame[] = [];
  for (let f = 0; f < n; f++) {
    const u = n > 1 ? f / (n - 1) : 0;
    const p = new Painter(model, FX_STYLE, 0, 'attack', u);
    p.scope(1, w / 2, h / 2, () => draw(p, u, f));
    const px = p.finish();
    dissolve(px, p.W, p.H, o.fade?.[f] ?? 0);
    if (o.alpha !== undefined) for (let k = 3; k < px.length; k += 4) if (px[k] === 255) px[k] = Math.round(255 * o.alpha);
    const c = document.createElement('canvas');
    c.width = p.W;
    c.height = p.H;
    c.getContext('2d')!.putImageData(new ImageData(px, p.W, p.H), 0, 0);
    out.push({ c, W: p.W, H: p.H, ax: Math.floor(w / 2 / D), ay: Math.floor(h / 2 / D) });
  }
  return out;
}

const cache = new Map<string, Frame[]>();
function baked(key: string, make: () => Frame[]): Frame[] {
  let f = cache.get(key);
  if (!f) cache.set(key, (f = make()));
  return f;
}

// ─── Слой: что эффект просит у сцены ────────────────────────────────────────

/** Боец в клетках холста: центр спрайта, верх и низ фигуры, ширина. */
export interface Body { cx: number; cy: number; top: number; bottom: number; w: number; h: number }
export type Put = (x: number, y: number, color: string, a?: number) => void;
export interface Layer {
  /** Клип кадров: с `at` мс, по `fps`, в точке `pos(t)` (клетки); `loop` — крутить кадры, пока не выйдет `dur`. */
  sprite(frames: Frame[] | ((t: number) => Frame[]), o: { at: number; fps?: number; dur?: number; loop?: boolean; pos: (t: number) => [number, number]; frameAt?: (t: number) => number }): void;
  /** Клетки: частицы, молния, кольца. */
  cells(o: { at: number; dur: number; draw: (put: Put, t: number) => void }): void;
  /** Событие в момент `at` (попадание: цифра, клип урона цели). */
  at(ms: number, fn: () => void): void;
  /** Короткая вспышка спрайта бойца (осветление без размытия). */
  flash(who: 'hero' | number, color: string, ms: number, at: number): void;
  /** Толчок поля целыми пикселями (крик, удар в землю). */
  shake(ms: number, at: number): void;
}

/** Силуэт бойца в клетках холста: маска кадра, который виден сейчас (у героя — текущий кадр покоя). */
export interface Mask { x0: number; y0: number; w: number; h: number; m: Uint8Array }

export interface Scene { layer: Layer; hero: Body; targets: Body[]; all: Body[]; hurt: (i: number) => void; mask?: (who?: 'hero' | number) => Mask | null }

// ─── Детерминированный шум ──────────────────────────────────────────────────

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hexA = (a: number): string => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// ─── Частицы ────────────────────────────────────────────────────────────────

interface Particle { x: number; y: number; vx: number; vy: number; life: number; born: number; colors: string[]; g?: number; floor?: number; size?: number; plus?: boolean; sway?: number }

/** Частицы клетками: скорость в клетках/с, цвет по возрасту (первый — свежий), падение до `floor` и брызг. */
function particles(L: Layer, at: number, list: Particle[], splat?: string): void {
  const dur = Math.max(...list.map((p) => p.born + p.life)) + (splat ? 420 : 0);
  L.cells({
    at, dur,
    draw: (put, t) => {
      for (const p of list) {
        const age = (t - p.born) / 1000;
        if (age < 0) continue;
        const life = p.life / 1000;
        let x = p.x + p.vx * age + (p.sway ? Math.sin(age * 9 + p.x) * p.sway : 0);
        let y = p.y + p.vy * age + 0.5 * (p.g ?? 0) * age * age;
        if (p.floor !== undefined && y >= p.floor) {
          // Капля упала: брызг на полу держится и мигает, потом гаснет.
          const hit = (-p.vy + Math.sqrt(Math.max(0, p.vy * p.vy + 2 * (p.g ?? 0) * (p.floor - p.y)))) / (p.g || 1);
          x = p.x + p.vx * hit;
          const since = age - hit;
          if (!splat || since > 0.42 || (since > 0.3 && Math.floor(since * 24) % 2)) continue;
          put(x - 1, p.floor, splat);
          put(x, p.floor, splat);
          if (since < 0.1) put(x + 1, p.floor - 1, splat);
          continue;
        }
        if (age > life) continue;
        const k = Math.min(p.colors.length - 1, Math.floor((age / life) * p.colors.length));
        const c = p.colors[k];
        put(x, y, c);
        if (p.size && p.size > 1) put(x + 1, y, c);
        if (p.plus && age / life < 0.7) {
          put(x - 1, y, c, 0.6); put(x + 1, y, c, 0.6); put(x, y - 1, c, 0.6); put(x, y + 1, c, 0.6);
        }
      }
    },
  });
}

// ─── Материалы ──────────────────────────────────────────────────────────────

/** Светящийся мазок цвета приёма: рамп из цвета, без контура. */
function glowMat(color: string, spread = 0.5): Mat {
  return { base: color, glow: true, dither: 0, noOutline: true, spread };
}
const SMEAR: Mat = { base: '#dfe6ee', glow: true, dither: 0, noOutline: true, ramp: ['#8d9bb0', '#b3bfce', '#d6dee8', '#eef3f8', '#ffffff'] };
const SMEAR_CORE: Mat = { base: '#ffffff', glow: true, dither: 0, noOutline: true, ramp: ['#e9eef4', '#f4f7fa', '#ffffff', '#ffffff', '#ffffff'] };

const FLAME = {
  outer: { base: '#e83c10', glow: true, dither: 0, ramp: ['#c8300a', '#d8380c', '#e8420e', '#f85414', '#ff6a1a'] } as Mat,
  mid: { base: '#ff8a14', glow: true, dither: 0, ramp: ['#f06a10', '#ff7c14', '#ff8e18', '#ffa21e', '#ffb428'] } as Mat,
  core: { base: '#ffd23a', glow: true, dither: 0, noOutline: true, ramp: ['#ffb82a', '#ffc632', '#ffd23a', '#ffe060', '#ffec90'] } as Mat,
};
const RAGE = {
  outer: { base: '#b3261e', glow: true, dither: 0, ramp: ['#8a1a16', '#a0221a', '#b82c1e', '#d23a22', '#e84c26'] } as Mat,
  mid: { base: '#f25c1f', glow: true, dither: 0, noOutline: true, ramp: ['#d8481a', '#ea561c', '#f8661f', '#ff7d2a', '#ff9638'] } as Mat,
  core: { base: '#ffb347', glow: true, dither: 0, noOutline: true, ramp: ['#ff9d3a', '#ffab40', '#ffbb4c', '#ffcc66', '#ffdc88'] } as Mat,
};
const SMOKE: Mat = { base: '#77717e', tex: { kind: 'noise', scale: 4, amp: 0.1 }, noOutline: true, spread: 0.28 };
const ICE: Mat = { base: '#8fd0ea', shine: 0.9, dither: 0, ramp: ['#24507a', '#3d7fae', '#6cb4dc', '#b2e4f6', '#effcff'] };
const ICE_DARK: Mat = { base: '#4f8fbf', dither: 0, ramp: ['#1b3d63', '#2c5f8e', '#4a88b8', '#7ab4d8', '#b2e4f6'] };
const WOOD: Mat = { base: '#a9824c', dither: 0, spread: 0.3 };
const STEEL: Mat = { base: '#a9b3bf', shine: 0.8, dither: 0 };
const GLASS: Mat = { base: '#b9dfe8', shine: 0.9, dither: 0, ramp: ['#46707c', '#77a7b4', '#a5d2dc', '#d5f1f5', '#ffffff'] };
const CORK: Mat = { base: '#8a6b3f', tex: { kind: 'noise', scale: 2, amp: 0.15 } };
const GOLD: Mat = { base: '#d4a62a', shine: 0.9, dither: 0 };
const STAR: Mat = { base: '#ffd84a', glow: true, dither: 0, ramp: ['#e0a21a', '#f0b624', '#ffc832', '#ffdc5a', '#fff2a8'] };
const STAR_BACK: Mat = { base: '#c8921c', glow: true, dither: 0, ramp: ['#8a5a10', '#a06c14', '#b8801a', '#cc9422', '#dcaa34'] };

// ─── Мазок удара (взмах оружием) ────────────────────────────────────────────

/**
 * Полумесяц мазка: дуга эллипса от `a0` до `a1` (радианы, y вниз), толщина `T` по синусу — тонкие концы,
 * толстая середина. `squash` сплющивает дугу, `rot` поворачивает её наискось.
 */
function crescent(p: Painter, a0: number, a1: number, R: number, T: number, mat: Mat, part: string, squash = 0.8, rot = 0.45): void {
  if (a1 - a0 < 0.05 || T < 0.4) return;
  const N = 16;
  const pts: number[] = [];
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const push = (r: number, th: number): void => {
    const x = r * Math.cos(th), y = r * Math.sin(th) * squash;
    pts.push(x * cr - y * sr, x * sr + y * cr);
  };
  for (let i = 0; i <= N; i++) push(R, lerp(a0, a1, i / N));
  for (let i = N; i >= 0; i--) {
    const k = i / N;
    // Передний край острый, хвост мягче.
    const th = T * Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.08)), 0.7);
    push(R - th, lerp(a0, a1, k));
  }
  p.poly(pts, mat, { part, noLine: true, flat: 1 });
}

/** Точка на дуге мазка — туда же ложится вспышка удара. */
function arcPt(a: number, R: number, squash = 0.8, rot = 0.45): [number, number] {
  const x = R * Math.cos(a), y = R * Math.sin(a) * squash;
  return [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];
}

const A0 = -2.9, A1 = 0.35;

/** Кадры взмаха: начало мазка, полная дуга с белым ядром, хвост уходит, остатки. Край — цвет приёма. */
function slashFrames(R: number, edge: string): Frame[] {
  return baked(`slash:${R}:${edge}`, () => {
    const EDGE = glowMat(edge, 0.35);
    const span = A1 - A0;
    const W = Math.ceil((R * 2 + 16) / 4) * 4;
    return bake(W, W, 5, (p, _u, f) => {
      const stages: Array<[number, number, number, number]> = [
        // от, до, толщина края, толщина ядра
        [0, 0.45, 10, 3],
        [0, 1, 19, 6],
        [0.3, 1, 15, 4],
        [0.62, 1, 10, 2],
        [0.86, 1, 5, 0],
      ];
      const [s0, s1, t, core] = stages[f];
      // Внутри дуги — цвет приёма, к внешнему краю светлеет до белого: так читается движение лезвия.
      crescent(p, A0 + span * s0, A0 + span * s1, R, t, EDGE, 'edge');
      crescent(p, A0 + span * s0 + 0.06, A0 + span * s1, R, t * 0.58, SMEAR, 'smear');
      if (core > 0) crescent(p, A0 + span * (s0 + 0.1), A0 + span * s1 - 0.03, R, core, SMEAR_CORE, 'core');
      // Вспышка удара там, где дуга проходит по центру цели.
      if (f === 1 || f === 2) {
        const [hx, hy] = arcPt(A0 + span * 0.62, R - 3);
        const L = f === 1 ? 9 : 6;
        p.line(hx - L, hy, hx + L, hy, '#ffffff');
        p.line(hx, hy - L * 0.8, hx, hy + L * 0.8, '#ffffff');
        p.line(hx - L * 0.45, hy - L * 0.45, hx + L * 0.45, hy + L * 0.45, edge);
        p.line(hx - L * 0.45, hy + L * 0.45, hx + L * 0.45, hy - L * 0.45, edge);
        p.glow(hx, hy, f === 1 ? 10 : 7, edge, 0.45);
      }
    }, { fade: [0, 0, 0.1, 0.35, 0.65] });
  });
}

/** Искры удара: белые и цвета приёма, разлетаются от точки попадания и гаснут. */
function sparks(L: Layer, at: number, x: number, y: number, color: string, n: number, seed: number, dir = 1): void {
  const r = rng(seed);
  const list: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const a = (r() - 0.5) * 2.4 + (dir > 0 ? -0.3 : Math.PI + 0.3);
    const v = 50 + r() * 70;
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25, g: 160, life: 160 + r() * 140, born: r() * 40, colors: ['#ffffff', color, color] });
  }
  particles(L, at, list);
}

const SLASH_FPS = 12;
const MELEE_MS = 260;

/** Взмах по цели: кадр полной дуги приходится ровно на попадание (как пятый кадр удара у лепки). */
export function slash(S: Scene, o: { edge: string; hitEdge?: string; seed?: number; after?: (at: number) => void }): number {
  const t = S.targets[0];
  const R = Math.round(Math.max(22, Math.min(38, t.h * D * 0.45)) / 2) * 2;
  const frames = slashFrames(R, o.edge);
  const start = MELEE_MS - 1000 / SLASH_FPS;
  S.layer.sprite(frames, { at: start, fps: SLASH_FPS, pos: () => [t.cx, t.cy + 2] });
  const [hx, hy] = arcPt(A0 + (A1 - A0) * 0.62, R - 3);
  sparks(S.layer, MELEE_MS, t.cx + hx / D, t.cy + 2 + hy / D, o.hitEdge ?? o.edge, 7, o.seed ?? 3);
  S.layer.at(MELEE_MS, () => S.hurt(0));
  o.after?.(MELEE_MS);
  return MELEE_MS;
}

/** Капли крови: брызгают из раны от героя, падают на пол и лежат брызгом. */
export function bloodDrops(S: Scene, at: number, i = 0): void {
  const t = S.targets[i];
  const r = rng(11 + i);
  const list: Particle[] = [];
  for (let k = 0; k < 9; k++) {
    list.push({
      x: t.cx + (r() - 0.3) * 4, y: t.cy + (r() - 0.5) * 6,
      vx: 12 + r() * 40, vy: -40 - r() * 45, g: 260, life: 2000, born: r() * 60,
      colors: ['#e63946', '#b3202c', '#8b1a1a'], floor: t.bottom - Math.floor(r() * 3), size: k % 3 === 0 ? 2 : 1,
    });
  }
  particles(S.layer, at, list, '#6e1218');
}

// ─── Стрела ─────────────────────────────────────────────────────────────────

function featherMat(c: string): Mat {
  return { base: c, dither: 0, tex: { kind: 'stripes', scale: 1.5, amp: 0.18, angle: 0.8 } };
}

/** Стрела остриём вправо, повёрнутая на `ang`: древко, стальной наконечник с фаской, оперение цветом оружия. `cut` — сколько древка спереди ушло в цель. */
function arrowShape(p: Painter, ang: number, feather: Mat, flutter: number, cut = 0, quiver = 0): void {
  p.pose({ rot: ang + quiver, px: 0, py: 0 }, () => {
    const front = 10 - cut;
    p.limb(-17, 0, 1, front, 0, 1, WOOD, { part: 'shaft' });
    if (cut < 4) p.poly([8, -3.6, 19, 0, 8, 3.6, 10, 0], STEEL, { part: 'head', bevel: 1.2 });
    p.poly([-18, -0.5, -13, -0.5, -10, -1, -12.5, -3.6 + flutter, -17.5, -3.4 + flutter], feather, { part: 'fl1', flat: 0.6 });
    p.poly([-18, 0.5, -13, 0.5, -10, 1, -12.5, 3.6 - flutter * 0.5, -17.5, 3.4], feather, { part: 'fl2', tone: -0.25, flat: 0.6 });
  });
}

export function arrow(S: Scene, o: { feather: string; seed?: number }): number {
  const h = S.hero, t = S.targets[0];
  const sx = h.cx + h.w * 0.35, sy = h.cy - 2;
  const ex = t.cx - t.w * 0.08, ey = t.cy;
  const ang = Math.atan2(ey - sy, ex - sx);
  const key = `arrow:${o.feather}:${ang.toFixed(2)}`;
  const fm = featherMat(o.feather);
  const fly = baked(key, () => bake(44, 44, 2, (p, _u, f) => arrowShape(p, ang, fm, f ? 1 : 0)));
  const stuck = baked(`${key}:stuck`, () => bake(44, 44, 8, (p, _u, f) => arrowShape(p, ang, fm, 0, 9, [0.16, -0.1, 0.06, -0.03, 0, 0, 0, 0][f]), { fade: [0, 0, 0, 0, 0, 0.3, 0.6, 0.85] }));
  const FLY = 230;
  // Наконечник — на 17 единиц впереди центра рисунка: в полёте ведём точкой острия.
  const tipX = (19 / D) * Math.cos(ang), tipY = (19 / D) * Math.sin(ang);
  S.layer.sprite(fly, { at: 0, fps: 24, loop: true, dur: FLY, pos: (tt) => { const k = tt / FLY; return [lerp(sx, ex, k) - tipX, lerp(sy, ey, k) - tipY]; } });
  // Шлейф: две-три клетки светлой черты позади оперения.
  S.layer.cells({ at: 0, dur: FLY, draw: (put, tt) => {
    const k = tt / FLY;
    const x = lerp(sx, ex, k) - tipX * 2.1, y = lerp(sy, ey, k) - tipY * 2.1;
    for (let i = 1; i <= 5; i++) put(x - Math.cos(ang) * i * 2, y - Math.sin(ang) * i * 2, '#f3ead0', 0.5 - i * 0.08);
  } });
  S.layer.sprite(stuck, { at: FLY, fps: 12, pos: () => [ex - tipX + (9 / D) * Math.cos(ang), ey - tipY + (9 / D) * Math.sin(ang)] });
  sparks(S.layer, FLY + 30, ex, ey, '#c8b890', 5, o.seed ?? 5, -1);
  S.layer.at(FLY + 30, () => S.hurt(0));
  return FLY + 30;
}

// ─── Огонь ──────────────────────────────────────────────────────────────────

function flame(p: Painter, x: number, y: number, r: number, len: number, sway: number, lean = 0, tag = '', M = FLAME): void {
  const tip: [number, number] = [x + lean + sway, y - len];
  const mid: [number, number] = [x + lean * 0.45 - sway * 0.5, y - len * 0.5];
  p.chain([[x, y, r], [mid[0], mid[1], r * 0.62], [tip[0], tip[1], 0.6]], M.outer, { part: `flame${tag}` });
  p.chain([[x, y + r * 0.15, r * 0.66], [mid[0] + 0.3, mid[1] + len * 0.08, r * 0.38], [tip[0] - sway * 0.3, tip[1] + len * 0.28, 0.5]], M.mid, { part: `flameMid${tag}`, noLine: true });
  if (r > 2.2) p.chain([[x, y + r * 0.25, r * 0.36], [mid[0] + 0.3, mid[1] + len * 0.2, r * 0.18]], M.core, { part: `flameCore${tag}`, noLine: true });
}

/** Огненный шар по ходу полёта: ядро впереди, хвост назад (как у плевка Импа, только к врагу). */
function ballShape(p: Painter, ang: number, r: number, tail: number): void {
  p.pose({ rot: ang, px: 0, py: 0 }, () => {
    p.glow(0, 0, r * 2.3, '#ff9a2a', 0.32);
    p.chain([[-tail, 0.5, r * 0.35], [-tail * 0.45, -0.5, r * 0.78], [0, 0, r]], FLAME.outer, { part: 'ball' });
    p.ellipse(0.4, 0, r * 0.7, r * 0.66, FLAME.mid, { part: 'ballMid', noLine: true });
    p.ellipse(1.2, -r * 0.1, r * 0.38, r * 0.36, FLAME.core, { part: 'ballCore', noLine: true });
  });
}

function explosionFrames(): Frame[] {
  return baked('boom', () => bake(80, 80, 8, (p, u, f) => {
    const r = rng(7);
    const rays = Array.from({ length: 9 }, (_, k) => ({ a: (k / 9) * Math.PI * 2 + r() * 0.4, l: 0.7 + r() * 0.5 }));
    const grow = [0.55, 0.9, 1.1, 1.05, 0.85, 0.6, 0.4, 0.2][f];
    if (f <= 4) {
      p.glow(0, 0, 18 * grow + 6, '#ffb428', 0.22);
      // Языки во все стороны — одна часть пламени, дальше ядро.
      for (const ray of rays) {
        const L = (8 + 18 * ray.l) * grow;
        const ex = Math.cos(ray.a) * L, ey = Math.sin(ray.a) * L - f * 2.5;
        p.chain([[0, 0, 7 * grow + 2], [ex * 0.55, ey * 0.55, 4 * grow + 1], [ex, ey, 1]], FLAME.outer, { part: 'boom' });
      }
      p.ellipse(0, -f * 1.2, 12 * grow + 1, 11 * grow + 1, FLAME.outer, { part: 'boom' });
      if (f <= 3) p.ellipse(0, -f * 1.5, 9 * grow, 8 * grow, FLAME.mid, { part: 'boomMid', noLine: true });
      if (f <= 2) p.ellipse(-1, -1 - f * 1.5, 5.5 * grow + 1, 5 * grow + 1, FLAME.core, { part: 'boomCore', noLine: true });
    }
    // Дым поднимается клубами одной поверхности: мягкий максимум слепляет их в тучу.
    if (f >= 2) {
      const k = (f - 2) / 5;
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 8 + Math.sin(i * 2.1) * 3;
        const y = -10 - k * 22 - (i % 2) * 5;
        const rr = 5 + k * 5 + (i % 2) * 2;
        p.ellipse(x, y, rr * 1.15, rr * 0.85, SMOKE, { part: 'smoke', flat: 0.3 });
      }
    }
    if (f >= 3 && f <= 6) for (let i = 0; i < 6; i++) p.px(Math.cos(i * 1.7) * (14 + f * 3), -f * 4 - i * 2, i % 2 ? '#ffd23a' : '#ff7b00');
    void u;
  }, { fade: [0, 0, 0, 0, 0.15, 0.4, 0.62, 0.85] }));
}

/** Горение на цели: три языка у ног, дрожат по кадрам. */
function burnFrames(w: number): Frame[] {
  const W = Math.ceil((w * D + 20) / 4) * 4;
  return baked(`burn:${W}`, () => bake(W, 44, 12, (p, _u, f) => {
    const xs = [-W * 0.22, 0, W * 0.2];
    const sw = [[1.4, -1, 0.6, -1.2], [-1, 1.2, -0.4, 0.9], [0.8, -0.6, 1.3, -1]];
    const grow = [0.5, 0.85, 1, 1, 1, 1, 1, 1, 0.9, 0.8, 0.65, 0.5][f];
    xs.forEach((x, i) => flame(p, x, 18, 3.4 * grow + 0.4, (12 + i * 3 - (i === 1 ? -3 : 0)) * grow, sw[i][f % 4], -0.5, String(i)));
  }, { fade: [0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8] }));
}

export function fireball(S: Scene, o: { burn?: boolean } = {}): number {
  const h = S.hero, t = S.targets[0];
  const sx = h.cx + h.w * 0.35, sy = h.cy - 6, ex = t.cx, ey = t.cy;
  const ang = Math.atan2(ey - sy, ex - sx);
  const fly = baked(`ball:${ang.toFixed(2)}`, () => bake(56, 56, 4, (p, _u, f) => ballShape(p, ang, [7, 7.6, 6.8, 7.3][f], [14, 16, 13, 15][f])));
  const FLY = 300;
  const pos = (tt: number): [number, number] => { const k = Math.pow(tt / FLY, 1.35); return [lerp(sx, ex, k), lerp(sy, ey, k)]; };
  S.layer.sprite(fly, { at: 0, fps: 12, loop: true, dur: FLY, pos });
  // Угли позади шара: жёлтые остывают до тёмно-красных и поднимаются.
  const r = rng(21);
  const embers: Particle[] = [];
  for (let k = 0; k < 16; k++) {
    const born = (k / 16) * FLY;
    const [x, y] = pos(born);
    embers.push({ x: x - 5, y: y + (r() - 0.5) * 6, vx: -10 - r() * 20, vy: -12 - r() * 22, life: 200 + r() * 160, born, colors: ['#ffec90', '#ffb428', '#f85414', '#8a2a14'] });
  }
  particles(S.layer, 0, embers);
  S.layer.sprite(explosionFrames(), { at: FLY, fps: 12, pos: () => [ex, ey] });
  S.layer.flash(0, '#ff9a2a', 160, FLY);
  if (o.burn) S.layer.sprite(burnFrames(t.w), { at: FLY + 120, fps: 12, pos: () => [t.cx, t.bottom - 11] });
  S.layer.at(FLY, () => S.hurt(0));
  return FLY;
}

// ─── Лёд ────────────────────────────────────────────────────────────────────

function shardShape(p: Painter, ang: number, glint: number): void {
  p.pose({ rot: ang, px: 0, py: 0 }, () => {
    p.glow(4, 0, 16, '#7fd7ff', 0.22);
    p.poly([20, 0, 8, -7, -9, -5.5, -17, 0, -9, 5.5, 8, 7], ICE, { part: 'ice', bevel: 1.6 });
    p.poly([20, 0, 8, 7, -9, 5.5, -17, 0, -9, 0.5, 8, 0.5], ICE_DARK, { part: 'ice', paint: true });
    p.line(-9, -2.5, 14, -1.5, '#ffffffcc');
    p.px(lerp(-6, 14, glint), -3, '#ffffff');
  });
}

function shatterFrames(): Frame[] {
  return baked('shatter', () => bake(72, 72, 7, (p, u) => {
    const r = rng(33);
    // Осколки летят вперёд и вверх, кувыркаются и падают.
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI * 0.95 + (i / 7) * Math.PI * 1.25 + (r() - 0.5) * 0.3;
      const d0 = 3 + (18 + r() * 12) * Math.pow(u, 0.7);
      const x = Math.cos(a) * d0 + 4, y = Math.sin(a) * d0 + 26 * u * u;
      const s = 2.2 + r() * 1.6, rot = a + u * (4 + r() * 5);
      const c = Math.cos(rot), sn = Math.sin(rot);
      const tri = [[s * 1.6, 0], [-s, -s * 0.8], [-s * 0.6, s * 0.9]];
      p.poly(tri.flatMap(([px, py]) => [x + px * c - py * sn, y + px * sn + py * c]), ICE, { part: `sh${i}`, bevel: 0.8 });
    }
    // Иней вспышкой: восемь лучей расходятся и тают.
    if (u < 0.6) {
      const k = u / 0.6;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r0 = 3 + 12 * k, r1 = r0 + 7 * (1 - k) + 2;
        p.line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, i % 2 ? '#bfefff' : '#ffffff');
      }
      p.glow(0, 0, 14 * (1 - k) + 6, '#7fd7ff', 0.35);
    }
    if (u === 0) { p.line(-4, 0, 4, 0, '#ffffff'); p.line(0, -4, 0, 4, '#ffffff'); }
  }, { fade: [0, 0, 0, 0, 0.25, 0.55, 0.8] }));
}

/** Иней у ног цели: кристаллы нарастают из пола и тают. */
function rimeFrames(w: number): Frame[] {
  const W = Math.ceil((w * D + 16) / 4) * 4;
  return baked(`rime:${W}`, () => bake(W, 44, 10, (p, _u, f) => {
    const r = rng(41);
    const grow = [0.3, 0.7, 1, 1, 1, 1, 1, 1, 1, 1][f];
    for (let i = 0; i < 6; i++) {
      const x = (i / 5 - 0.5) * (W - 24) + (r() - 0.5) * 5;
      const hgt = (12 + r() * 12) * grow;
      const lean = (r() - 0.5) * 7;
      p.poly([x - 4, 14, x - 1.5 + lean * 0.4, 14 - hgt * 0.6, x + lean, 14 - hgt, x + 1.5 + lean * 0.5, 14 - hgt * 0.5, x + 4, 14], ICE, { part: 'rime', bevel: 1 });
    }
    p.ellipse(0, 14, W / 2 - 8, 2.2, ICE_DARK, { part: 'rimeBase', flat: 0.8 });
  }, { fade: [0, 0, 0, 0, 0, 0, 0.2, 0.45, 0.65, 0.85] }));
}

export function iceShard(S: Scene): number {
  const h = S.hero, t = S.targets[0];
  const sx = h.cx + h.w * 0.35, sy = h.cy - 6, ex = t.cx - 2, ey = t.cy;
  const ang = Math.atan2(ey - sy, ex - sx);
  const fly = baked(`shard:${ang.toFixed(2)}`, () => bake(56, 56, 3, (p, u) => shardShape(p, ang, u)));
  const FLY = 280;
  const pos = (tt: number): [number, number] => { const k = tt / FLY; return [lerp(sx, ex, k), lerp(sy, ey, k)]; };
  S.layer.sprite(fly, { at: 0, fps: 12, loop: true, dur: FLY, pos });
  const r = rng(31);
  const frost: Particle[] = [];
  for (let k = 0; k < 12; k++) {
    const born = (k / 12) * FLY;
    const [x, y] = pos(born);
    frost.push({ x: x - 6, y: y + (r() - 0.5) * 6, vx: -6 - r() * 8, vy: (r() - 0.5) * 12, life: 220 + r() * 140, born, colors: ['#ffffff', '#bfefff', '#7fd7ff'], plus: k % 3 === 0 });
  }
  particles(S.layer, 0, frost);
  S.layer.sprite(shatterFrames(), { at: FLY, fps: 12, pos: () => [ex, ey] });
  S.layer.flash(0, '#bfefff', 140, FLY);
  // Холод: снежинки опускаются на цель, у ног нарастает иней.
  const flakes: Particle[] = [];
  for (let k = 0; k < 7; k++) flakes.push({ x: t.cx + (r() - 0.5) * t.w * 0.8, y: t.top + r() * t.h * 0.3, vx: 0, vy: 14 + r() * 8, sway: 1.2, life: 700 + r() * 300, born: 80 + k * 70, colors: ['#ffffff', '#e0f7ff', '#bfefff', '#7fd7ff'], plus: true });
  particles(S.layer, FLY, flakes);
  S.layer.sprite(rimeFrames(t.w), { at: FLY + 100, fps: 12, pos: () => [t.cx, t.bottom - 7] });
  S.layer.at(FLY, () => S.hurt(0));
  return FLY;
}

// ─── Молния ─────────────────────────────────────────────────────────────────

function boltPath(ax: number, ay: number, bx: number, by: number, seed: number): Array<[number, number]> {
  const r = rng(seed);
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(4, Math.round(len / 7));
  const nx = -(by - ay) / len, ny = (bx - ax) / len;
  const pts: Array<[number, number]> = [[ax, ay]];
  for (let i = 1; i < n; i++) {
    const k = i / n;
    const j = (r() - 0.5) * 2 * Math.min(6, 2 + len * 0.04) * Math.sin(Math.PI * k);
    pts.push([lerp(ax, bx, k) + nx * j, lerp(ay, by, k) + ny * j]);
  }
  pts.push([bx, by]);
  return pts;
}

function lineCells(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void): void {
  let x = Math.round(x0), y = Math.round(y0);
  const x2 = Math.round(x1), y2 = Math.round(y1);
  const dx = Math.abs(x2 - x), dy = -Math.abs(y2 - y);
  const sx = x < x2 ? 1 : -1, sy = y < y2 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x, y);
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

function zapFrames(): Frame[] {
  return baked('zap', () => bake(40, 40, 4, (p, u) => {
    const r = rng(9);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + r() * 0.5;
      const r0 = 2 + u * 6, r1 = r0 + 7 * (1 - u) + 2;
      const mx = Math.cos(a + 0.35) * (r0 + r1) * 0.5, my = Math.sin(a + 0.35) * (r0 + r1) * 0.5;
      p.line(Math.cos(a) * r0, Math.sin(a) * r0, mx, my, '#fff6b0');
      p.line(mx, my, Math.cos(a) * r1, Math.sin(a) * r1, '#ffe45c');
    }
    p.glow(0, 0, 12 * (1 - u) + 4, '#ffe45c', 0.4);
    if (u < 0.4) p.disc(0, 0, 2.2, '#ffffff');
  }, { fade: [0, 0, 0.35, 0.7] }));
}

export function chainLightning(S: Scene): number {
  const h = S.hero;
  const hand: [number, number] = [h.cx + h.w * 0.3, h.cy - h.h * 0.12];
  const chain = [hand, ...S.all.map((b) => [b.cx, b.cy - 2] as [number, number])];
  const STEP = 70, LIFE = 230;
  for (let i = 0; i + 1 < chain.length; i++) {
    const [a, b] = [chain[i], chain[i + 1]];
    const at = i * STEP;
    S.layer.cells({ at, dur: LIFE, draw: (put, tt) => {
      // Каждые 50 мс — новый излом, как у настоящей дуги.
      const v = Math.floor(tt / 50);
      const pts = boltPath(a[0], a[1], b[0], b[1], 100 + i * 17 + v * 3);
      const fade = tt > LIFE - 70 ? (LIFE - tt) / 70 : 1;
      const glow = new Set<string>();
      for (let k = 0; k + 1 < pts.length; k++) lineCells(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], (x, y) => {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) glow.add(`${x + dx},${y + dy}`);
      });
      for (const g of glow) { const [x, y] = g.split(',').map(Number); put(x, y, '#ffe45c', 0.4 * fade); }
      for (let k = 0; k + 1 < pts.length; k++) lineCells(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], (x, y) => put(x, y, (x + y) % 3 ? '#fff6b0' : '#ffffff', fade));
      // Отросток с середины дуги.
      const m = pts[Math.floor(pts.length / 2)];
      const fork = boltPath(m[0], m[1], m[0] + 6, m[1] - 9 + (v % 2) * 16, 300 + v);
      for (let k = 0; k + 1 < fork.length - 1; k++) lineCells(fork[k][0], fork[k][1], fork[k + 1][0], fork[k + 1][1], (x, y) => put(x, y, '#ffe45c', 0.8 * fade));
    } });
    S.layer.sprite(zapFrames(), { at: at + 40, fps: 12, pos: () => b });
    S.layer.flash(i, '#fff6b0', 120, at + 40);
    S.layer.at(at + 40, () => S.hurt(i));
  }
  return 40;
}

// ─── Склянка и облако ───────────────────────────────────────────────────────

function flaskShape(p: Painter, rot: number, liquid: Mat): void {
  p.pose({ rot, px: 0, py: 1 }, () => {
    p.limb(0, -2, 2.6, 0, -8, 2.3, GLASS, { part: 'glass' });
    p.ellipse(0, 3, 6.2, 6, GLASS, { part: 'glass' });
    p.ellipse(0, 5.2, 5.4, 4, liquid, { part: 'glass', paint: true });
    p.ellipse(0, -9.8, 2.4, 1.8, CORK, { part: 'cork' });
    p.px(-3, 0, '#ffffff');
    p.px(-3.5, 2, '#ffffffaa');
  });
}

function splashFrames(color: string): Frame[] {
  const LIQ: Mat = { base: color, shine: 0.5, dither: 0 };
  void LIQ;
  const light = '#' + buildRamp(color, 5)[4].map((v) => v.toString(16).padStart(2, '0')).join('');
  return baked(`splash:${color}`, () => bake(64, 56, 5, (p, u) => {
    const r = rng(51);
    // Всплеск: жидкость короной вверх, капли разлетаются и падают.
    if (u < 0.5) {
      const k = u / 0.5;
      p.poly([-7 - 6 * k, 4, -4 - 5 * k, -6 - 8 * k, -1, -1, 1, -9 - 6 * k, 3, -1, 5 + 4 * k, -7 - 7 * k, 8 + 6 * k, 4], { base: color, glow: true, dither: 0, noOutline: true, spread: 0.35 }, { part: 'crown', flat: 1 });
    }
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.5 + (i / 8 - 0.5) * 2.6 + (r() - 0.5) * 0.2;
      const v = 16 + r() * 12;
      const x = Math.cos(a) * v * (0.3 + u), y = Math.sin(a) * v * (0.3 + u) + 34 * u * u;
      p.disc(x, y, i % 3 ? 1 : 2, i % 2 ? color : light);
    }
    for (let i = 0; i < 4; i++) p.px((r() - 0.5) * (10 + 30 * u), -6 - 18 * u + r() * 6, '#e8fbff');
  }, { fade: [0, 0, 0.15, 0.4, 0.75] }));
}

function cloudFrames(color: string, w: number): Frame[] {
  const W = Math.ceil((w * D + 40) / 4) * 4;
  const GAS: Mat = { base: color, spread: 0.36, tex: { kind: 'noise', scale: 5, amp: 0.08 }, noOutline: true };
  return baked(`cloud:${color}:${W}`, () => bake(W, 88, 11, (p, u, f) => {
    const r = rng(61);
    // Клубы горкой одной поверхности: мягкий максимум лепит из них одну тучу со светом сверху; газ чуть просвечивает.
    const grow = 0.5 + 0.7 * Math.min(1, u * 2);
    const rise = 16 * u;
    const puffs: Array<[number, number, number]> = [[-21, 8, 6], [-8, 9, 7], [8, 9, 7], [21, 8, 6], [-12, -3, 9], [11, -2, 8.5], [0, -13, 10]];
    for (const [x, y, rr] of puffs) {
      const wob = (r() - 0.5) * 3;
      p.ellipse(x * (0.7 + 0.4 * grow) + wob, y * grow - rise, rr * grow * 1.1, rr * grow * 0.9, GAS, { part: 'gas', flat: 0.15 });
    }
    // Пузыри лопаются по одному.
    for (let i = 0; i < 4; i++) {
      const at = 0.15 + i * 0.18;
      if (u < at || u > at + 0.2) continue;
      const bx = (r() - 0.5) * (W - 40), by = -4 - (u - at) * 60;
      if (u > at + 0.14) { p.px(bx - 2, by, '#e8ffd8'); p.px(bx + 2, by, '#e8ffd8'); p.px(bx, by - 2, '#e8ffd8'); }
      else { p.disc(bx, by, 2, '#e8ffd8', true); }
    }
    void f;
  }, { fade: [0, 0, 0, 0, 0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85], alpha: 0.78 }));
}

export function flask(S: Scene, o: { liquid: string; cloud: string }): number {
  const h = S.hero, t = S.targets[0];
  const sx = h.cx + h.w * 0.25, sy = h.cy - 10, ex = t.cx, ey = t.cy;
  const LIQ: Mat = { base: o.liquid, glow: true, dither: 0, noOutline: true, spread: 0.4 };
  const spin = baked(`flask:${o.liquid}`, () => bake(32, 32, 8, (p, _u, f) => flaskShape(p, (f / 8) * Math.PI * 2, LIQ)));
  const FLY = 410;
  const pos = (tt: number): [number, number] => {
    const k = tt / FLY;
    return [lerp(sx, ex, k), lerp(sy, ey, k) - 30 * 4 * k * (1 - k)];
  };
  S.layer.sprite(spin, { at: 0, fps: 16, loop: true, dur: FLY, pos });
  S.layer.sprite(splashFrames(o.liquid), { at: FLY, fps: 12, pos: () => [ex, ey + 2] });
  // Стекло брызжет осколками.
  const r = rng(71);
  const glass: Particle[] = [];
  for (let k = 0; k < 7; k++) glass.push({ x: ex, y: ey, vx: (r() - 0.4) * 90, vy: -30 - r() * 60, g: 300, life: 260 + r() * 120, born: 0, colors: ['#ffffff', '#d5f1f5', '#77a7b4'] });
  particles(S.layer, FLY, glass);
  S.layer.sprite(cloudFrames(o.cloud, t.w), { at: FLY + 60, fps: 12, pos: () => [t.cx, t.cy] });
  S.layer.at(FLY, () => S.hurt(0));
  return FLY;
}

// ─── Щит блока ──────────────────────────────────────────────────────────────

function shieldFrames(color: string): Frame[] {
  const RIM: Mat = { base: '#9aa5b3', shine: 0.8, dither: 0 };
  const FIELD: Mat = { base: color, shine: 0.35, dither: 0.6 };
  const FIELD_LIT: Mat = { base: '#ffffff', glow: true, dither: 0, noOutline: true, ramp: ['#dff4ff', '#ecf9ff', '#ffffff', '#ffffff', '#ffffff'] };
  const outline = [-12, -14, 12, -14, 12, -2, 8, 8, 0, 15, -8, 8, -12, -2];
  const inset = [-9.5, -11.5, 9.5, -11.5, 9.5, -2.5, 6.2, 6.6, 0, 11.8, -6.2, 6.6, -9.5, -2.5];
  return baked(`shield:${color}`, () => bake(44, 48, 12, (p, _u, f) => {
    const s = [0.55, 1.14, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1][f];
    const dy = f >= 9 ? -(f - 8) * 2 : 0;
    p.scope(s, 0, dy, () => {
      p.poly(outline, RIM, { part: 'rim', bevel: 1.2, flat: 0.5 });
      p.poly(inset, FIELD, { part: 'field', flat: 0.55, lift: 1 });
      // Блик пробегает по полю наискось.
      if (f >= 3 && f <= 8) {
        const k = (f - 3) / 5;
        const x = lerp(-14, 12, k);
        p.poly([x - 2, -12, x + 2, -12, x - 4, 10, x - 8, 10], FIELD_LIT, { part: 'field', paint: true });
      }
      p.ellipse(0, -1.5, 3, 3, GOLD, { part: 'boss', lift: 1.5 });
    });
  }, { fade: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.6, 0.85] }));
}

export function shield(S: Scene, o: { color: string }): number {
  const h = S.hero;
  S.layer.sprite(shieldFrames(o.color), { at: 0, fps: 12, pos: () => [h.cx + h.w * 0.4, h.cy + 1] });
  S.layer.flash('hero', o.color, 200, 60);
  return 0;
}

// ─── Лечение ────────────────────────────────────────────────────────────────

function ringFrames(color: string, w: number): Frame[] {
  const W = Math.ceil((w * D * 1.1 + 12) / 4) * 4;
  return baked(`ring:${color}:${W}`, () => bake(W, 24, 8, (p, u) => {
    const k = 0.55 + 0.45 * Math.min(1, u * 2.5);
    const rx = (W / 2 - 6) * k, ry = 6 * k;
    for (let ring = 0; ring < 2; ring++) {
      const s = ring ? 0.7 : 1;
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const front = Math.sin(a) > 0;
        p.px(Math.cos(a) * rx * s, Math.sin(a) * ry * s, ring ? color + 'cc' : front ? '#f0fff4' : color);
      }
    }
    p.film([-rx * 0.9, 0, -rx * 0.5, -ry * 0.8, rx * 0.5, -ry * 0.8, rx * 0.9, 0, rx * 0.5, ry * 0.8, -rx * 0.5, ry * 0.8], color + '40');
  }, { fade: [0, 0, 0, 0, 0.2, 0.45, 0.7, 0.88] }));
}

/** Столбики света от круга вверх: полупрозрачная плёнка с яркой макушкой, как блики над целебным кругом. */
function beamFrames(color: string, w: number, hgt: number): Frame[] {
  const W = Math.ceil((w * D + 8) / 4) * 4, H = Math.ceil((hgt * D + 16) / 4) * 4;
  return baked(`beam:${color}:${W}:${H}`, () => bake(W, H, 10, (p, u) => {
    const r = rng(83);
    for (let i = 0; i < 7; i++) {
      const x = (i / 6 - 0.5) * (W - 14) + (r() - 0.5) * 4;
      const start = r() * 0.35;
      const k = clamp01((u - start) / 0.65);
      if (k <= 0 || k >= 1) continue;
      const len = 12 + r() * 16;
      const y1 = H / 2 - 6 - k * (H - 20), y0 = y1 + len * (1 - k * 0.5);
      p.film([x - 1.8, y0, x - 1.8, y1, x + 1.8, y1, x + 1.8, y0], color + '66');
      p.line(x, y1, x, y1 + 3, '#f0fff4');
    }
  }));
}

export function heal(S: Scene, o: { color: string }): number {
  const h = S.hero;
  S.layer.sprite(beamFrames(o.color, h.w, h.h * 0.9), { at: 60, fps: 12, pos: () => [h.cx, h.bottom - h.h * 0.45] });
  S.layer.sprite(ringFrames(o.color, h.w), { at: 0, fps: 12, pos: () => [h.cx, h.bottom - 1] });
  const r = rng(81);
  const motes: Particle[] = [];
  for (let k = 0; k < 18; k++) motes.push({
    x: h.cx + (r() - 0.5) * h.w * 1.1, y: h.bottom - 3 - r() * h.h * 0.55, vx: 0, vy: -20 - r() * 18, sway: 1.1,
    life: 560 + r() * 300, born: 30 + k * 32, colors: ['#ffffff', '#e8fff0', o.color, o.color, '#3f9a5f'], plus: k % 2 === 0,
  });
  particles(S.layer, 0, motes);
  S.layer.flash('hero', o.color, 360, 80);
  return 0;
}

// ─── Оглушение ──────────────────────────────────────────────────────────────

function starShape(p: Painter, r: number, mat: Mat): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  p.poly(pts, mat, { part: 'star', bevel: 0.8 });
}

export function stunStars(S: Scene, at: number, i = 0): void {
  const t = S.targets[i];
  const front = baked('star:front', () => bake(16, 16, 1, (p) => { starShape(p, 5.5, STAR); p.px(-1, -1, '#ffffff'); }));
  const back = baked('star:back', () => bake(12, 12, 1, (p) => starShape(p, 3.6, STAR_BACK)));
  const DUR = 1300, PERIOD = 8 * (1000 / 12);
  const rx = Math.max(7, t.w * 0.26), cy = t.top - 3;
  for (let k = 0; k < 3; k++) {
    const pos = (tt: number): [number, number] => {
      const a = (tt / PERIOD) * Math.PI * 2 + (k / 3) * Math.PI * 2;
      return [t.cx - 1 + Math.cos(a) * rx, cy + Math.sin(a) * 2.5];
    };
    S.layer.sprite((tt) => (Math.sin((tt / PERIOD) * Math.PI * 2 + (k / 3) * Math.PI * 2) > 0 ? front : back), { at, dur: DUR, loop: true, fps: 12, pos, frameAt: (tt) => (tt > DUR - 250 && Math.floor(tt / 60) % 2 ? -1 : 0) });
  }
}

// ─── Боевой клич ────────────────────────────────────────────────────────────

function rageFrames(w: number): Frame[] {
  const W = Math.ceil((w * D + 12) / 4) * 4;
  return baked(`rage:${W}`, () => bake(W, 104, 8, (p, _u, f) => {
    const r = rng(91);
    const grow = [0.35, 0.8, 1, 1, 0.95, 0.85, 0.7, 0.55][f];
    const lift = [0, 0, 2, 6, 12, 18, 24, 30][f];
    const hs = [26, 40, 18, 46, 30, 22];
    const xs = [-0.5, -0.3, -0.12, 0.05, 0.26, 0.46];
    for (let i = 0; i < 6; i++) {
      const x = xs[i] * (W - 16) + (r() - 0.5) * 3;
      const len = hs[i] * grow;
      const lean = xs[i] * 10;
      const sway = Math.sin(f * 1.7 + i * 2.1) * 2.5;
      flame(p, x, 46 - lift - (i % 2) * 3, (i % 3 === 1 ? 4.6 : 3.4) * grow + 0.6, len, sway, lean, String(i % 3), RAGE);
    }
    for (let i = 0; i < 7; i++) if (f >= 2) p.px((r() - 0.5) * (W - 10), 30 - f * 9 - r() * 20, i % 2 ? '#ffcc66' : '#ff7d2a');
  }, { fade: [0, 0, 0, 0, 0.15, 0.35, 0.6, 0.82] }));
}

export function warCry(S: Scene): number {
  const h = S.hero;
  S.layer.sprite(rageFrames(h.w), { at: 0, fps: 12, pos: () => [h.cx, h.bottom - 27] });
  // Волны крика от лица героя к врагам: дуги клетками расходятся и гаснут.
  const mouth: [number, number] = [h.cx + h.w * 0.22, h.top + h.h * 0.22];
  S.layer.cells({ at: 60, dur: 520, draw: (put, tt) => {
    for (let k = 0; k < 3; k++) {
      const age = tt - k * 110;
      if (age < 0 || age > 300) continue;
      const R = 4 + age * 0.09;
      const a = 1 - age / 300;
      for (let s = -6; s <= 6; s++) {
        const th = (s / 6) * 0.9;
        put(mouth[0] + Math.cos(th) * R, mouth[1] + Math.sin(th) * R * 1.2, k === 0 ? '#ffe0a0' : '#f9a825', a);
      }
    }
  } });
  S.layer.flash('hero', '#f9a825', 320, 60);
  return 0;
}

// ═══ Варианты: Боевой клич и блок (второй заход) ═══════════════════════════

const toHex = (rgb: number[]): string => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const rampHex = (color: string): string[] => buildRamp(color, 5).map(toHex);

// ─── Силуэт: кольца снаружи и внутри маски ──────────────────────────────────

interface Rings { P: number; W: number; H: number; out: Uint8Array; inn: Uint8Array; nx: Float32Array; ny: Float32Array }
const rings = new WeakMap<Mask, Rings>();

/** Расстояние от силуэта наружу (1 — контур) и внутрь (1 — крайняя клетка фигуры), и нормаль наружу для света. */
function ringsOf(M: Mask): Rings {
  const hit = rings.get(M);
  if (hit) return hit;
  const P = 7, W = M.w + 2 * P, H = M.h + 2 * P;
  const inside = (i: number, j: number): boolean => {
    const x = i - P, y = j - P;
    return x >= 0 && y >= 0 && x < M.w && y < M.h && M.m[y * M.w + x] === 1;
  };
  const out = new Uint8Array(W * H).fill(99), inn = new Uint8Array(W * H).fill(99);
  const qo: number[] = [], qi: number[] = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (inside(i, j)) { out[k] = 0; qo.push(k); } else { inn[k] = 0; qi.push(k); }
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
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    const k = j * W + i;
    const f = (q: number) => (out[q] === 0 ? -inn[q] : out[q]);
    const gx = f(k + 1) - f(k - 1), gy = f(k + W) - f(k - W);
    const l = Math.hypot(gx, gy) || 1;
    nx[k] = gx / l; ny[k] = gy / l;
  }
  const r: Rings = { P, W, H, out, inn, nx, ny };
  rings.set(M, r);
  return r;
}

/** Обход клеток вокруг силуэта: координаты холста, расстояние наружу и внутрь, освещённость −1..1 (свет сверху слева). */
function eachRing(M: Mask, fn: (x: number, y: number, dOut: number, dIn: number, lit: number, nx: number) => void): void {
  const R = ringsOf(M);
  for (let j = 0; j < R.H; j++) for (let i = 0; i < R.W; i++) {
    const k = j * R.W + i;
    fn(M.x0 - R.P + i, M.y0 - R.P + j, R.out[k], R.inn[k], R.nx[k] * -0.55 + R.ny[k] * -0.83, R.nx[k]);
  }
}

// ─── Пыль у ног ─────────────────────────────────────────────────────────────

const DUST: Mat = { base: '#8a7a62', tex: { kind: 'noise', scale: 3, amp: 0.1 }, noOutline: true, spread: 0.3 };

function dustFrames(dir: number): Frame[] {
  return baked(`dust:${dir}`, () => bake(72, 36, 7, (p, u) => {
    for (let i = 0; i < 4; i++) {
      const x = dir * (4 + i * 7 + 22 * u * (1 + i * 0.3));
      const y = 9 - 6 * u - i * 1.5;
      const r = (3 + i) * (0.6 + 0.8 * Math.min(1, u * 2));
      p.ellipse(x, y, r * 1.3, r, DUST, { part: 'dust', flat: 0.3 });
    }
  }, { fade: [0, 0, 0.1, 0.3, 0.5, 0.7, 0.88], alpha: 0.9 }));
}

// ─── Клич А: рёв ────────────────────────────────────────────────────────────

/** Боевой клич «Рёв»: волны крика расходятся от лица к врагам, у ног взметает пыль, поле вздрагивает. */
export function cryRoar(S: Scene): number {
  const h = S.hero;
  const mx = h.cx + h.w * 0.28, my = h.top + h.h * 0.2;
  S.layer.flash('hero', '#ff5a3a', 300, 20);
  S.layer.shake(300, 60);
  S.layer.cells({ at: 40, dur: 720, draw: (put, t) => {
    for (let k = 0; k < 4; k++) {
      const age = t - k * 120;
      if (age < 0 || age > 560) continue;
      const R = 5 + age * 0.22;
      const fade = 1 - age / 560;
      const span = 0.62;
      const n = Math.ceil(R * span * 2.4);
      // Толщина волны убывает с расстоянием: у лица — четыре клетки, у врагов — одна.
      const thick = Math.max(1, Math.round(4 * fade));
      for (let s = 0; s <= n; s++) {
        const th = -span + (2 * span * s) / n;
        const cs = Math.cos(th), sn = Math.sin(th) * 1.15;
        const x = mx + cs * R, y = my + sn * R;
        if (y > h.bottom - 1) continue;
        // Дальние волны рвутся на куски: клетки выпадают по шуму, чем дальше — тем больше.
        if (hashCell(s * 3 + k * 17, Math.round(R)) > fade * 1.35) continue;
        const cols = ['#fff6e0', '#ffd27a', '#f28a2a', '#b8401c'];
        for (let d = 0; d < thick; d++) put(mx + cs * (R - d), my + sn * (R - d), cols[Math.min(3, d)], (d === 0 ? 1 : 0.85) * (0.35 + 0.65 * fade));
      }
    }
  } });
  S.layer.sprite(dustFrames(1), { at: 60, fps: 12, pos: () => [h.cx + h.w * 0.35, h.bottom - 7] });
  S.layer.sprite(dustFrames(-1), { at: 80, fps: 12, pos: () => [h.cx - h.w * 0.35, h.bottom - 7] });
  const r = rng(101);
  const pebbles: Particle[] = [];
  for (let k = 0; k < 8; k++) pebbles.push({ x: h.cx + (r() - 0.5) * h.w * 1.2, y: h.bottom - 1, vx: (r() - 0.5) * 30, vy: -40 - r() * 40, g: 320, life: 600, born: 60 + r() * 80, colors: ['#b8a482', '#8a7a62', '#5e5140'], floor: h.bottom });
  particles(S.layer, 0, pebbles);
  return 0;
}

// ─── Клич Б: жар в жилах ────────────────────────────────────────────────────

const STEAM: Mat = { base: '#c48a7e', tex: { kind: 'noise', scale: 3, amp: 0.1 }, noOutline: true, spread: 0.3 };

function steamFrames(): Frame[] {
  return baked('steam', () => bake(32, 56, 9, (p, u) => {
    for (let i = 0; i < 3; i++) {
      const y = 16 - u * 30 - i * 6;
      const x = Math.sin(u * 5 + i * 1.7) * 3;
      const r = (3 + i) * (0.6 + 0.9 * u);
      p.ellipse(x, y, r, r * 1.1, STEAM, { part: 'st', flat: 0.3 });
    }
  }, { fade: [0, 0, 0, 0.1, 0.25, 0.4, 0.6, 0.78, 0.92], alpha: 0.8 }));
}

/** Боевой клич «Жар в жилах»: контур героя дважды вспыхивает багровым и расходится кольцом, с плеч валит пар. */
export function cryVeins(S: Scene): number {
  const h = S.hero;
  S.layer.flash('hero', '#ff4d2e', 420, 0);
  S.layer.cells({ at: 0, dur: 1000, draw: (put, t) => {
    const M = S.mask?.();
    if (!M) return;
    const hold = t < 700 ? 1 : Math.max(0, 1 - (t - 700) / 300);
    eachRing(M, (x, y, dOut, dIn, lit) => {
      // Багровый край по самой фигуре: свет изнутри, со стороны света ярче.
      if (dIn === 1 && hold > 0 && hashCell(x, y + Math.floor(t / 90)) < 0.8 * hold) put(x, y, lit > 0 ? '#ff8a5a' : '#e63946', 0.55 * hold);
      if (dOut === 1 && hold > 0) put(x, y, lit > 0.2 ? '#ff6a3a' : '#a01e22', 0.9 * hold);
      for (const start of [0, 330]) {
        const age = t - start;
        if (age < 0 || age > 420) continue;
        const front = 1 + (age / 420) * 5;
        if (dOut >= 2 && Math.abs(dOut - front) < 0.6) put(x, y, dOut < 4 ? '#ff7a4a' : '#e63946', 1 - age / 420);
      }
    });
  } });
  const shoulders: Array<[number, number, number]> = [[h.cx - h.w * 0.25, h.top + h.h * 0.28, 60], [h.cx + h.w * 0.2, h.top + h.h * 0.22, 200], [h.cx, h.top + h.h * 0.08, 360]];
  for (const [x, y, at] of shoulders) S.layer.sprite(steamFrames(), { at, fps: 12, pos: () => [x, y] });
  return 0;
}

// ─── Клич В: знак силы ──────────────────────────────────────────────────────

/** Иконка Силы из icons.ts: стрелка вверх 8×8. Та же, что висит над головой, — знак приёма и иконка статуса совпадают. */
const STRENGTH_ICON = ['...##...', '..####..', '.######.', '###..###', '...##...', '...##...', '...##...', '...##...'];

function sigilFrames(color: string, px: number): Frame[] {
  return baked(`sigil:${color}:${px}`, () => {
    void rampHex;
    const M: Mat = { base: color, shine: 0.6, dither: 0, ramp: ['#8a3f06', '#c0600c', '#e8861a', '#f9a825', '#ffcf5c'] };
    const s = px * D;
    return bake(8 * s + 16, 8 * s + 16, 1, (p) => {
      const pts: Array<[number, number]> = [];
      STRENGTH_ICON.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') pts.push([x, y]); }));
      // Стрелка одной фигурой по ступеням иконки: свет ложится фаской на всю стрелку, а не на каждую клетку.
      const step = [3, 0, 5, 0, 5, 1, 6, 1, 6, 2, 7, 2, 7, 3, 8, 3, 8, 4, 5, 4, 5, 8, 3, 8, 3, 4, 0, 4, 0, 3, 1, 3, 1, 2, 2, 2, 2, 1, 3, 1];
      p.poly(step.map((v) => (v - 4) * s), M, { part: 'sig', bevel: s * 0.45, flat: 0.4 });
      p.glow(0, 0, 4 * s + 6, '#f9a825', 0.28);
      // Блик по верхним граням стрелки.
      void pts;
    });
  });
}

/** Боевой клич «Знак силы»: над героем встаёт крупная стрелка Силы, бьёт вспышкой и уменьшается в иконку над головой. */
export function crySigil(S: Scene): number {
  const h = S.hero;
  const big = sigilFrames('#f9a825', 4), mid = sigilFrames('#f9a825', 2), small = sigilFrames('#f9a825', 1);
  const cx = h.cx, cy = h.top - 20, slotY = h.top - 6;
  S.layer.flash('hero', '#f9a825', 360, 0);
  S.layer.sprite((t) => (t < 90 ? mid : t < 520 ? big : t < 640 ? mid : small), {
    at: 0, dur: 820, fps: 12, pos: (t) => {
      const k = clamp01((t - 520) / 300);
      return [cx, lerp(cy, slotY, k * k) - (t < 90 ? 0 : t < 200 ? 3 : 0)];
    }, frameAt: (t) => (t > 740 && Math.floor(t / 50) % 2 ? -1 : 0),
  });
  S.layer.cells({ at: 90, dur: 260, draw: (put, t) => {
    // Удар знака: кольцо лучей от центра.
    const R = 14 + t * 0.09, a = 1 - t / 260;
    for (let i = 0; i < 16; i++) {
      const th = (i / 16) * Math.PI * 2;
      put(cx + Math.cos(th) * R, cy + Math.sin(th) * R * 0.9, i % 2 ? '#ffe08a' : '#f9a825', a);
      put(cx + Math.cos(th) * (R - 2), cy + Math.sin(th) * (R - 2) * 0.9, '#fff4c8', a * 0.6);
    }
  } });
  // Шевроны вверх по бокам героя.
  S.layer.cells({ at: 120, dur: 700, draw: (put, t) => {
    for (let k = 0; k < 4; k++) {
      const age = t - k * 110;
      if (age < 0 || age > 380) continue;
      const x = h.cx + (k % 2 ? 1 : -1) * h.w * 0.55;
      const y = h.bottom - 8 - age * 0.12;
      const a = 1 - age / 380;
      for (let d = -2; d <= 2; d++) put(x + d, y + Math.abs(d), '#f9a825', a);
      put(x, y - 1, '#fff4c8', a);
    }
  } });
  return 0;
}

// ─── Блок: общее ────────────────────────────────────────────────────────────

export interface BlockOpts { color: string; hitAt?: number; endAt?: number; /** Кто ставит блок: герой или враг по индексу в ряду. */ who?: 'hero' | number }

/** Осколки при ударе и при распаде: клетки рампа блока, летят от удара и падают. */
function chips(S: Scene, at: number, x: number, y: number, R: string[], n: number, seed: number, dir: number, floor: number): void {
  const r = rng(seed);
  const list: Particle[] = [];
  for (let k = 0; k < n; k++) list.push({ x: x + (r() - 0.5) * 2, y: y + (r() - 0.5) * 6, vx: dir * (20 + r() * 50), vy: -30 - r() * 50, g: 300, life: 700, born: r() * 40, colors: [R[4], R[3], R[2]], floor });
  particles(S.layer, at, list);
}

// ─── Блок А: барьер ─────────────────────────────────────────────────────────

/**
 * Блок «Барьер»: перед бойцом со стороны врагов из земли вырастает пластинчатая стена в две клетки, по ней
 * пробегает блик, потом она стоит тусклой, пока держится блок. Удар по блоку вспыхивает в месте попадания
 * и бежит волной вверх и вниз, откалывая куски; в начале хода барьер осыпается.
 */
export function blockBarrier(S: Scene, o: BlockOpts): number {
  const h = S.hero;
  const R = rampHex(o.color);
  const yb = h.bottom, yt = h.top - 4, H = yb - yt;
  const x0 = Math.round(h.cx + h.w * 0.6);
  // Стена выгнута к врагам: середина выдаётся на 5 клеток.
  const xAt = (y: number): number => x0 + Math.round(5 * (1 - ((y - (yt + H / 2)) / (H / 2)) ** 2));
  const hitY = Math.round(yt + H * 0.45);
  const end = o.endAt ?? 1400;
  const WIDTH = 5;
  S.layer.flash('hero', o.color, 220, 40);
  S.layer.cells({ at: 0, dur: end + 420, draw: (put, t) => {
    const build = clamp01(t / 220);
    const top = yb - H * build;
    const crumble = t > end ? (t - end) / 400 : 0;
    const hold = t >= 460;
    for (let y = yt; y <= yb; y++) {
      if (y < top) continue;
      if (crumble > 0 && y < yt + H * crumble * 1.2) continue;
      const x = xAt(y);
      // Пластины кирпичной кладкой: ряд высотой 5 клеток, шов по горизонтали, вертикальный шов со сдвигом через ряд.
      const row = Math.floor((yb - y) / 5);
      const hSeam = (yb - y) % 5 === 0;
      const vSeam = row % 2 ? 2 : 3;
      const glintY = yb - (t - 220) * 0.4;
      const glint = t > 220 && t < 520 && Math.abs(y - glintY) < 2;
      const lead = t < 220 && y - top < 2;
      let hitK = 0;
      if (o.hitAt !== undefined && t >= o.hitAt && t < o.hitAt + 400) {
        const age = t - o.hitAt, d = Math.abs(y - hitY);
        if (d < 5 && age < 140) hitK = 1;
        else if (Math.abs(d - age * 0.15) < 1.5) hitK = 0.8 - age / 600;
      }
      const shimmer = 0.1 * Math.sin((t + y * 60) / 180);
      for (let c = 0; c < WIDTH; c++) {
        // Слева (к герою) тень, справа (к врагам) — светлая лицевая кромка.
        let tone = [0, 1, 2, 3, 4][c];
        if (hSeam || c === vSeam) tone = Math.max(0, tone - 2);
        let col = R[tone];
        let a = hold ? (c >= 3 ? 0.72 : 0.5) + shimmer : 1;
        if (lead || glint) { col = c >= 2 ? '#ffffff' : R[4]; a = 1; }
        if (hitK > 0) { col = c >= 1 ? '#ffffff' : R[4]; a = Math.max(a, hitK); }
        put(x - WIDTH + 1 + c, y, col, a);
      }
      if (!hold) put(x + 1, y, R[4], 0.35 * (1 - t / 460));
    }
  } });
  if (o.hitAt !== undefined) {
    chips(S, o.hitAt, x0 + 4, hitY, R, 12, 111, 1, yb);
    // Удар высекает горизонтальную искру вдоль стены.
    S.layer.cells({ at: o.hitAt, dur: 160, draw: (put, t) => {
      const L = 4 + t * 0.06, a = 1 - t / 160;
      for (let d = -L; d <= L; d++) put(xAt(hitY) + 1 + d * 0.5, hitY + Math.round(d * 0.15), '#ffffff', a);
    } });
  }
  const r = rng(121);
  const fall: Particle[] = [];
  for (let k = 0; k < 26; k++) {
    const y = yt + (k / 26) * H;
    fall.push({ x: xAt(y) - 2 + (r() - 0.5) * 4, y, vx: (r() - 0.3) * 16, vy: -5 - r() * 12, g: 280, life: 900, born: (k / 26) * 400, colors: [R[3], R[2], R[1]], floor: yb, size: k % 3 ? 1 : 2 });
  }
  particles(S.layer, end, fall);
  return 0;
}

// ─── Блок Б: латы по силуэту ────────────────────────────────────────────────

/**
 * Блок «Латы»: сталь ложится по контуру самого бойца — от ступней к макушке, пластинами со швами и светом
 * сверху слева, по готовым латам пробегает блик. Держится тонким контуром; удар звенит вспышкой всего контура
 * и сбивает пластины со стороны врага; в начале хода латы тают.
 */
export function blockPlates(S: Scene, o: BlockOpts): number {
  const who = o.who ?? 'hero';
  const h = who === 'hero' ? S.hero : S.all[who];
  // Откуда приходят удары: герою — справа, врагу — слева. С этой стороны удар сбивает пластины.
  const side = who === 'hero' ? 1 : -1;
  const tint = rampHex(o.color);
  const STEEL_R = ['#2f3a4a', '#566579', '#8595a9', '#bccad8', '#eef4fa'];
  const end = o.endAt ?? 1400;
  S.layer.flash(who, o.color, 240, 40);
  S.layer.cells({ at: 0, dur: end + 420, draw: (put, t) => {
    const M = S.mask?.(who);
    if (!M) return;
    const yb = M.y0 + M.h, yt = M.y0;
    const top = yb - (yb - yt) * clamp01(t / 300);
    const glint = (t - 300) * 0.4;
    const hitAge = o.hitAt !== undefined && t >= o.hitAt ? t - o.hitAt : -1;
    const melt = t > end ? (t - end) / 400 : 0;
    eachRing(M, (x, y, dOut, _dIn, lit, nx) => {
      if (dOut < 1 || dOut > 2 || y < top) return;
      if (melt > 0 && hashCell(x, y) < melt * 1.1) return;
      const building = t < 300;
      const thick = building || t < 480 || (hitAge >= 0 && hitAge < 200);
      if (dOut === 2 && !thick) return;
      const seam = (x * 3 + y * 5) % 13 === 0;
      let tone = Math.max(0, Math.min(4, Math.round(2 + lit * 2) - (dOut === 2 ? 1 : 0) - (seam ? 2 : 0)));
      let c = STEEL_R[tone];
      let a = t < 480 ? 1 : 0.6;
      if (building && y - top < 2) { c = '#ffffff'; a = 1; }
      if (t > 300 && t < 620 && Math.abs(x - M.x0 + (y - yt) - glint) < 2) { c = '#ffffff'; a = 1; }
      if (hitAge >= 0 && hitAge < 90) { c = '#ffffff'; a = 1; }
      else if (hitAge >= 90 && hitAge < 300 && nx * side > 0.3 && hashCell(x, y + Math.floor(hitAge / 60)) < 0.35) return;
      put(x, y, dOut === 1 && tone >= 3 && t >= 480 ? tint[4] : c, a);
    });
  } });
  if (o.hitAt !== undefined) chips(S, o.hitAt, h.cx + side * h.w * 0.45, h.cy - 4, STEEL_R, 8, 131, side, h.bottom);
  return 0;
}

// ─── Блок В: купол ──────────────────────────────────────────────────────────

/**
 * Блок «Купол»: над бойцом из земли вырастает полусфера с решёткой; по ней проходит блик, потом остаются
 * тусклые край и решётка. Удар по блоку расходит по решётке круг вокруг точки попадания; в начале хода купол
 * рассыпается.
 */
export function blockDome(S: Scene, o: BlockOpts): number {
  const h = S.hero;
  const R = rampHex(o.color);
  const cx = h.cx + 1, cy = h.bottom, rx = h.w * 1.05, ry = h.h * 0.66;
  const end = o.endAt ?? 1400;
  const hitA = 0.45, hx = cx + Math.cos(hitA) * rx, hy = cy - Math.sin(hitA) * ry;
  S.layer.flash('hero', o.color, 220, 40);
  S.layer.cells({ at: 0, dur: end + 420, draw: (put, t) => {
    const top = cy - ry * 1.05 * clamp01(t / 260);
    const melt = t > end ? (t - end) / 400 : 0;
    const hitAge = o.hitAt !== undefined && t >= o.hitAt ? t - o.hitAt : -1;
    for (let y = Math.floor(cy - ry - 1); y <= cy; y++) {
      if (y < top) continue;
      const half = rx * Math.sqrt(Math.max(0, 1 - ((cy - y) / ry) ** 2));
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        if (melt > 0 && hashCell(x, y) < melt * 1.1) continue;
        const q = Math.hypot((x - cx) / rx, (y - cy) / ry);
        const rim = q > 0.93;
        // Треугольная решётка: три семейства линий.
        const g = ((y % 6) + 6) % 6 === 0 || (((x + y * 0.58) % 7) + 7) % 7 < 0.9 || (((x - y * 0.58) % 7) + 7) % 7 < 0.9;
        if (!rim && !g) continue;
        let a = rim ? (t < 480 ? 1 : 0.6) : t < 480 ? 0.45 : 0.16;
        let c = rim ? ((x < cx) === (y < cy - ry * 0.5) ? R[4] : R[3]) : R[3];
        if (t < 260 && y - top < 2) { c = '#ffffff'; a = 1; }
        if (t > 260 && t < 560 && Math.abs(x - (cx - rx + (t - 260) * 0.45)) < 2) { c = '#ffffff'; a = rim ? 1 : 0.7; }
        if (hitAge >= 0 && hitAge < 420) {
          const d = Math.hypot(x - hx, (y - hy) * 1.2);
          if (Math.abs(d - hitAge * 0.1) < 1.5) { c = '#ffffff'; a = Math.max(a, 0.9 - hitAge / 500); }
          else if (d < 4 && hitAge < 120) { c = '#ffffff'; a = 1; }
        }
        put(x, y, c, a);
      }
    }
  } });
  if (o.hitAt !== undefined) chips(S, o.hitAt, hx, hy, R, 7, 141, 1, h.bottom);
  const r = rng(151);
  const fall: Particle[] = [];
  for (let k = 0; k < 20; k++) {
    const a = (k / 19) * Math.PI;
    fall.push({ x: cx + Math.cos(a) * rx, y: cy - Math.sin(a) * ry, vx: (r() - 0.5) * 14, vy: -4 - r() * 10, g: 260, life: 900, born: r() * 300, colors: [R[4], R[3], R[1]], floor: cy });
  }
  particles(S.layer, end, fall);
  return 0;
}
