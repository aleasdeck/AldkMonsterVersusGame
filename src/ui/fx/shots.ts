import type { EventTarget } from '../../engine/types';
import { buildRamp, type Mat, type Painter } from '../mobs/pixel';
import { FLAME } from '../mobs/fire';
import { bake, lerp, rng, type FxClip, type FxFrame } from './bake';
import { particles, sparks, type Body, type Particle, type Put, type PxLayer } from './layer';

/**
 * Снаряды пиксельной лепкой (GDD §12.45): стрела, огненный шар, ледяной осколок, молния, склянка, камень пращи
 * и светящийся сгусток для остальных заклинаний и магического оружия. Снаряд летит плавно, но по целым клеткам,
 * его собственные кадры — 12 в секунду; угол полёта запекается в кадры (влево — зеркалом, чтобы свет оставался
 * сверху). Попадание — ровно через `flight` мс после вылета, как у типовых снарядов: к нему игра приурочивает
 * перерисовку и цифры.
 */

const toHex = (rgb: number[]): string => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** Пять тонов из цвета: от тени к свету. */
const rampHex = (color: string): string[] => buildRamp(color, 5).map(toHex);

/** Точка вылета: край фигуры со стороны цели, чуть выше середины. */
function muzzle(f: Body, t: Body): [number, number] {
  const dir = t.cx >= f.cx ? 1 : -1;
  return [f.cx + dir * f.w * 0.35, f.cy - Math.max(2, f.h * 0.08)];
}

/**
 * Кадры снаряда, повёрнутые на угол полёта `ang`. Влево — тот же рисунок зеркалом с углом π − ang: свет остаётся
 * сверху слева, оперение и грани не переворачиваются. Угол округлён до 0.05 рад: кадры одного направления — одни.
 */
function aimed(key: string, ang: number, make: (a: number, flip: boolean) => FxClip): FxFrame[] {
  const flip = Math.cos(ang) < 0;
  const a = Math.round((flip ? Math.PI - ang : ang) / 0.05) * 0.05;
  return bake(`${key}:${a.toFixed(2)}:${flip ? 'l' : 'r'}`, make(a, flip));
}

// ─── Стрела ─────────────────────────────────────────────────────────────────

const WOOD: Mat = { base: '#a9824c', dither: 0, spread: 0.3 };
const STEEL: Mat = { base: '#a9b3bf', shine: 0.8, dither: 0 };

function arrowShape(p: Painter, ang: number, feather: Mat, flutter: number, cut = 0, quiver = 0): void {
  p.pose({ rot: ang + quiver, px: 0, py: 0 }, () => {
    const front = 10 - cut;
    p.limb(-17, 0, 1, front, 0, 1, WOOD, { part: 'shaft' });
    if (cut < 4) p.poly([8, -3.6, 19, 0, 8, 3.6, 10, 0], STEEL, { part: 'head', bevel: 1.2 });
    p.poly([-18, -0.5, -13, -0.5, -10, -1, -12.5, -3.6 + flutter, -17.5, -3.4 + flutter], feather, { part: 'fl1', flat: 0.6 });
    p.poly([-18, 0.5, -13, 0.5, -10, 1, -12.5, 3.6 - flutter * 0.5, -17.5, 3.4], feather, { part: 'fl2', tone: -0.25, flat: 0.6 });
  });
}

const featherMat = (c: string): Mat => ({ base: c, dither: 0, tex: { kind: 'stripes', scale: 1.5, amp: 0.18, angle: 0.8 } });

/** Стрела в полёте: древко, стальной наконечник с фаской, оперение цветом оружия; два кадра — трепет оперения. */
export function arrowClip(ang: number, feather: string, flip = false): FxClip {
  const fm = featherMat(feather);
  return { w: 48, h: 48, n: 2, loop: true, draw: (p, _u, f) => arrowShape(p, ang, fm, f ? 1 : 0), opts: { flip } };
}

/** Стрела в цели: древко ушло внутрь, стрела дрожит и растворяется. */
export function arrowStuckClip(ang: number, feather: string, flip = false): FxClip {
  const fm = featherMat(feather);
  const quiver = [0.16, -0.1, 0.06, -0.03, 0, 0, 0, 0];
  return { w: 48, h: 48, n: 8, draw: (p, _u, f) => arrowShape(p, ang, fm, 0, 9, quiver[f]), opts: { fade: [0, 0, 0, 0, 0, 0.3, 0.6, 0.85], flip } };
}

