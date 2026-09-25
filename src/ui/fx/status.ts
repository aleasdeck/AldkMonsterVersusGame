import type { EventTarget } from '../../engine/types';
import { buildRamp, type Mat, type Painter } from '../mobs/pixel';
import { flame } from '../mobs/fire';
import { bake, clamp01, rng, type FxClip } from './bake';
import { particles, type Particle, type PxLayer } from './layer';

/**
 * Статусы на цели пиксельной лепкой (GDD §12.45): у каждого свой короткий рисунок вместо облака цвета статуса.
 * Играют в момент наложения — по событию `status` в App.playEvents, когда цифры удара уже всплыли, поверх любого
 * приёма, который вешает статус (удар, стрела, склянка, аффикс оружия, приём врага). Кровь — капли и брызг на полу,
 * горение — языки у ног, оглушение — звёзды над головой, холод и оцепенение — снежинки и иней у ног, яд — туча.
 * Лечение — круг света у ног, столбики и искры вверх.
 */

const CELL = 2;
const toHex = (rgb: number[]): string => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// ─── Кровь ──────────────────────────────────────────────────────────────────

/** Кровотечение: капли брызгают из раны в сторону от удара, падают на пол и лежат брызгом. */
export function bleed(L: PxLayer, target: EventTarget): void {
  const t = L.body(target);
  if (!t) return;
  const away = -L.sideOf(target);
  const r = rng(11);
  const list: Particle[] = [];
  for (let k = 0; k < 9; k++) {
    list.push({
      x: t.cx + (r() - 0.3) * 4 * away, y: t.cy + (r() - 0.5) * 6,
      vx: away * (12 + r() * 40), vy: -40 - r() * 45, g: 260, life: 2000, born: r() * 60,
      colors: ['#e63946', '#b3202c', '#8b1a1a'], floor: t.bottom - 1 - Math.floor(r() * 3), size: k % 3 === 0 ? 2 : 1,
    });
  }
  particles(L, 0, list, '#6e1218');
}

// ─── Горение ────────────────────────────────────────────────────────────────

/** Горение у ног цели шириной `w` клеток: три языка дрожат по кадрам, вырастают и опадают. */
export function burnClip(w: number): FxClip {
  const W = Math.ceil((w * CELL + 24) / 4) * 4;
  const xs = [-W * 0.22, 0, W * 0.2];
  const sw = [[1.4, -1, 0.6, -1.2], [-1, 1.2, -0.4, 0.9], [0.8, -0.6, 1.3, -1]];
  const grow = [0.5, 0.85, 1, 1, 1, 1, 1, 1, 0.9, 0.8, 0.65, 0.5];
  return {
    w: W, h: 56, n: 12,
    draw: (p, _u, f) => xs.forEach((x, i) => flame(p, x, 20, 3.4 * grow[f] + 0.4, (12 + i * 3 + (i === 1 ? 3 : 0)) * grow[f], sw[i][f % 4], -0.5, String(i))),
    opts: { fade: [0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.4, 0.6, 0.8] },
  };
}

export function burn(L: PxLayer, target: EventTarget): void {
  const t = L.body(target);
  if (!t) return;
  const w = Math.round(t.w / 4) * 4;
  L.sprite(bake(`burn:${w}`, burnClip(w)), { at: 60, pos: () => [t.cx, t.bottom - 10] });
}

// ─── Оглушение ──────────────────────────────────────────────────────────────

const STAR: Mat = { base: '#ffd84a', glow: true, dither: 0, ramp: ['#e0a21a', '#f0b624', '#ffc832', '#ffdc5a', '#fff2a8'] };
const STAR_BACK: Mat = { base: '#c8921c', glow: true, dither: 0, ramp: ['#8a5a10', '#a06c14', '#b8801a', '#cc9422', '#dcaa34'] };

function starShape(p: Painter, r: number, mat: Mat): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  p.poly(pts, mat, { part: 'star', bevel: 0.8 });
}

/** Звезда оглушения: ближняя — крупная и светлая, дальняя — мельче и темнее. */
export function starClip(front: boolean): FxClip {
  return front
    ? { w: 20, h: 20, n: 1, loop: true, draw: (p) => { starShape(p, 5.5, STAR); p.px(-1, -1, '#ffffff'); } }
    : { w: 16, h: 16, n: 1, loop: true, draw: (p) => starShape(p, 3.6, STAR_BACK) };
}

