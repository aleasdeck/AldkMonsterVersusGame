import { h } from './dom';
import { LockRun, norm } from './lockCore';
import type { LockGrade } from '../engine/types';

// ─── Взлом сундука: скважина на холсте (v0.54.2) ─────────────────────────────
// Оверлей во весь кадр: тап в любом месте — засечка (пробел и Enter — из hotkeys.ts). Холст 128×128 пикселей поля, на экране
// ×2 — сетка 2 px, как у лепки врагов. Рисунок перенесён из прототипа, который пользователь принял «как есть»: железное кольцо
// с дорожкой, зона на дорожке, отмычка поперёк неё со следом, над скважиной штифты. Состояние — в `LockRun` (lockCore.ts),
// здесь только кадр и строка над скважиной. Оверлей живёт в App (`app.chestLock`) и переносится render() в новое дерево.

const S = 128;
const C = 64;
const N = S * S;
const RAD = Math.PI / 180;
/** Сколько висит итог после последней засечки, прежде чем откроется сундук. */
export const LOCK_RESULT_MS = 900;
const FLASH_MS = 320;

type Rgb = [number, number, number];
const hex = (s: string): Rgb => {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const IRON = ['#141420', '#1e1e2f', '#2b2b42', '#3c3c5a', '#56567c'].map(hex);
const P = {
  void: hex('#05050a'),
  hole: hex('#020204'),
  track: hex('#0e0e18'),
  tick: hex('#2a2a40'),
  plate: hex('#1c1c2e'),
  gold: hex('#ffd166'),
  goldHi: hex('#fff0b8'),
  goldLo: hex('#c9962f'),
  bronze: hex('#a8702e'),
  bronzeHi: hex('#d49445'),
  bronzeLo: hex('#6f4719'),
  spark: hex('#fffbe6'),
  red: hex('#ff6b6b'),
  redHi: hex('#ffb0b0'),
};
const ZONE: Record<'great' | 'good', [Rgb, Rgb, Rgb]> = {
  great: [P.gold, P.goldHi, P.goldLo],
  good: [P.bronze, P.bronzeHi, P.bronzeLo],
};

const sdiff = (a: number, b: number): number => {
  const d = norm(a - b);
  return d > 180 ? d - 360 : d;
};

function put(d: Uint8ClampedArray, i: number, c: Rgb, a = 1): void {
  const k = i * 4;
  if (a >= 1 || d[k + 3] === 0) {
    d[k] = c[0];
    d[k + 1] = c[1];
    d[k + 2] = c[2];
    d[k + 3] = a >= 1 ? 255 : Math.round(a * 255);
    return;
  }
  d[k] += (c[0] - d[k]) * a;
  d[k + 1] += (c[1] - d[k + 1]) * a;
  d[k + 2] += (c[2] - d[k + 2]) * a;
}

/** Ступень рампы железа: свет сверху слева, `flip` — утопленная кромка. */
function lit(t: number, flip = false): number {
  const l = Math.cos((t - 315) * RAD) * (flip ? -1 : 1);
  return l > 0.6 ? 3 : l > 0.1 ? 2 : l > -0.45 ? 1 : 0;
}

interface Field {
  /** Радиус и угол центра каждого пикселя. */
  r: Float32Array;
  t: Float32Array;
  track: Int32Array;
  needle: Int32Array;
  lock: Int32Array;
  base: Uint8ClampedArray;
  hole: Int32Array;
  /** Яркость свечения скважины по пикселю: у головы ярче. */
  fall: Float32Array;
}

let field: Field | null = null;

/** Поле строится один раз, при первом взломе: радиусы, углы, списки пикселей и неподвижная основа замка. */
function getField(): Field {
  if (field) return field;
  const r = new Float32Array(N);
  const t = new Float32Array(N);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - C;
      const dy = y + 0.5 - C;
      const i = y * S + x;
      r[i] = Math.hypot(dx, dy);
      let a = Math.atan2(dx, -dy) / RAD;
      if (a < 0) a += 360;
      t[i] = a;
    }
  const pick = (pred: (ri: number) => boolean): Int32Array => {
    const out: number[] = [];
    for (let i = 0; i < N; i++) if (pred(r[i])) out.push(i);
    return Int32Array.from(out);
  };
  const d = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < N; i++) {
    const ri = r[i];
    const ti = t[i];
    if (ri >= 59.5) continue;
    if (ri >= 58.5) put(d, i, P.void);
    else if (ri >= 55.5) put(d, i, IRON[lit(ti) + (ri >= 57.5 ? 1 : 0)]);
    else if (ri >= 45) {
      const tick = ri < 47.5 && Math.abs(sdiff(ti, Math.round(ti / 30) * 30)) * RAD * ri < 0.6;
      put(d, i, tick ? P.tick : P.track);
    } else if (ri >= 43.5) put(d, i, P.void);
    else if (ri >= 40.5) put(d, i, IRON[lit(ti) + (ri >= 42.5 ? 1 : 0)]);
    else if (ri >= 39.5) put(d, i, IRON[lit(ti, true)]);
    else put(d, i, P.plate);
  }
  // Заклёпки по диагоналям.
  for (const a of [45, 135, 225, 315]) {
    const x = Math.round(C + 34 * Math.sin(a * RAD) - 1);
    const y = Math.round(C - 34 * Math.cos(a * RAD) - 1);
    put(d, y * S + x, IRON[4]);
    put(d, y * S + x + 1, IRON[3]);
    put(d, (y + 1) * S + x, IRON[3]);
    put(d, (y + 1) * S + x + 1, IRON[1]);
  }
  // Скважина: круглая голова и расширяющаяся вниз ножка; кромка светлая снизу справа — отверстие утоплено.
  const cy = 54;
  const rc = 9;
  const m = new Uint8Array(N);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (Math.hypot(px - C, py - cy) <= rc || (py >= cy && py <= 80 && Math.abs(px - C) <= 3.4 + (py - cy) * 0.19)) m[y * S + x] = 1;
    }
  const hole: number[] = [];
  const fall: number[] = [];
  for (let y = 1; y < S - 1; y++)
    for (let x = 1; x < S - 1; x++) {
      const i = y * S + x;
      if (m[i]) {
        put(d, i, P.hole);
        hole.push(i);
        fall.push(Math.max(0, 1 - Math.hypot(x + 0.5 - C, y + 0.5 - cy) / (rc * 1.7)));
        continue;
      }
      const L = m[i - 1];
      const U = m[i - S];
      const R = m[i + 1];
      const D = m[i + S];
      if (L || U || R || D) put(d, i, (L || U) && !(R || D) ? IRON[4] : (R || D) && !(L || U) ? IRON[0] : IRON[2]);
    }
  field = {
    r,
    t,
    track: pick((ri) => ri >= 45 && ri < 55.5),
    needle: pick((ri) => ri >= 43.5 && ri < 58.5),
    lock: pick((ri) => ri < 58.5),
    base: d,
    hole: Int32Array.from(hole),
    fall: Float32Array.from(fall),
  };
  return field;
}

