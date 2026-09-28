// Анимация на странице обсуждения: бойцы — холсты на поле, кадры клипов рисует движок лепки один раз и хранит холстами,
// общий цикл кадров листает их по виртуальному времени (скорость ½×, ¼× — для разбора кадров).
import { renderSheet, type Model, type Sheet, type Style } from '../../src/ui/mobs/pixel';
import { MOB_STYLE } from '../../src/ui/mobs/styles';
import { HERO_CLIPS, renderHeroClip, type HeroClip } from './hero';

/** Клип бойца: кадры холстами, частота, повтор или держать последний кадр. */
export interface Anim { frames: HTMLCanvasElement[]; fps: number; loop: boolean; hold: boolean; contact?: number }

/**
 * Набор клипов бойца: размер кадра на поле и точка опоры (середина фигуры в покое, линия земли) общие для всех клипов,
 * поэтому смена клипа не сдвигает фигуру. Клипы рисуются по запросу (`get`) — первый раз с заминкой.
 */
export interface ActorSet {
  w: number; h: number; ax: number; ay: number; smooth?: boolean;
  get(clip: string): Anim | undefined;
  has(clip: string): boolean;
}

function toCanvas(px: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0);
  return c;
}

/** Опора по первому кадру покоя: середина видимой фигуры и линия земли. */
function anchor(sh: Sheet, model: Model): { ax: number; ay: number } {
  const f = sh.frames[0];
  let x0 = sh.w, x1 = 0;
  for (let j = 0; j < sh.h; j++) for (let i = 0; i < sh.w; i++) if (f[(j * sh.w + i) * 4 + 3] === 255) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); }
  return { ax: ((x0 + x1 + 1) / 2) * sh.d, ay: Math.round((model.ground + (model.pad ?? 22)) / sh.d) * sh.d };
}

/** Герой-лепка: клипы из HERO_CLIPS. */
export function heroSet(model: Model, style: Style): ActorSet {
  const cache = new Map<string, Anim>();
  const make = (clip: string): Anim => {
    const spec = HERO_CLIPS[clip as HeroClip];
    const sh = renderHeroClip(model, clip as HeroClip, style);
    return { frames: sh.frames.map((f) => toCanvas(f, sh.w, sh.h)), fps: spec.fps, loop: clip === 'idle', hold: !!spec.hold, contact: spec.contact };
  };
  const idle = renderHeroClip(model, 'idle', style);
  cache.set('idle', { frames: idle.frames.map((f) => toCanvas(f, idle.w, idle.h)), fps: HERO_CLIPS.idle.fps, loop: true, hold: false });
  const { ax, ay } = anchor(idle, model);
  return {
    w: idle.w * idle.d, h: idle.h * idle.d, ax, ay,
    has: (clip) => cache.has(clip),
    get(clip) {
      if (!(clip in HERO_CLIPS)) return undefined;
      let a = cache.get(clip);
      if (!a) cache.set(clip, (a = make(clip)));
      return a;
    },
  };
}

/** Враг-лепка: покой, удар и урон из игры. */
export function mobSet(model: Model): ActorSet {
  const cache = new Map<string, Anim>();
  const make = (clip: 'idle' | 'attack' | 'hurt'): Anim => {
    const sh = renderSheet(model, MOB_STYLE, clip);
    return { frames: sh.frames.map((f) => toCanvas(f, sh.w, sh.h)), fps: sh.fps, loop: clip === 'idle', hold: false, contact: clip === 'attack' ? MOB_STYLE.clips.attack.contact : undefined };
  };
  const idle = renderSheet(model, MOB_STYLE, 'idle');
  cache.set('idle', { frames: idle.frames.map((f) => toCanvas(f, idle.w, idle.h)), fps: idle.fps, loop: true, hold: false });
  const { ax, ay } = anchor(idle, model);
  return {
    w: idle.w * idle.d, h: idle.h * idle.d, ax, ay,
    has: (clip) => cache.has(clip),
    get(clip) {
      if (clip !== 'idle' && clip !== 'attack' && clip !== 'hurt') return undefined;
      let a = cache.get(clip);
      if (!a) cache.set(clip, (a = make(clip)));
      return a;
    },
  };
}

/**
 * Нынешний рисованный Воин: ряды листа — battle (покой в бою), attack, power, block, hurt, death; по 8 кадров,
 * длительности — CLIP_MS из heroSprite.ts. Клипов, которых на листе нет, — как в игре, по цепочке замен.
 */