/** Длина стрелы до острия от центра рисунка, клетки. */
const TIP = 19 / 2;

export function arrow(L: PxLayer, from: EventTarget, to: EventTarget, feather: string, at: number, flight: number): void {
  const f = L.body(from), t = L.body(to);
  if (!f || !t) return;
  const [sx, sy] = muzzle(f, t);
  const ex = t.cx - Math.sign(t.cx - sx) * t.w * 0.08, ey = t.cy;
  const ang = Math.atan2(ey - sy, ex - sx);
  const fly = aimed(`arrow:${feather}`, ang, (a, flip) => arrowClip(a, feather, flip));
  const stuck = aimed(`arrow-stuck:${feather}`, ang, (a, flip) => arrowStuckClip(a, feather, flip));
  const tx = TIP * Math.cos(ang), ty = TIP * Math.sin(ang);
  const pos = (tt: number): [number, number] => {
    const k = Math.min(1, tt / flight);
    return [lerp(sx, ex, k) - tx, lerp(sy, ey, k) - ty];
  };
  L.sprite(fly, { at, fps: 24, loop: true, dur: flight, pos });
  // Шлейф: светлая черта позади оперения.
  L.cells({ at, dur: flight, draw: (put, tt) => {
    const [x, y] = pos(tt);
    for (let i = 1; i <= 5; i++) put(x - tx * 1.1 - Math.cos(ang) * i * 2, y - ty * 1.1 - Math.sin(ang) * i * 2, '#f3ead0', 0.5 - i * 0.08);
  } });
  L.sprite(stuck, { at: at + flight, pos: () => [ex - tx + (9 / 2) * Math.cos(ang), ey - ty + (9 / 2) * Math.sin(ang)] });
  sparks(L, at + flight, ex, ey, '#c8b890', 5, 5, -Math.sign(Math.cos(ang)) || -1);
}

// ─── Огненный шар ───────────────────────────────────────────────────────────

/** Огненный шар по ходу полёта: ядро впереди, хвост назад (как плевок Импа, только в свою сторону). */
function ballShape(p: Painter, ang: number, r: number, tail: number): void {
  p.pose({ rot: ang, px: 0, py: 0 }, () => {
    p.glow(0, 0, r * 2.3, '#ff9a2a', 0.32);
    p.chain([[-tail, 0.5, r * 0.35], [-tail * 0.45, -0.5, r * 0.78], [0, 0, r]], FLAME.outer, { part: 'ball' });
    p.ellipse(0.4, 0, r * 0.7, r * 0.66, FLAME.mid, { part: 'ballMid', noLine: true });
    p.ellipse(1.2, -r * 0.1, r * 0.38, r * 0.36, FLAME.core, { part: 'ballCore', noLine: true });
  });
}

export function fireballClip(ang: number, flip = false): FxClip {
  return { w: 64, h: 64, n: 4, loop: true, draw: (p, _u, f) => ballShape(p, ang, [7, 7.6, 6.8, 7.3][f], [14, 16, 13, 15][f]), opts: { flip } };
}

const SMOKE: Mat = { base: '#77717e', tex: { kind: 'noise', scale: 4, amp: 0.1 }, noOutline: true, spread: 0.28 };