// ─── Кадр ───

function drawZone(f: Field, d: Uint8ClampedArray, lr: LockRun): void {
  for (const i of f.track) {
    const p = lr.dir > 0 ? norm(f.t[i] - lr.zoneStart) : norm(lr.zoneStart - f.t[i]);
    if (p >= lr.zoneLen) continue;
    const c = ZONE[p < lr.greatLen ? 'great' : 'good'];
    const ri = f.r[i];
    put(d, i, ri >= 54.5 ? c[1] : ri < 46 ? c[2] : c[0]);
  }
}

function drawNeedle(f: Field, d: Uint8ClampedArray, a: number, core: Rgb, glow: Rgb): void {
  for (const i of f.needle) {
    const dt = sdiff(f.t[i], a);
    if (dt > 20 || dt < -20) continue;
    const perp = Math.abs(f.r[i] * Math.sin(dt * RAD));
    if (perp < 0.8) put(d, i, core);
    else if (perp < 2) put(d, i, glow, 0.45);
  }
}

function drawTrail(f: Field, d: Uint8ClampedArray, a: number, dir: number): void {
  const len = 40;
  for (const i of f.track) {
    const ri = f.r[i];
    if (ri < 47.5 || ri >= 53) continue;
    const back = dir > 0 ? norm(a - f.t[i]) : norm(f.t[i] - a);
    if (back < 0.5 || back > len) continue;
    put(d, i, P.gold, 0.4 * (1 - back / len));
  }
}