export function refSet(img: HTMLImageElement): ActorSet {
  const cell = 162, k = 128 / 107;
  const ROWS: Record<string, { row: number; ms: number; loop?: boolean; hold?: boolean }> = {
    idle: { row: 1, ms: 1300, loop: true }, attack: { row: 2, ms: 520 }, attack_thrust: { row: 2, ms: 520 }, heavy: { row: 2, ms: 640 },
    heavy_thrust: { row: 2, ms: 640 }, heal_kneel: { row: 3, ms: 1000 }, power: { row: 3, ms: 560 },
    heal: { row: 3, ms: 800 }, buff: { row: 3, ms: 560 }, block: { row: 4, ms: 560 }, hurt: { row: 5, ms: 400 },
    death: { row: 6, ms: 1000, hold: true }, bash: { row: 3, ms: 560 }, riposte: { row: 2, ms: 520 },
  };
  const cache = new Map<string, Anim>();
  return {
    w: cell * k, h: cell * k, ax: ((31 + 134) / 2) * k, ay: 135 * k, smooth: true,
    has: (clip) => cache.has(clip),
    get(clip) {
      const r = ROWS[clip];
      if (!r) return undefined;
      let a = cache.get(clip);
      if (!a) {
        const frames = Array.from({ length: 8 }, (_, i) => {
          const c = document.createElement('canvas');
          c.width = cell;
          c.height = cell;
          c.getContext('2d')!.drawImage(img, i * cell, r.row * cell, cell, cell, 0, 0, cell, cell);
          return c;
        });
        cache.set(clip, (a = { frames, fps: 8000 / r.ms, loop: !!r.loop, hold: !!r.hold, contact: clip === 'block' ? 3 : 4 }));
      }
      return a;
    },
  };
}

// ─── Часы и бойцы ──────────────────────────────────────────────────────────

let speed = 1;
let virt = 0;
let last = performance.now();
export function setSpeed(k: number): void {
  speed = k;
}
/** Виртуальное время страницы, мс: идёт со скоростью `speed`. */
export const now = (): number => virt;

const events: Array<{ t: number; fn: () => void }> = [];
/** Сделать что-то через `ms` виртуального времени. */
export function later(ms: number, fn: () => void): void {
  events.push({ t: virt + ms, fn });
}

const actors = new Set<Actor>();

export class Actor {
  readonly el: HTMLCanvasElement;
  clip = 'idle';
  t0 = 0;
  private drawn = '';
  /** Повтор клипа на плитке: сыграть, постоять в покое `gap` мс, снова. */
  auto?: { clip: string; gap: number };
  constructor(readonly set: ActorSet, x: number, ground: number, filter: string) {
    const c = document.createElement('canvas');
    c.className = set.smooth ? 'fig smooth' : 'fig';
    c.style.cssText = `left:${x - set.ax}px;top:${ground - set.ay}px;width:${set.w}px;height:${set.h}px;${filter ? `filter:${filter}` : ''}`;
    this.el = c;
    this.t0 = -Math.random() * 3000;
    actors.add(this);
  }
  play(clip: string): void {
    if (!this.set.get(clip)) return;
    this.clip = clip;
    this.t0 = virt;
  }
  /** Кадр сейчас; одноразовый клип кончился — покой (смерть держит последний кадр 1.2 с). */
  step(): void {
    if (!this.el.isConnected) {
      actors.delete(this);
      return;
    }
    let a = this.set.get(this.clip)!;
    let e = virt - this.t0;
    let f = Math.floor((e * a.fps) / 1000);
    if (!a.loop && f >= a.frames.length) {
      const holdMs = a.hold ? 1200 : 0;
      if (e - (a.frames.length * 1000) / a.fps < holdMs) f = a.frames.length - 1;
      else {
        const done = this.clip;
        this.clip = 'idle';
        this.t0 = virt;
        if (this.auto && this.auto.clip === done) later(this.auto.gap, () => this.auto && this.play(this.auto.clip));
        a = this.set.get('idle')!;
        e = 0;
        f = 0;
      }
    }
    if (a.loop) f %= a.frames.length;
    const key = `${this.clip}:${f}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const src = a.frames[f];
    if (this.el.width !== src.width || this.el.height !== src.height) {
      this.el.width = src.width;
      this.el.height = src.height;
    }
    const ctx = this.el.getContext('2d')!;
    ctx.clearRect(0, 0, this.el.width, this.el.height);
    ctx.drawImage(src, 0, 0);
  }
}

function frame(t: number): void {
  virt += (t - last) * speed;
  last = t;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].t <= virt) {
      const ev = events.splice(i, 1)[0];
      ev.fn();
    }
  }
  for (const a of actors) a.step();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