/** Три звезды кружат над головой: круг за восемь кадров, последние четверть секунды мигают. */
export function stun(L: PxLayer, target: EventTarget): void {
  const t = L.body(target);
  if (!t) return;
  const front = bake('star:front', starClip(true)), back = bake('star:back', starClip(false));
  const DUR = 1300, PERIOD = 8 * (1000 / 12);
  const rx = Math.max(7, t.w * 0.26), cy = t.top - 3;
  for (let k = 0; k < 3; k++) {
    const phase = (k / 3) * Math.PI * 2;
    L.sprite((tt) => (Math.sin((tt / PERIOD) * Math.PI * 2 + phase) > 0 ? front : back), {
      at: 60, dur: DUR, loop: true,
      pos: (tt) => {
        const a = (tt / PERIOD) * Math.PI * 2 + phase;
        return [t.cx - 1 + Math.cos(a) * rx, cy + Math.sin(a) * 2.5];
      },
      frameAt: (tt) => (tt > DUR - 250 && Math.floor(tt / 60) % 2 ? -1 : 0),
    });
  }
}

// ─── Холод ──────────────────────────────────────────────────────────────────

const ICE: Mat = { base: '#8fd0ea', shine: 0.9, dither: 0, ramp: ['#24507a', '#3d7fae', '#6cb4dc', '#b2e4f6', '#effcff'] };
const ICE_DARK: Mat = { base: '#4f8fbf', dither: 0, ramp: ['#1b3d63', '#2c5f8e', '#4a88b8', '#7ab4d8', '#b2e4f6'] };

/** Иней у ног цели шириной `w` клеток: кристаллы нарастают из пола, стоят и тают. */
export function rimeClip(w: number): FxClip {
  const W = Math.ceil((w * CELL + 20) / 4) * 4;
  return {
    w: W, h: 52, n: 10,
    draw: (p, _u, f) => {
      const r = rng(41);
      const grow = [0.3, 0.7, 1, 1, 1, 1, 1, 1, 1, 1][f];
      for (let i = 0; i < 6; i++) {
        const x = (i / 5 - 0.5) * (W - 28) + (r() - 0.5) * 5;
        const hgt = (12 + r() * 12) * grow;
        const lean = (r() - 0.5) * 7;
        p.poly([x - 4, 14, x - 1.5 + lean * 0.4, 14 - hgt * 0.6, x + lean, 14 - hgt, x + 1.5 + lean * 0.5, 14 - hgt * 0.5, x + 4, 14], ICE, { part: 'rime', bevel: 1 });
      }
      p.ellipse(0, 14, W / 2 - 10, 2.2, ICE_DARK, { part: 'rimeBase', flat: 0.8 });
    },
    opts: { fade: [0, 0, 0, 0, 0, 0, 0.2, 0.45, 0.65, 0.85] },
  };
}

/** Холод и оцепенение: снежинки опускаются на цель, у ног нарастает иней. */
export function cold(L: PxLayer, target: EventTarget): void {
  const t = L.body(target);
  if (!t) return;
  const r = rng(31);
  const flakes: Particle[] = [];
  for (let k = 0; k < 7; k++) {
    flakes.push({ x: t.cx + (r() - 0.5) * t.w * 0.8, y: t.top + r() * t.h * 0.3, vx: 0, vy: 14 + r() * 8, sway: 1.2, life: 700 + r() * 300, born: 40 + k * 70, colors: ['#ffffff', '#e0f7ff', '#bfefff', '#7fd7ff'], plus: true });
  }
  particles(L, 0, flakes);
  const w = Math.round(t.w / 4) * 4;
  L.sprite(bake(`rime:${w}`, rimeClip(w)), { at: 60, pos: () => [t.cx, t.bottom - 7] });
}

// ─── Яд ─────────────────────────────────────────────────────────────────────

/** Цвет ядовитой тучи: болезненная бледная зелень, светлее листвы, чтобы туча не читалась кустом. */
const POISON = '#9fcf66';

/** Ядовитая туча шириной `w` клеток: клубы горкой одной поверхности растут и поднимаются, лопаются пузыри, газ тает. */
export function cloudClip(color: string, w: number): FxClip {
  const W = Math.ceil((w * CELL + 48) / 4) * 4;
  const GAS: Mat = { base: color, spread: 0.36, tex: { kind: 'noise', scale: 5, amp: 0.08 }, noOutline: true };
  const puffs: Array<[number, number, number]> = [[-21, 8, 6], [-8, 9, 7], [8, 9, 7], [21, 8, 6], [-12, -3, 9], [11, -2, 8.5], [0, -13, 10]];
  return {
    w: W, h: 96, n: 11,
    draw: (p, u) => {
      const r = rng(61);
      const grow = 0.5 + 0.7 * Math.min(1, u * 2);
      const rise = 16 * u;
      for (const [x, y, rr] of puffs) {
        const wob = (r() - 0.5) * 3;
        p.ellipse(x * (0.7 + 0.4 * grow) + wob, y * grow - rise, rr * grow * 1.1, rr * grow * 0.9, GAS, { part: 'gas', flat: 0.15 });
      }
      // Пузыри лопаются по одному.
      for (let i = 0; i < 4; i++) {
        const at = 0.15 + i * 0.18;
        if (u < at || u > at + 0.2) continue;
        const bx = (r() - 0.5) * (W - 48), by = -4 - (u - at) * 60;
        if (u > at + 0.14) {
          p.px(bx - 2, by, '#e8ffd8');
          p.px(bx + 2, by, '#e8ffd8');
          p.px(bx, by - 2, '#e8ffd8');
        } else p.disc(bx, by, 2, '#e8ffd8', true);
      }
    },
    opts: { fade: [0, 0, 0, 0, 0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85], alpha: 0.78 },
  };
}

