import type { EventTarget } from '../../engine/types';
import type { Mat, Painter } from '../mobs/pixel';
import { bake, type FxClip } from './bake';
import { sparks, type PxLayer } from './layer';

/**
 * Удар клинком — мазок по дуге (семейство «удар клинком», GDD §12.45). Вместо клинка 7×16, провёрнутого CSS над целью,
 * по цели проходит полумесяц мазка: внутри цвет приёма, к внешнему краю светлеет до белого — так читается движение
 * лезвия. Пять кадров по 12 в секунду; полная дуга с белым ядром и вспышкой-крестом приходится ровно на попадание.
 *
 * Тот же мазок — след удара врага на герое (решение В5): лепка врага сама замахивается своим оружием, поверх неё больше
 * не летает общий клинок, а у героя в момент контакта проходит зеркальный мазок цвета оружия врага.
 */

const SMEAR: Mat = { base: '#dfe6ee', glow: true, dither: 0, noOutline: true, ramp: ['#8d9bb0', '#b3bfce', '#d6dee8', '#eef3f8', '#ffffff'] };
const SMEAR_CORE: Mat = { base: '#ffffff', glow: true, dither: 0, noOutline: true, ramp: ['#e9eef4', '#f4f7fa', '#ffffff', '#ffffff', '#ffffff'] };
/** Кромка мазка по умолчанию — сталь: обычный удар оружием. */
export const STEEL_EDGE = '#aeb9c8';

/** Светящаяся кромка цвета приёма: рамп из цвета, без контура. */
function edgeMat(color: string): Mat {
  return { base: color, glow: true, dither: 0, noOutline: true, spread: 0.35 };
}

const SQUASH = 0.8;
const TILT = 0.45;
/** Дуга мазка — от левого края над целью через верх к правому низу (радианы, y вниз). */
const A0 = -2.9, A1 = 0.35;
/** Где на дуге вспышка удара: доля пути мазка. */
const HIT_AT = 0.62;

/**
 * Полумесяц: дуга эллипса от `a0` до `a1`, толщина `T` по синусу — тонкие концы, толстая середина, передний край
 * острее хвоста. Внешний край на радиусе `R`, внутренний — на `R − толщина`.
 */
function crescent(p: Painter, a0: number, a1: number, R: number, T: number, mat: Mat, part: string): void {
  if (a1 - a0 < 0.05 || T < 0.4) return;
  const N = 16;
  const pts: number[] = [];
  const cr = Math.cos(TILT), sr = Math.sin(TILT);
  const push = (r: number, th: number): void => {
    const x = r * Math.cos(th), y = r * Math.sin(th) * SQUASH;
    pts.push(x * cr - y * sr, x * sr + y * cr);
  };
  for (let i = 0; i <= N; i++) push(R, a0 + ((a1 - a0) * i) / N);
  for (let i = N; i >= 0; i--) {
    const k = i / N;
    push(R - T * Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.08)), 0.7), a0 + (a1 - a0) * k);
  }
  p.poly(pts, mat, { part, noLine: true, flat: 1 });
}

/** Точка на дуге мазка радиуса `R` — там вспышка удара. */
function arcPt(a: number, R: number): [number, number] {
  const x = R * Math.cos(a), y = R * Math.sin(a) * SQUASH;
  return [x * Math.cos(TILT) - y * Math.sin(TILT), x * Math.sin(TILT) + y * Math.cos(TILT)];
}

/** Стадии мазка по кадрам: от, до (доли дуги), толщина кромки, толщина белого ядра. */
const STAGES: Array<[number, number, number, number]> = [
  [0, 0.45, 10, 3],
  [0, 1, 19, 6],
  [0.3, 1, 15, 4],
  [0.62, 1, 10, 2],
  [0.86, 1, 5, 0],
];

/**
 * Кадры мазка радиуса `R` с кромкой `edge`: начало взмаха, полная дуга с белым ядром и вспышкой, хвост уходит,
 * остатки гаснут. `flip` — зеркально: удар справа налево (враг по герою).
 */
export function slashClip(R: number, edge: string, flip = false): FxClip {
  const EDGE = edgeMat(edge);
  const span = A1 - A0;
  const W = Math.ceil((R * 2 + 16) / 4) * 4;
  return {
    w: W, h: W, n: STAGES.length,
    draw: (p, _u, f) => {
      const [s0, s1, t, core] = STAGES[f];
      crescent(p, A0 + span * s0, A0 + span * s1, R, t, EDGE, 'edge');
      crescent(p, A0 + span * s0 + 0.06, A0 + span * s1, R, t * 0.58, SMEAR, 'smear');
      if (core > 0) crescent(p, A0 + span * (s0 + 0.1), A0 + span * s1 - 0.03, R, core, SMEAR_CORE, 'core');
      // Вспышка удара там, где дуга проходит по центру цели.
      if (f === 1 || f === 2) {
        const [hx, hy] = arcPt(A0 + span * HIT_AT, R - 3);
        const L = f === 1 ? 9 : 6;
        p.line(hx - L, hy, hx + L, hy, '#ffffff');
        p.line(hx, hy - L * 0.8, hx, hy + L * 0.8, '#ffffff');
        p.line(hx - L * 0.45, hy - L * 0.45, hx + L * 0.45, hy + L * 0.45, edge);
        p.line(hx - L * 0.45, hy + L * 0.45, hx + L * 0.45, hy - L * 0.45, edge);
        p.glow(hx, hy, f === 1 ? 10 : 7, edge, 0.45);
      }
    },
    opts: { fade: [0, 0, 0.1, 0.35, 0.65], flip },
  };
}

/** Кадров в секунду у мазка: полная дуга — второй кадр, через 83 мс после начала. */
const FPS = 12;

/**
 * Мазок по цели `to` от бойца `from`: полная дуга — в момент `hit` мс от сейчас, искры — туда же. Кромка — `edge`.
 * Радиус — по росту цели: мелкого гоблина мазок не перекрывает целиком, тролля — не теряется на нём.
 */
export function slash(L: PxLayer, from: EventTarget, to: EventTarget, edge: string, hit: number): void {
  const t = L.body(to), f = L.body(from);
  if (!t) return;
  const flip = !!f && f.cx > t.cx;
  const R = Math.round(Math.max(22, Math.min(38, t.h * 2 * 0.45)) / 2) * 2;
  const frames = bake(`slash:${R}:${edge}:${flip ? 'l' : 'r'}`, slashClip(R, edge, flip));
  const cy = t.cy + 1;
  L.sprite(frames, { at: Math.max(0, hit - 1000 / FPS), fps: FPS, pos: () => [t.cx, cy] });
  const [hx, hy] = arcPt(A0 + (A1 - A0) * HIT_AT, R - 3);
  sparks(L, hit, t.cx + ((flip ? -1 : 1) * hx) / 2, cy + hy / 2, edge === STEEL_EDGE ? '#ffffff' : edge, 7, 3, flip ? -1 : 1);
}
