import type { Mat, Painter } from '../mobs/pixel';

/**
 * Общая механика героев-лепки (вынесена из Воина): углы и точки, двухзвенные руки и ноги (`limb2`, `ik`),
 * стопа, которая не достаёт до цели, — на носок (`reachFoot`), штрихи краской по части (`stroke`, `arcStroke`).
 * Координаты героя: x растёт к врагам, y — вниз; углы — градусы: 0 — вперёд, 90 — вниз, 180 — назад, 270 — вверх.
 * Позы, мерки и порядок фигур у каждого героя свои — в его файле (образец — warrior.ts, как — docs/lepka-geroev.md).
 */

export const DEG = Math.PI / 180;

/** Точка на расстоянии `len` от (x, y) под углом `a` градусов: 0 — вперёд (к врагам), 90 — вниз, 180 — назад, 270 — вверх. */
export function at(x: number, y: number, a: number, len: number): [number, number] {
  return [x + len * Math.cos(a * DEG), y + len * Math.sin(a * DEG)];
}

/** Рука из двух звеньев от плеча: направления плеча `a1` и предплечья `a2` (градусы, как в `at`). */
export function limb2(sx: number, sy: number, a1: number, l1: number, a2: number, l2: number): { ex: number; ey: number; hx: number; hy: number } {
  const [ex, ey] = at(sx, sy, a1, l1);
  const [hx, hy] = at(ex, ey, a2, l2);
  return { ex, ey, hx, hy };
}

/** Средний сустав (колено, локоть) по концам `a`→`b` и костям `l1`, `l2`: из двух решений — то, что ближе к направлению (dx, dy). */
export function ik(ax: number, ay: number, bx: number, by: number, l1: number, l2: number, dx: number, dy: number): [number, number] {
  const vx = bx - ax, vy = by - ay;
  const dist = Math.hypot(vx, vy) || 1;
  const d = Math.min(dist, l1 + l2 - 0.01);
  const ux = vx / dist, uy = vy / dist;
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const k1: [number, number] = [ax + l1 * (ux * Math.cos(a) - uy * Math.sin(a)), ay + l1 * (ux * Math.sin(a) + uy * Math.cos(a))];
  const k2: [number, number] = [ax + l1 * (ux * Math.cos(a) + uy * Math.sin(a)), ay + l1 * (-ux * Math.sin(a) + uy * Math.cos(a))];
  return (k1[0] - ax) * dx + (k1[1] - ay) * dy >= (k2[0] - ax) * dx + (k2[1] - ay) * dy ? k1 : k2;
}

export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const ease = (k: number): number => k * k * (3 - 2 * k);

/**
 * Стопа к цели (`ax`, `ay`) от бедра (`hx`, `hy`) ногой длиной `reach`: не достаёт — щиколотка поднимается над целью
 * (пятка отрывается, носок на полу), а если цель дальше ноги даже по горизонтали — нога вытягивается к ней на уровне бедра.
 */
export function reachFoot(hx: number, hy: number, ax: number, ay: number, reach: number): [number, number] {
  const ddx = ax - hx;
  if (Math.hypot(ddx, ay - hy) > reach) {
    if (Math.abs(ddx) < reach) ay = hy + Math.sqrt(reach * reach - ddx * ddx);
    else {
      ax = hx + Math.sign(ddx) * reach;
      ay = hy;
    }
  }
  return [ax, ay];
}

// ─── Штрихи ─────────────────────────────────────────────────────────────────

/** Материал одного цвета — для штрихов краской по части: стык, кромка, блик. Кэш: движок узнаёт материал по объекту. */
const SOLID = new Map<string, Mat>();
export function solid(c: string): Mat {
  let m = SOLID.get(c);
  if (!m) SOLID.set(c, (m = { base: c, ramp: [c, c, c, c, c], dither: 0 }));
  return m;
}

/**
 * Штрих в пиксель краской по своей части (`paint`): в отличие от декали его закрывает всё, что нарисовано позже, —
 * меч поверх ноги не пересекается чертой наколенника.
 */
export function stroke(p: Painter, pts: number[], color: string, part: string): void {
  for (let k = 0; k + 3 < pts.length; k += 2) p.limb(pts[k], pts[k + 1], 0.6, pts[k + 2], pts[k + 3], 0.6, solid(color), { part, paint: true });
}

/** Дуга эллипса штрихом краской по части. */
export function arcStroke(p: Painter, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, color: string, part: string): void {
  const n = Math.max(3, Math.ceil((Math.abs(a1 - a0) / 360) * (rx + ry) * 1.2));
  const pts: number[] = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + ((a1 - a0) * k) / n) * DEG;
    pts.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  }
  stroke(p, pts, color, part);
}