/** Взрыв: языки во все стороны, ядро гаснет, поднимаются клубы дыма и угли. */
export function explosionClip(): FxClip {
  return {
    w: 96, h: 96, n: 8,
    draw: (p, _u, f) => {
      const r = rng(7);
      const rays = Array.from({ length: 9 }, (_, k) => ({ a: (k / 9) * Math.PI * 2 + r() * 0.4, l: 0.7 + r() * 0.5 }));
      const grow = [0.55, 0.9, 1.1, 1.05, 0.85, 0.6, 0.4, 0.2][f];
      if (f <= 4) {
        p.glow(0, 0, 18 * grow + 6, '#ffb428', 0.22);
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
    },
    opts: { fade: [0, 0, 0, 0, 0.15, 0.4, 0.62, 0.85] },
  };
}

export function fireball(L: PxLayer, from: EventTarget, to: EventTarget, at: number, flight: number): void {
  const f = L.body(from), t = L.body(to);
  if (!f || !t) return;
  const [sx, sy] = muzzle(f, t);
  const ex = t.cx, ey = t.cy;
  const ang = Math.atan2(ey - sy, ex - sx);
  const fly = aimed('ball', ang, (a, flip) => fireballClip(a, flip));
  // Шар разгоняется к цели.
  const pos = (tt: number): [number, number] => {
    const k = Math.pow(Math.min(1, tt / flight), 1.35);
    return [lerp(sx, ex, k), lerp(sy, ey, k)];
  };
  L.sprite(fly, { at, loop: true, dur: flight, pos });
  // Угли позади шара: жёлтые остывают до тёмно-красных и поднимаются.
  const r = rng(21);
  const back = -Math.cos(ang);
  const embers: Particle[] = [];
  for (let k = 0; k < 16; k++) {
    const born = (k / 16) * flight;
    const [x, y] = pos(born);
    embers.push({ x: x + back * 5, y: y + (r() - 0.5) * 6, vx: back * (10 + r() * 20), vy: -12 - r() * 22, life: 200 + r() * 160, born, colors: ['#ffec90', '#ffb428', '#f85414', '#8a2a14'] });
  }
  particles(L, at, embers);
  L.sprite(bake('boom', explosionClip()), { at: at + flight, pos: () => [ex, ey] });
  L.flash(to, 160, at + flight);
}

// ─── Лёд ────────────────────────────────────────────────────────────────────

const ICE: Mat = { base: '#8fd0ea', shine: 0.9, dither: 0, ramp: ['#24507a', '#3d7fae', '#6cb4dc', '#b2e4f6', '#effcff'] };
const ICE_DARK: Mat = { base: '#4f8fbf', dither: 0, ramp: ['#1b3d63', '#2c5f8e', '#4a88b8', '#7ab4d8', '#b2e4f6'] };

/** Ледяной осколок: вытянутый кристалл с гранями и фаской, нижняя грань темнее, блик пробегает по ребру. */
export function shardClip(ang: number, flip = false): FxClip {
  return {
    w: 56, h: 56, n: 3, loop: true,
    draw: (p, u) => p.pose({ rot: ang, px: 0, py: 0 }, () => {
      p.glow(4, 0, 16, '#7fd7ff', 0.22);
      p.poly([20, 0, 8, -7, -9, -5.5, -17, 0, -9, 5.5, 8, 7], ICE, { part: 'ice', bevel: 1.6 });
      p.poly([20, 0, 8, 7, -9, 5.5, -17, 0, -9, 0.5, 8, 0.5], ICE_DARK, { part: 'ice', paint: true });
      p.line(-9, -2.5, 14, -1.5, '#ffffffcc');
      p.px(lerp(-6, 14, u), -3, '#ffffff');
    }),
    opts: { flip },
  };
}

/** Осколок разбивается: куски летят вперёд и вверх, кувыркаются и падают, иней расходится лучами. */
export function shatterClip(): FxClip {
  return {
    w: 88, h: 88, n: 7,
    draw: (p, u) => {
      const r = rng(33);
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI * 0.95 + (i / 7) * Math.PI * 1.25 + (r() - 0.5) * 0.3;
        const d0 = 3 + (18 + r() * 12) * Math.pow(u, 0.7);
        const x = Math.cos(a) * d0 + 4, y = Math.sin(a) * d0 + 26 * u * u;
        const s = 2.2 + r() * 1.6, rot = a + u * (4 + r() * 5);
        const c = Math.cos(rot), sn = Math.sin(rot);
        const tri = [[s * 1.6, 0], [-s, -s * 0.8], [-s * 0.6, s * 0.9]];
        p.poly(tri.flatMap(([px, py]) => [x + px * c - py * sn, y + px * sn + py * c]), ICE, { part: `sh${i}`, bevel: 0.8 });
      }
      if (u < 0.6) {
        const k = u / 0.6;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r0 = 3 + 12 * k, r1 = r0 + 7 * (1 - k) + 2;
          p.line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, i % 2 ? '#bfefff' : '#ffffff');
        }
        p.glow(0, 0, 14 * (1 - k) + 6, '#7fd7ff', 0.35);
      }
      if (u === 0) {
        p.line(-4, 0, 4, 0, '#ffffff');
        p.line(0, -4, 0, 4, '#ffffff');
      }
    },
    opts: { fade: [0, 0, 0, 0, 0.25, 0.55, 0.8] },
  };
}

