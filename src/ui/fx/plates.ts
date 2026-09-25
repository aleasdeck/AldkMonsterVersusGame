import type { EventTarget } from '../../engine/types';
import { buildRamp } from '../mobs/pixel';
import { hashCell, rng } from './bake';
import { eachRing, maskBounds, type Mask } from './mask';
import { particles, pxLayer, type Keep, type Particle, type Put, type PxLayer } from './layer';

/**
 * Блок — «Латы» (v0.52.7, выбор пользователя из трёх вариантов: барьер, латы, купол). Сталь ложится по контуру самого
 * бойца от ступней к макушке — со швами пластин и светом сверху слева, латы смыкаются с лязгом (весь контур
 * вспыхивает), по ним пробегает блик. Пока блок держится, латы стоят тонким стальным контуром. Удар в блок звенит
 * вспышкой всего контура и сбивает пластины со стороны удара; пробитый блок — латы ломаются, блок сгорел в начале
 * хода или снят приёмом — тают.
 *
 * Латы — постоянный рисунок слоя (`keep`), а не клип: они живут между перерисовками, пока у бойца есть блок.
 * Рисунок строится по силуэту кадра, который боец показывает сейчас (mask.ts), поэтому своего рисунка на каждого
 * врага не нужно — латы есть у героя, союзника и всех врагов с блоком. Когда начинаются и кончаются — решает
 * `syncPlates` по состоянию боя в конце розыгрыша событий (App.playEvents): там оно уже совпадает с тем, что видно.
 */

export type PlatePhase = 'build' | 'hold' | 'hit' | 'melt' | 'break';

/** Сталь лат: пять тонов от тени к блику. */
const STEEL = ['#2f3a4a', '#566579', '#8595a9', '#bccad8', '#eef4fa'];
/** Цвет блока (как у значка блока): светлая сторона стоящих лат отливает им. */
const BLOCK = '#8ecae6';
const BLOCK_LIT = '#' + buildRamp(BLOCK, 5)[4].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Длительности фаз, мс: латы встают снизу вверх (BUILD_UP), смыкаются с лязгом (CLANK — весь контур белый),
 * по ним бежит блик, и к BUILD фаза сама переходит в стоящие; удар звенит HIT, ломаются BREAK, тают MELT.
 */
export const PLATE_MS = { BUILD: 700, BUILD_UP: 300, CLANK: 90, HIT: 300, BREAK: 420, MELT: 400 } as const;
const { BUILD, BUILD_UP, CLANK, HIT, BREAK, MELT } = PLATE_MS;

/** Во что переходит фаза сама по времени: встали — стоят, отзвенели — стоят, растаяли или сломались — нет лат. */
export function plateAfter(phase: PlatePhase, t: number): PlatePhase | null {
  if ((phase === 'build' && t >= BUILD) || (phase === 'hit' && t >= HIT)) return 'hold';
  if ((phase === 'melt' && t >= MELT) || (phase === 'break' && t >= BREAK)) return null;
  return phase;
}

/**
 * Что делать с латами после розыгрыша событий: `current` — фаза сейчас (null — лат нет), `block` — блок бойца,
 * `struck` — били ли его (null — перерисовка без событий: только поставить недостающие). 'keep' — не трогать.
 */
export function plateSync(current: PlatePhase | null, block: number, struck: boolean | null): PlatePhase | 'keep' {
  if (block > 0) {
    if (current === null) return 'hold';
    if (current === 'melt' || current === 'break') return 'build';
    if (struck && current !== 'build') return 'hit';
    return 'keep';
  }
  if (current === null || struck === null || current === 'melt' || current === 'break') return 'keep';
  return struck ? 'break' : 'melt';
}

/**
 * Латы фазы `phase` через `t` мс по силуэту `M`: `side` — откуда бьют (+1 справа, −1 слева), с этой стороны удар
 * сбивает пластины. Рисует клетками через `put`; без DOM — им же пользуются тесты и tools/fx-sheet.mjs.
 */
