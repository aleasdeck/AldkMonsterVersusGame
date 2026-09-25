import type { EventTarget } from '../../engine/types';
import { CELL, type FxFrame } from './bake';
import { fighterMask, maskBounds, type FieldRect, type Mask } from './mask';

/**
 * Слой лепки эффектов (v0.53): холст поверх поля боя в сетке 2 px — клетка холста совпадает с пикселем лепки
 * и фона, поэтому эффект не бывает «крупнее мира». Холст лежит внутри `.fx-layer`, а тот при перерисовке
 * переезжает в новое дерево (App.render), так что эффект доигрывается после `render()`, как снаряды fx.ts.
 *
 * Что рисует слой: клипы запечённых кадров (`sprite`) в точке, которая может двигаться (полёт — плавно по целым
 * клеткам), клетки (`cells`: частицы, волны, молния), события по времени (`at`), а ещё «держателей» (`keeps`) —
 * постоянный рисунок, который живёт, пока держится состояние боя (латы блока). Цикл кадров крутится, только пока
 * есть что рисовать, и гаснет, когда слой ушёл из документа (конец боя).
 */

export type Put = (x: number, y: number, color: string, a?: number) => void;

/** Боец в клетках холста: центр, макушка, ноги, ширина и рост фигуры. */
export interface Body { cx: number; cy: number; top: number; bottom: number; w: number; h: number }

/** Постоянный рисунок слоя: рисует себя каждый кадр; false — убрать. */
export interface Keep { draw(put: Put, now: number, L: PxLayer): boolean }

interface Track { start: number; end: number; draw: (ctx: CanvasRenderingContext2D, t: number) => void }

export interface SpriteOpts {
  /** Когда начать, мс от сейчас. */
  at: number;
  /** Кадров в секунду; у эффектов, как у клипов врагов, 12. */
  fps?: number;
  /** Сколько играть, мс; по умолчанию — один проход кадров. */
  dur?: number;
  loop?: boolean;
  /** Где якорь кадра в момент `t` мс от начала, клетки холста; дробное округляется до клетки. */
  pos: (t: number) => [number, number];
  /** Свой номер кадра по времени; −1 — не рисовать (мигание). */
  frameAt?: (t: number) => number;
}

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class PxLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private tracks: Track[] = [];
  private events: Array<{ t: number; fn: () => void }> = [];
  private raf = 0;
  /** Постоянные рисунки по ключу (латы — `plates:<боец>`). */
  readonly keeps = new Map<string, Keep>();

  constructor(readonly el: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fx-canvas';
    this.ctx = this.canvas.getContext('2d');
    el.appendChild(this.canvas);
    this.fit();
  }

  now(): number {
    return performance.now();
  }

  /** Холст — половина слоя по каждой стороне: клетка ровно 2 px поля. */
  private fit(): void {
    const W = Math.max(1, Math.ceil(this.el.offsetWidth / CELL)), H = Math.max(1, Math.ceil(this.el.offsetHeight / CELL));
    if (this.canvas.width === W && this.canvas.height === H) return;
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.width = `${W * CELL}px`;
    this.canvas.style.height = `${H * CELL}px`;
  }

  sprite(frames: FxFrame[] | ((t: number) => FxFrame[]), o: SpriteOpts): void {
    const fps = o.fps ?? 12;
    const get = typeof frames === 'function' ? frames : () => frames;
    const dur = o.dur ?? (get(0).length * 1000) / fps;
    const start = this.now() + o.at;
    this.push({
      start, end: start + dur,
      draw: (ctx, t) => {
        const list = get(t);
        let i = o.frameAt ? o.frameAt(t) : Math.floor((t * fps) / 1000);
        if (i < 0 || !list.length) return;
        i = o.loop ? i % list.length : Math.min(list.length - 1, i);
        const f = list[i];
        const [x, y] = o.pos(t);
        ctx.drawImage(f.c, Math.round(x) - f.ax, Math.round(y) - f.ay);
      },
    });
  }

  cells(o: { at: number; dur: number; draw: (put: Put, t: number) => void }): void {
    const start = this.now() + o.at;
    this.push({ start, end: start + o.dur, draw: (ctx, t) => o.draw(putter(ctx), t) });
  }

  at(ms: number, fn: () => void): void {
    this.events.push({ t: this.now() + ms, fn });
    this.wake();
  }

  keep(key: string, k: Keep): void {
    this.keeps.set(key, k);
    this.wake();
  }

  /** Короткая вспышка спрайта бойца: осветление без размытия, поверх его тонировки. */
  flash(target: EventTarget, ms: number, at: number): void {
    this.at(at, () => {
      const el = this.spriteOf(target);
      if (!el) return;
      const base = getComputedStyle(el).filter;
      const tint = base && base !== 'none' ? `${base} ` : '';
      el.animate([{ filter: `${tint}brightness(1)` }, { filter: `${tint}brightness(1.7) saturate(1.3)`, offset: 0.3 }, { filter: `${tint}brightness(1)` }], { duration: ms });
    });
  }

  /** Толчок поля целыми пикселями (крик, удар в землю). При «меньше движения» не трясёт. */
  shake(ms: number, at: number): void {
    if (reducedMotion()) return;
    this.at(at, () => {
      const field = this.el.parentElement;
      const k = ['2px 0', '-2px 0', '2px -2px', '-2px 0', '0 2px', '0 0'];
      field?.animate(k.map((translate) => ({ translate, easing: 'steps(1, end)' })), { duration: ms });
    });
  }

  // ─── Бойцы ────────────────────────────────────────────────────────────────

  /** Спрайт бойца. Именно из .sprite-wrap: у иконок статусов над головой тот же класс sprite. */
  spriteOf(target: EventTarget): HTMLElement | null {
    const field = this.el.parentElement;
    return field?.querySelector<HTMLElement>(target === 'hero' ? '.hero-zone .sprite-wrap .sprite' : `[data-uid="${target}"] .sprite-wrap .sprite`) ?? null;
  }

  /** Прямоугольник спрайта в пикселях поля относительно слоя. */
  rectOf(el: HTMLElement): FieldRect {
    const lr = this.el.getBoundingClientRect();
    const k = lr.width / (this.el.offsetWidth || 1) || 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left - lr.left) / k, y: (r.top - lr.top) / k, w: r.width / k, h: r.height / k };
  }

  /** Силуэт бойца в клетках холста — кадр, который он показывает сейчас. */
  mask(target: EventTarget): Mask | null {
    const el = this.spriteOf(target);
    return el ? fighterMask(el, this.rectOf(el)) : null;
  }

  /** Боец в клетках: по силуэту, если он есть, иначе по рамке спрайта. */
  body(target: EventTarget): Body | null {
    const el = this.spriteOf(target);
    if (!el) return null;
    const M = fighterMask(el, this.rectOf(el));
    const b = M ? maskBounds(M) : null;
    if (b) return { cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2, top: b.top, bottom: b.bottom + 1, w: b.right - b.left + 1, h: b.bottom - b.top + 1 };
    const r = this.rectOf(el);
    return { cx: (r.x + r.w / 2) / CELL, cy: (r.y + r.h / 2) / CELL, top: r.y / CELL, bottom: (r.y + r.h) / CELL, w: (r.w * 0.5) / CELL, h: r.h / CELL };
  }

  /** Со стороны, откуда приходят удары: герою и союзникам — справа (+1), врагам — слева (−1). */
  sideOf(target: EventTarget): number {
    return target !== 'hero' && this.spriteOf(target)?.closest('.enemy') ? -1 : 1;
  }

  // ─── Цикл ─────────────────────────────────────────────────────────────────

  private push(tr: Track): void {
    this.tracks.push(tr);
    this.wake();
  }

  private wake(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (): void => {
    this.raf = 0;
    // Бой кончился, слой ушёл из документа: всё недоигранное снимается.
    if (!this.el.isConnected) {
      this.tracks = [];
      this.events = [];
      this.keeps.clear();
      return;
    }
    const clock = this.now();
    const due = this.events.filter((e) => e.t <= clock);
    this.events = this.events.filter((e) => e.t > clock);
    for (const e of due) e.fn();
    this.fit();
    const ctx = this.ctx;
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.tracks = this.tracks.filter((tr) => tr.end > clock);
      for (const tr of this.tracks) if (clock >= tr.start) tr.draw(ctx, clock - tr.start);
      const put = putter(ctx);
      for (const [key, k] of this.keeps) if (!k.draw(put, clock, this)) this.keeps.delete(key);
    }
    if (this.tracks.length || this.events.length || this.keeps.size) this.raf = requestAnimationFrame(this.frame);
  };
}