export function iceShard(L: PxLayer, from: EventTarget, to: EventTarget, at: number, flight: number): void {
  const f = L.body(from), t = L.body(to);
  if (!f || !t) return;
  const [sx, sy] = muzzle(f, t);
  const ex = t.cx - Math.sign(t.cx - sx) * 2, ey = t.cy;
  const ang = Math.atan2(ey - sy, ex - sx);
  const fly = aimed('shard', ang, (a, flip) => shardClip(a, flip));
  const pos = (tt: number): [number, number] => {
    const k = Math.min(1, tt / flight);
    return [lerp(sx, ex, k), lerp(sy, ey, k)];
  };
  L.sprite(fly, { at, loop: true, dur: flight, pos });
  const r = rng(31);
  const back = -Math.cos(ang);
  const frost: Particle[] = [];
  for (let k = 0; k < 12; k++) {
    const born = (k / 12) * flight;
    const [x, y] = pos(born);
    frost.push({ x: x + back * 6, y: y + (r() - 0.5) * 6, vx: back * (6 + r() * 8), vy: (r() - 0.5) * 12, life: 220 + r() * 140, born, colors: ['#ffffff', '#bfefff', '#7fd7ff'], plus: k % 3 === 0 });
  }
  particles(L, at, frost);
  L.sprite(bake('shatter', shatterClip()), { at: at + flight, pos: () => [ex, ey] });
  L.flash(to, 140, at + flight);
}

// ─── Молния ─────────────────────────────────────────────────────────────────

function boltPath(ax: number, ay: number, bx: number, by: number, seed: number): Array<[number, number]> {
  const r = rng(seed);
  const len = Math.hypot(bx - ax, by - ay) || 1;
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

/** Вспышка молнии в цели: лучи ломаной, ореол, белое ядро. */
export function zapClip(): FxClip {
  return {
    w: 44, h: 44, n: 4,
    draw: (p, u) => {
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
    },
    opts: { fade: [0, 0, 0.35, 0.7] },
  };
}

/** Сколько живёт дуга молнии, мс; излом меняется каждые 50 мс. */
const BOLT_LIFE = 230;
/** Молния бьёт почти сразу: время «полёта» до вспышки в цели. */
export const BOLT_MS = 40;

/** Дуга молнии от `from` к `to`: ломаная клетками с ореолом и отростком, вспышка в цели через BOLT_MS. */
export function bolt(L: PxLayer, from: EventTarget, to: EventTarget, at: number, color = '#ffe45c'): void {
  const f = L.body(from), t = L.body(to);
  if (!f || !t) return;
  const [ax, ay] = from === 'hero' ? [f.cx + f.w * 0.3, f.cy - f.h * 0.12] : [f.cx, f.cy - 2];
  const bx = t.cx, by = t.cy - 2;
  const R = rampHex(color);
  L.cells({ at, dur: BOLT_LIFE, draw: (put: Put, tt) => {
    const v = Math.floor(tt / 50);
    const pts = boltPath(ax, ay, bx, by, 100 + Math.round(ax + bx) + v * 3);
    const fade = tt > BOLT_LIFE - 70 ? (BOLT_LIFE - tt) / 70 : 1;
    const around = new Set<string>();
    for (let k = 0; k + 1 < pts.length; k++) lineCells(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], (x, y) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) around.add(`${x + dx},${y + dy}`);
    });
    for (const g of around) {
      const [x, y] = g.split(',').map(Number);
      put(x, y, R[3], 0.4 * fade);
    }
    for (let k = 0; k + 1 < pts.length; k++) lineCells(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], (x, y) => put(x, y, (x + y) % 3 ? R[4] : '#ffffff', fade));
    const m = pts[Math.floor(pts.length / 2)];
    const fork = boltPath(m[0], m[1], m[0] + 6, m[1] - 9 + (v % 2) * 16, 300 + v);
    for (let k = 0; k + 1 < fork.length - 1; k++) lineCells(fork[k][0], fork[k][1], fork[k + 1][0], fork[k + 1][1], (x, y) => put(x, y, R[3], 0.8 * fade));
  } });
  L.sprite(bake('zap', zapClip()), { at: at + BOLT_MS, pos: () => [bx, by] });
  L.flash(to, 120, at + BOLT_MS);
}

// ─── Склянка ────────────────────────────────────────────────────────────────

const GLASS: Mat = { base: '#b9dfe8', shine: 0.9, dither: 0, ramp: ['#46707c', '#77a7b4', '#a5d2dc', '#d5f1f5', '#ffffff'] };
const CORK: Mat = { base: '#8a6b3f', tex: { kind: 'noise', scale: 2, amp: 0.15 } };