export function poison(L: PxLayer, target: EventTarget): void {
  const t = L.body(target);
  if (!t) return;
  const w = Math.round(t.w / 4) * 4;
  L.sprite(bake(`cloud:${POISON}:${w}`, cloudClip(POISON, w)), { at: 40, pos: () => [t.cx, t.cy] });
}

// ─── Лечение ────────────────────────────────────────────────────────────────

/** Круг света у ног шириной `w` клеток: два кольца, передняя дуга светлее, внутри полупрозрачная плёнка. */
export function ringClip(color: string, w: number): FxClip {
  const W = Math.ceil((w * CELL * 1.1 + 16) / 4) * 4;
  return {
    w: W, h: 28, n: 8,
    draw: (p, u) => {
      const k = 0.55 + 0.45 * Math.min(1, u * 2.5);
      const rx = (W / 2 - 8) * k, ry = 6 * k;
      for (let ring = 0; ring < 2; ring++) {
        const s = ring ? 0.7 : 1;
        for (let i = 0; i < 72; i++) {
          const a = (i / 72) * Math.PI * 2;
          p.px(Math.cos(a) * rx * s, Math.sin(a) * ry * s, ring ? color + 'cc' : Math.sin(a) > 0 ? '#f0fff4' : color);
        }
      }
      p.film([-rx * 0.9, 0, -rx * 0.5, -ry * 0.8, rx * 0.5, -ry * 0.8, rx * 0.9, 0, rx * 0.5, ry * 0.8, -rx * 0.5, ry * 0.8], color + '40');
    },
    opts: { fade: [0, 0, 0, 0, 0.2, 0.45, 0.7, 0.88] },
  };
}

/** Столбики света от круга вверх: полупрозрачная плёнка с яркой макушкой. */
export function beamClip(color: string, w: number, hgt: number): FxClip {
  const W = Math.ceil((w * CELL + 16) / 4) * 4, H = Math.ceil((hgt * CELL + 24) / 4) * 4;
  return {
    w: W, h: H, n: 10,
    draw: (p, u) => {
      const r = rng(83);
      for (let i = 0; i < 7; i++) {
        const x = (i / 6 - 0.5) * (W - 20) + (r() - 0.5) * 4;
        // Средний столбик встаёт сразу — иначе первый кадр клипа пуст и лечение запаздывает на кадр.
        const start = r() * 0.35 * (i === 3 ? 0 : 1);
        const k = clamp01((u - start) / 0.65 + 0.06);
        const len = 12 + r() * 16;
        if (k <= 0 || k >= 1) continue;
        const y1 = H / 2 - 10 - k * (H - 28), y0 = Math.min(H / 2 - 4, y1 + len * (1 - k * 0.5));
        p.film([x - 1.8, y0, x - 1.8, y1, x + 1.8, y1, x + 1.8, y0], color + '66');
        p.line(x, y1, x, y1 + 3, '#f0fff4');
      }
    },
  };
}

/** Лечение: зелёный круг у ног, столбики света и искры с крестиками вверх, боец коротко светлеет. */
export function heal(L: PxLayer, target: EventTarget, color = '#80ed99'): void {
  const t = L.body(target);
  if (!t) return;
  const w = Math.round(t.w / 4) * 4, hh = Math.round((t.h * 0.9) / 4) * 4;
  L.sprite(bake(`ring:${color}:${w}`, ringClip(color, w)), { at: 0, pos: () => [t.cx, t.bottom - 1] });
  L.sprite(bake(`beam:${color}:${w}:${hh}`, beamClip(color, w, hh)), { at: 60, pos: () => [t.cx, t.bottom - hh / 2] });
  const dark = toHex(buildRamp(color, 5)[0]);
  const r = rng(81);
  const motes: Particle[] = [];
  for (let k = 0; k < 18; k++) {
    motes.push({ x: t.cx + (r() - 0.5) * t.w * 1.1, y: t.bottom - 3 - r() * t.h * 0.55, vx: 0, vy: -20 - r() * 18, sway: 1.1, life: 560 + r() * 300, born: 30 + k * 32, colors: ['#ffffff', '#e8fff0', color, color, dark], plus: k % 2 === 0 });
  }
  particles(L, 0, motes);
  L.flash(target, 360, 80);
}