function putter(ctx: CanvasRenderingContext2D): Put {
  return (x, y, color, a = 1) => {
    if (a <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    ctx.globalAlpha = 1;
  };
}

const layers = new WeakMap<HTMLElement, PxLayer>();

/** Слой лепки эффектов в поле боя `root`; null — поля нет (не бой). Один на `.fx-layer`, переживает перерисовку. */
export function pxLayer(root: ParentNode): PxLayer | null {
  const el = root.querySelector<HTMLElement>('.fx-layer');
  if (!el) return null;
  let L = layers.get(el);
  if (!L) {
    L = new PxLayer(el);
    layers.set(el, L);
  }
  return L;
}

// ─── Частицы ────────────────────────────────────────────────────────────────

/** Частица клеткой: скорость в клетках/с, цвет по возрасту (первый — свежий), падение до `floor`. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Жизнь и рождение от начала пачки, мс. */
  life: number;
  born: number;
  colors: string[];
  /** Ускорение вниз, клетки/с². */
  g?: number;
  /** Пол: частица на нём останавливается и гаснет (камешки, осколки). */
  floor?: number;
  /** Две клетки в ширину. */
  size?: number;
}

/** Пачка частиц с момента `at`: искры, угли, осколки, камешки. */
export function particles(L: PxLayer, at: number, list: Particle[]): void {
  if (!list.length) return;
  const dur = Math.max(...list.map((p) => p.born + p.life));
  L.cells({
    at, dur,
    draw: (put, t) => {
      for (const p of list) {
        const age = (t - p.born) / 1000;
        if (age < 0 || age * 1000 > p.life) continue;
        const x = p.x + p.vx * age;
        let y = p.y + p.vy * age + 0.5 * (p.g ?? 0) * age * age;
        if (p.floor !== undefined && y > p.floor) y = p.floor;
        const c = p.colors[Math.min(p.colors.length - 1, Math.floor(((age * 1000) / p.life) * p.colors.length))];
        put(x, y, c);
        if (p.size && p.size > 1) put(x + 1, y, c);
      }
    },
  });
}