/** Склянка кувыркается: стекло с бликом, светящаяся жидкость, пробка; восемь кадров оборота запечены. */
export function flaskClip(liquid: string): FxClip {
  const LIQ: Mat = { base: liquid, glow: true, dither: 0, noOutline: true, spread: 0.4 };
  return {
    w: 36, h: 36, n: 8, loop: true,
    draw: (p, _u, f) => p.pose({ rot: (f / 8) * Math.PI * 2, px: 0, py: 1 }, () => {
      p.limb(0, -2, 2.6, 0, -8, 2.3, GLASS, { part: 'glass' });
      p.ellipse(0, 3, 6.2, 6, GLASS, { part: 'glass' });
      p.ellipse(0, 5.2, 5.4, 4, LIQ, { part: 'glass', paint: true });
      p.ellipse(0, -9.8, 2.4, 1.8, CORK, { part: 'cork' });
      p.px(-3, 0, '#ffffff');
      p.px(-3.5, 2, '#ffffffaa');
    }),
  };
}

/** Всплеск: жидкость короной вверх, капли разлетаются и падают. */
export function splashClip(color: string): FxClip {
  const light = rampHex(color)[4];
  const CROWN: Mat = { base: color, glow: true, dither: 0, noOutline: true, spread: 0.35 };
  return {
    w: 72, h: 64, n: 5,
    draw: (p, u) => {
      const r = rng(51);
      if (u < 0.5) {
        const k = u / 0.5;
        p.poly([-7 - 6 * k, 4, -4 - 5 * k, -6 - 8 * k, -1, -1, 1, -9 - 6 * k, 3, -1, 5 + 4 * k, -7 - 7 * k, 8 + 6 * k, 4], CROWN, { part: 'crown', flat: 1 });
      }
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.5 + (i / 8 - 0.5) * 2.6 + (r() - 0.5) * 0.2;
        const v = 16 + r() * 12;
        p.disc(Math.cos(a) * v * (0.3 + u), Math.sin(a) * v * (0.3 + u) + 34 * u * u, i % 3 ? 1 : 2, i % 2 ? color : light);
      }
      for (let i = 0; i < 4; i++) p.px((r() - 0.5) * (10 + 30 * u), -6 - 18 * u + r() * 6, '#e8fbff');
    },
    opts: { fade: [0, 0, 0.15, 0.4, 0.75] },
  };
}

/** Склянка летит по дуге, кувыркаясь, и разбивается: всплеск жидкости и осколки стекла. Облако рисует сам статус. */
export function flask(L: PxLayer, from: EventTarget, to: EventTarget, liquid: string, at: number, flight: number): void {
  const f = L.body(from), t = L.body(to);
  if (!f || !t) return;
  const dir = t.cx >= f.cx ? 1 : -1;
  const sx = f.cx + dir * f.w * 0.25, sy = f.cy - 10, ex = t.cx, ey = t.cy;
  const pos = (tt: number): [number, number] => {
    const k = Math.min(1, tt / flight);
    return [lerp(sx, ex, k), lerp(sy, ey, k) - 120 * k * (1 - k)];
  };
  L.sprite(bake(`flask:${liquid}`, flaskClip(liquid)), { at, fps: 16, loop: true, dur: flight, pos });
  L.sprite(bake(`splash:${liquid}`, splashClip(liquid)), { at: at + flight, pos: () => [ex, ey + 2] });
  const r = rng(71);
  const glass: Particle[] = [];
  for (let k = 0; k < 7; k++) glass.push({ x: ex, y: ey, vx: (r() - 0.4) * 90, vy: -30 - r() * 60, g: 300, life: 260 + r() * 120, born: 0, colors: ['#ffffff', '#d5f1f5', '#77a7b4'] });
  particles(L, at + flight, glass);
}

// ─── Камень пращи ───────────────────────────────────────────────────────────

const ROCK: Mat = { base: '#8f8a80', tex: { kind: 'noise', scale: 2, amp: 0.2 }, dither: 0.6 };

/** Камень пращи кувыркается: угловатый булыжник с фаской, четыре кадра оборота. */
export function stoneClip(): FxClip {
  return {
    w: 24, h: 24, n: 4, loop: true,
    draw: (p, _u, f) => p.pose({ rot: (f / 4) * Math.PI * 2, px: 0, py: 0 }, () => {
      p.poly([-4.5, -2, -1.5, -4.5, 3.5, -3.5, 4.8, 1, 2, 4.2, -3, 3.8], ROCK, { part: 'rock', bevel: 1.2 });
    }),
  };
}