/** Штифты над скважиной: вставший поднят на 3 пикселя, текущий мигает. */
function drawPins(d: Uint8ClampedArray, lr: LockRun, now: number): void {
  for (let j = 0; j < lr.pins; j++) {
    const c = Math.round(64 + (j - (lr.pins - 1) / 2) * 8);
    const hit = lr.hits[j]?.grade;
    const cur = !hit && j === lr.current && lr.phase !== 'done';
    for (let y = 26; y < 39; y++) for (let x = c - 2; x < c + 2; x++) put(d, y * S + x, P.hole);
    const up = hit === 'great' || hit === 'good' ? 3 : 0;
    const blink = Math.floor(now / 125) % 2 === 1;
    const col = hit === 'great' ? P.gold : hit === 'good' ? P.bronze : hit === 'miss' ? P.red : cur && blink ? P.spark : IRON[cur ? 3 : 2];
    const hi = hit === 'great' ? P.goldHi : hit === 'good' ? P.bronzeHi : hit === 'miss' ? P.redHi : IRON[4];
    for (let y = 30 - up; y < 38 - up; y++) for (let x = c - 2; x < c + 2; x++) put(d, y * S + x, y === 30 - up ? hi : col);
  }
}

function drawLock(d: Uint8ClampedArray, lr: LockRun, now: number): void {
  const f = getField();
  d.set(f.base);
  drawZone(f, d, lr);
  const last = lr.hits.at(-1)?.grade;
  if (lr.phase === 'run') {
    const a = lr.angle(now);
    drawTrail(f, d, a, lr.dir);
    drawNeedle(f, d, a, P.spark, P.gold);
  } else if (lr.phase === 'ready') drawNeedle(f, d, lr.a0, P.spark, P.gold);
  else drawNeedle(f, d, lr.hitAngle, last === 'miss' ? P.red : last === 'great' ? P.goldHi : P.bronzeHi, last === 'miss' ? P.red : P.gold);
  drawPins(d, lr, now);
  let glow = 0.3;
  let gcol = P.gold;
  if (lr.phase === 'ready') glow = 0.3 + 0.2 * Math.sin(now / 60);
  else if (lr.phase === 'done') {
    const w = lr.worst;
    glow = w === 'great' ? 1 : w === 'good' ? 0.7 : 0.4;
    gcol = w === 'miss' ? P.red : P.gold;
  }
  for (let j = 0; j < f.hole.length; j++) put(d, f.hole[j], gcol, Math.min(1, glow * (0.25 + 0.75 * f.fall[j])));
  const k = 1 - (now - lr.hitAt) / FLASH_MS;
  if (k > 0) {
    const col = last === 'miss' ? P.red : last === 'great' ? P.spark : P.gold;
    for (const i of f.lock) put(d, i, col, 0.5 * k);
  }
}

// ─── Оверлей ───

const GRADE_NAME: Record<LockGrade, string> = { great: 'Отлично', good: 'Хорошо', miss: 'Сорвалось' };

/** Что взлом дал: движок считает, оверлей пишет в строку итога. */
export interface LockOutcome {
  gold: number;
  needle: number;
}

/** Время события в шкале `performance.now()`: у старых браузеров `timeStamp` бывает в эпохе — тогда берём «сейчас». */
export function eventTime(ev: Event): number {
  const now = performance.now();
  const ts = ev.timeStamp;
  return ts > 0 && ts <= now + 5 && now - ts < 500 ? ts : now;
}

/**
 * Живой взлом: оверлей с холстом и строками, свой цикл кадров. `onDone` зовётся сразу после последней засечки — App кладёт
 * итог в движок и сохраняет забег (перезагрузка страницы на плашке итога иглу не отменит), `onClose` — через LOCK_RESULT_MS,
 * когда пора показать открытый сундук.
 */
export class ChestLockView {
  readonly el: HTMLElement;
  private readonly lr: LockRun;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly frame: ImageData | null;
  private readonly status: HTMLElement;
  private readonly hint: HTMLElement;
  private statusKey = '';
  private raf = 0;
  private outcome: LockOutcome | null = null;
  private closeTimer: number | null = null;
  /** Сколько засечек уже отдано в `onGrade`: срыв по времени (отмычка ушла из зоны) случается без тапа, в кадре. */
  private heard = 0;