export function drawPlates(put: Put, M: Mask, phase: PlatePhase, t: number, side: number): void {
  const yt = M.y0, yb = M.y0 + M.h;
  const top = phase === 'build' ? yb - (yb - yt) * Math.min(1, t / BUILD_UP) : -Infinity;
  const glint = (t - BUILD_UP - CLANK) * 0.4;
  // Растворение: тают — по шуму от начала, ломаются — после вспышки удара.
  const gone = phase === 'melt' ? t / MELT : phase === 'break' ? Math.max(0, (t - 90) / (BREAK - 90)) : 0;
  const flash = ((phase === 'hit' || phase === 'break') && t < 90) || (phase === 'build' && t >= BUILD_UP && t < BUILD_UP + CLANK);
  const thick = (phase === 'build' && t < BUILD_UP + CLANK + 90) || flash || (phase === 'hit' && t < 200);
  eachRing(M, (x, y, dOut, _dIn, lit, nx) => {
    if (dOut < 1 || dOut > 2 || y < top) return;
    if (dOut === 2 && !thick) return;
    if (gone > 0 && hashCell(x, y) < gone * 1.1) return;
    // Со стороны удара пластины слетают: клетки мигают и пропадают.
    if (phase === 'hit' && t >= 90 && nx * side > 0.3 && hashCell(x, y + Math.floor(t / 60)) < 0.35) return;
    const seam = (x * 3 + y * 5) % 13 === 0;
    const tone = Math.max(0, Math.min(4, Math.round(2 + lit * 2) - (dOut === 2 ? 1 : 0) - (seam ? 2 : 0)));
    const solid = (phase === 'build' && t < BUILD_UP + CLANK + 90) || flash;
    let c = STEEL[tone];
    if (phase === 'build' && y - top < 2) c = '#ffffff';
    else if (flash) c = '#ffffff';
    else if (phase === 'build' && t > BUILD_UP + CLANK && Math.abs(x - M.x0 + (y - yt) - glint) < 2) c = '#ffffff';
    else if (dOut === 1 && tone >= 3 && !solid) c = BLOCK_LIT;
    put(x, y, c, solid || c === '#ffffff' ? 1 : 0.6);
  });
}

class Plates implements Keep {
  phase: PlatePhase;
  t0: number;

  constructor(readonly target: EventTarget, phase: PlatePhase, now: number) {
    this.phase = phase;
    this.t0 = now;
  }

  set(phase: PlatePhase, now: number): void {
    this.phase = phase;
    this.t0 = now;
  }

  draw(put: Put, now: number, L: PxLayer): boolean {
    const next = plateAfter(this.phase, now - this.t0);
    if (next === null) return false;
    if (next !== this.phase) this.set(next, now);
    const M = L.mask(this.target);
    // Силуэта пока нет (лист героя грузится) — латы ждут; бойца нет на поле (погиб, бой кончился) — лат тоже.
    if (!M) return !!L.spriteOf(this.target);
    drawPlates(put, M, this.phase, now - this.t0, L.sideOf(this.target));
    return true;
  }
}

const key = (t: EventTarget): string => `plates:${t}`;

function platesOf(L: PxLayer, t: EventTarget): Plates | undefined {
  const k = L.keeps.get(key(t));
  return k instanceof Plates ? k : undefined;
}

/** Осколки стали: слетают со стороны удара и падают к ногам. */
function chips(L: PxLayer, target: EventTarget, n: number, seed: number): void {
  const M = L.mask(target);
  const b = M ? maskBounds(M) : null;
  if (!b) return;
  const side = L.sideOf(target);
  const x = side > 0 ? b.right + 1 : b.left - 1, y = (b.top + b.bottom) / 2;
  const r = rng(seed);
  const list: Particle[] = [];
  for (let k = 0; k < n; k++) {
    list.push({ x, y: y + (r() - 0.5) * (b.bottom - b.top) * 0.6, vx: side * (20 + r() * 50), vy: -30 - r() * 50, g: 300, life: 700, born: r() * 40, colors: [STEEL[4], STEEL[3], STEEL[2]], floor: b.bottom });
  }
  particles(L, 0, list);
}

/** Боец набрал блок: латы встают заново, даже если уже стояли (блок подрос). */
export function platesGain(root: ParentNode, target: EventTarget): void {
  const L = pxLayer(root);
  if (!L) return;
  const now = L.now();
  const p = platesOf(L, target);
  if (p) p.set('build', now);
  else L.keep(key(target), new Plates(target, 'build', now));
  L.flash(target, 240, 40);
}

/**
 * Свести латы с состоянием боя после розыгрыша событий (переходы — `plateSync`): `fighters` — блок каждого бойца
 * на поле, `struck` — кого ударили в этом розыгрыше (раны мимо блока не в счёт); null — перерисовка без событий.
 */
export function syncPlates(root: ParentNode, fighters: Array<[EventTarget, number]>, struck: Set<EventTarget> | null): void {
  const L = pxLayer(root);
  if (!L) return;
  const now = L.now();
  const alive = new Set(fighters.map(([t]) => String(t)));
  for (const [k, keep] of L.keeps) if (keep instanceof Plates && !alive.has(String(keep.target))) L.keeps.delete(k);
  for (const [t, block] of fighters) {
    const p = platesOf(L, t);
    const next = plateSync(p?.phase ?? null, block, struck ? struck.has(t) : null);
    if (next === 'keep') continue;
    if (!p) L.keep(key(t), new Plates(t, next, now));
    else p.set(next, now);
    if (next === 'hit') chips(L, t, 8, 131);
    if (next === 'break') chips(L, t, 14, 137);
  }
}