export function stone(L: PxLayer, from: EventTarget, to: EventTarget, at: number, flight: number): void {
  const f = L.body(from), t = L.body(to);
  if (!f || !t) return;
  const [sx, sy] = muzzle(f, t);
  const ex = t.cx, ey = t.cy;
  const pos = (tt: number): [number, number] => {
    const k = Math.min(1, tt / flight);
    return [lerp(sx, ex, k), lerp(sy, ey, k) - 24 * k * (1 - k)];
  };
  L.sprite(bake('stone', stoneClip()), { at, fps: 16, loop: true, dur: flight, pos });
  sparks(L, at + flight, ex, ey, '#b8a482', 6, 13, Math.sign(ex - sx) || 1);
}

// ─── Сгусток ────────────────────────────────────────────────────────────────

/**
 * Светящийся сгусток цвета приёма — для заклинаний и магического оружия, у которых ещё нет своего семейства
 * (Волшебная стрела, Высасывание, Сглаз, посох, жезл, тёмные стрелы некроманта): три слоя свечения, как у огня,
 * хвост искр и вспышка лучами в цели.
 */
function orbMats(color: string): { outer: Mat; mid: Mat; core: Mat } {
  const R = rampHex(color);
  return {
    outer: { base: R[1], glow: true, dither: 0, ramp: [R[0], R[1], R[1], R[2], R[2]] },
    mid: { base: R[2], glow: true, dither: 0, noOutline: true, ramp: [R[2], R[2], R[3], R[3], R[4]] },
    core: { base: R[4], glow: true, dither: 0, noOutline: true, ramp: [R[4], R[4], '#ffffff', '#ffffff', '#ffffff'] },
  };
}

export function orbClip(color: string, ang: number, flip = false): FxClip {
  const M = orbMats(color);
  return {
    w: 48, h: 48, n: 4, loop: true,
    draw: (p, _u, f) => p.pose({ rot: ang, px: 0, py: 0 }, () => {
      const r = [5.5, 6, 5.3, 5.8][f];
      p.glow(0, 0, r * 2.4, color, 0.3);
      p.chain([[-10 - (f % 2) * 2, 0.5, r * 0.3], [-4, -0.3, r * 0.75], [0, 0, r]], M.outer, { part: 'orb' });
      p.ellipse(0.5, 0, r * 0.66, r * 0.62, M.mid, { part: 'orbMid', noLine: true });
      p.ellipse(1.2, -r * 0.15, r * 0.3, r * 0.3, M.core, { part: 'orbCore', noLine: true });
    }),
    opts: { flip },
  };
}

/** Вспышка сгустка в цели: кольцо лучей цвета приёма, белое ядро. */
export function orbBurstClip(color: string): FxClip {
  const R = rampHex(color);
  return {
    w: 48, h: 48, n: 5,
    draw: (p, u) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const r0 = 3 + 10 * u, r1 = r0 + 6 * (1 - u) + 1;
        p.line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, i % 2 ? R[4] : R[3]);
      }
      p.glow(0, 0, 12 * (1 - u) + 4, color, 0.4);
      if (u < 0.3) p.disc(0, 0, 3, '#ffffff');
      else if (u < 0.6) p.disc(0, 0, 2, R[4]);
    },
    opts: { fade: [0, 0, 0.2, 0.5, 0.8] },
  };
}

export function orb(L: PxLayer, from: EventTarget, to: EventTarget, color: string, at: number, flight: number): void {
  const f = L.body(from), t = L.body(to);
  if (!f || !t) return;
  const [sx, sy] = muzzle(f, t);
  const ex = t.cx, ey = t.cy;
  const ang = Math.atan2(ey - sy, ex - sx);
  const pos = (tt: number): [number, number] => {
    const k = Math.pow(Math.min(1, tt / flight), 1.2);
    return [lerp(sx, ex, k), lerp(sy, ey, k)];
  };
  L.sprite(aimed(`orb:${color}`, ang, (a, flip) => orbClip(color, a, flip)), { at, loop: true, dur: flight, pos });
  const R = rampHex(color);
  const r = rng(41);
  const back = -Math.cos(ang);
  const motes: Particle[] = [];
  for (let k = 0; k < 10; k++) {
    const born = (k / 10) * flight;
    const [x, y] = pos(born);
    motes.push({ x: x + back * 4, y: y + (r() - 0.5) * 5, vx: back * (8 + r() * 14), vy: (r() - 0.5) * 16, life: 180 + r() * 140, born, colors: ['#ffffff', R[4], R[2]] });
  }
  particles(L, at, motes);
  L.sprite(bake(`orb-burst:${color}`, orbBurstClip(color)), { at: at + flight, pos: () => [ex, ey] });
  L.flash(to, 120, at + flight);
}