  constructor(
    pins: number,
    private readonly onDone: (grades: LockGrade[]) => LockOutcome,
    private readonly onClose: () => void,
    /** Каждая новая засечка — для звука штифта (App, sfx). */
    private readonly onGrade?: (grade: LockGrade) => void,
  ) {
    this.lr = new LockRun(pins, performance.now());
    const canvas = h('canvas', { class: 'lock-canvas', width: String(S), height: String(S) }) as HTMLCanvasElement;
    this.ctx = canvas.getContext('2d');
    this.frame = this.ctx ? this.ctx.createImageData(S, S) : null;
    this.status = h('div', { class: 'lock-status' });
    this.hint = h('div', { class: 'lock-hint dim' }, 'Тап в любом месте или пробел, когда отмычка в золотой зоне');
    this.el = h('div', { class: 'overlay lock-overlay' }, h('div', { class: 'lock-box' }, this.status, canvas, this.hint));
    this.el.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ev.preventDefault();
      this.tap(eventTime(ev));
    });
    this.tick(performance.now());
    this.kick();
  }

  get done(): boolean {
    return this.lr.phase === 'done';
  }

  /** Засечка в момент `t` (тап, пробел, Enter). */
  tap(t: number): void {
    if (this.done) return;
    if (this.lr.tap(t)) this.kick();
    this.hearHits();
  }

  /** Новые засечки — в `onGrade` по одной, сразу как появились: от тапа или срывом по времени. */
  private hearHits(): void {
    while (this.heard < this.lr.hits.length) this.onGrade?.(this.lr.hits[this.heard++].grade);
  }

  /** Снять цикл и таймер: App закрывает взлом, уходя с экрана. */
  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.closeTimer !== null) window.clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  private kick(): void {
    if (!this.raf) this.raf = requestAnimationFrame((now) => this.frameStep(now));
  }

  private frameStep(now: number): void {
    this.raf = 0;
    if (this.tick(now)) this.kick();
  }

  /** Кадр и строка; true — нужен следующий кадр. */
  private tick(now: number): boolean {
    const lr = this.lr;
    lr.update(now);
    this.hearHits();
    if (this.done && !this.outcome) this.finish();
    if (this.ctx && this.frame) {
      drawLock(this.frame.data, lr, now);
      this.ctx.putImageData(this.frame, 0, 0);
    }
    this.syncStatus();
    return !this.done || now - lr.hitAt < FLASH_MS + 20;
  }

  /** Последняя засечка: итог в движок сразу, открытый сундук — после паузы на плашке. */
  private finish(): void {
    if (this.outcome) return;
    if (this.lr.hits.at(-1)?.grade === 'miss') this.shake();
    this.outcome = this.onDone(this.lr.grades);
    this.closeTimer = window.setTimeout(() => {
      this.closeTimer = null;
      this.onClose();
    }, LOCK_RESULT_MS);
  }

  private shake(): void {
    const box = this.el.firstElementChild as HTMLElement | null;
    if (!box) return;
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');
  }

  private syncStatus(): void {
    const lr = this.lr;
    const key = `${lr.phase}:${lr.hits.length}:${this.outcome ? 1 : 0}`;
    if (key === this.statusKey) return;
    this.statusKey = key;
    const pins = h(
      'span',
      { class: 'lock-pins' },
      ...Array.from({ length: lr.pins }, (_, j) => h('i', { class: `lock-pin ${lr.hits[j]?.grade ?? ''}`.trim() })),
    );
    if (lr.phase !== 'done') {
      const what = lr.phase === 'ready' && lr.hits.length === 0 ? 'Приготовьтесь…' : `Штифт ${lr.current + 1} из ${lr.pins}`;
      this.status.replaceChildren(h('span', { class: 'dim' }, what), pins);
      return;
    }
    const w = lr.worst;
    const out = this.outcome;
    const tail = !out ? '' : w === 'miss' ? (out.needle > 0 ? `замок заклинило, игла −${out.needle} HP` : 'замок заклинило') : out.gold > 0 ? `+${out.gold} золота` : 'сундук открыт';
    this.status.replaceChildren(h('span', { class: `lock-grade ${w}` }, GRADE_NAME[w]), pins, h('span', { class: w === 'miss' ? 'lock-minus' : 'dim' }, tail));
    const last = lr.hits.at(-1);
    this.hint.textContent =
      last?.grade !== 'miss' ? ' ' : last.ms === null ? 'Не успели: отмычка ушла из зоны' : last.ms < 0 ? 'Рано: отмычка ещё не дошла до зоны' : 'Поздно: отмычка уже вышла из зоны';
  }
}

