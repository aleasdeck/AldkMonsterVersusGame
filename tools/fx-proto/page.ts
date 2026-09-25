// Страница обсуждения: два одинаковых поля Леса. Сверху — настоящие анимации игры (fx.ts как есть),
// снизу — прототип лепки приёмов (fxlepka.ts) на холсте в сетке 2 px. Враги — лепка из игры (forest.ts).
import { playShots, playAfter, type FxPlan, type Shot } from '../../src/ui/fx';
import { STATUS_COLORS } from '../../src/ui/icons';
import { renderSheet, type Sheet } from '../../src/ui/mobs/pixel';
import { MOB_STYLE } from '../../src/ui/mobs/styles';
import { FOREST_MODELS } from '../../src/ui/mobs/forest';
import { tintVar } from '../../src/ui/tint';
import * as FX from './fxlepka';

declare global {
  interface Window { ASSETS: { bg: string; heroes: Record<string, string> } }
}

// ─── Скорость и шаг ─────────────────────────────────────────────────────────

let SPEED = 1;
let STEPPED = false;
const origSetTimeout = window.setTimeout.bind(window);
(window as any).setTimeout = (fn: TimerHandler, ms?: number, ...rest: unknown[]) => origSetTimeout(fn, (ms ?? 0) / SPEED, ...rest);
const origAnimate = Element.prototype.animate;
Element.prototype.animate = function (this: Element, k: Keyframe[] | PropertyIndexedKeyframes | null, o?: number | KeyframeAnimationOptions) {
  const a = origAnimate.call(this, k, o);
  a.playbackRate = SPEED;
  return a;
};
const later = (ms: number, fn: () => void): void => void window.setTimeout(fn, ms);

// ─── Бойцы ──────────────────────────────────────────────────────────────────

const GROUND = 282;
type HeroId = 'warrior' | 'mage' | 'archer' | 'assassin';
const HEROES: Record<HeroId, { cell: number; body: number; box: number; blade: string }> = {
  warrior: { cell: 162, body: 107, box: 128, blade: '#dcdcdc' },
  mage: { cell: 186, body: 134, box: 120, blade: '#c9a227' },
  archer: { cell: 186, body: 170, box: 124, blade: '#e9c46a' },
  assassin: { cell: 182, body: 166, box: 120, blade: '#8d99ae' },
};
const HERO_X = 130;

interface Mob { id: string; uid: number; cx: number; sheet: { url: string; w: number; h: number; idle: number; hurt: number; attack: number }; idle: Sheet }
const FOES: Array<{ id: string; cx: number }> = [{ id: 'goblin', cx: 357 }, { id: 'cutthroat', cx: 590 }, { id: 'wolf', cx: 823 }];

function bakeMob(id: string): Mob['sheet'] & { idleSheet: Sheet } {
  const model = FOREST_MODELS[id];
  const idle = renderSheet(model, MOB_STYLE, 'idle');
  const hurt = renderSheet(model, MOB_STYLE, 'hurt');
  const attack = renderSheet(model, MOB_STYLE, 'attack');
  const c = document.createElement('canvas');
  c.width = idle.w * idle.frames.length;
  c.height = idle.h * 3;
  const ctx = c.getContext('2d')!;
  idle.frames.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f), idle.w, idle.h), i * idle.w, 0));
  hurt.frames.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f), hurt.w, hurt.h), i * hurt.w, idle.h));
  attack.frames.forEach((f, i) => ctx.putImageData(new ImageData(new Uint8ClampedArray(f), attack.w, attack.h), i * attack.w, idle.h * 2));
  return { url: c.toDataURL(), w: idle.w * idle.d, h: idle.h * idle.d, idle: idle.frames.length, hurt: hurt.frames.length, attack: attack.frames.length, idleSheet: idle };
}

let MOBS: Mob[] = [];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', style = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (style) el.setAttribute('style', style);
  return el;
}

// ─── Поле ───────────────────────────────────────────────────────────────────

interface Stage { root: HTMLElement; field: HTMLElement; heroZone: HTMLElement; heroSprite: HTMLElement; heroArt: HTMLElement; mobs: Map<number, HTMLElement>; layer?: PxLayer }

function buildStage(host: HTMLElement, side: 'old' | 'new'): Stage {
  const root = h('div', 'stage-scale');
  const field = h('div', 'field');
  root.appendChild(field);
  const bg = h('img', 'bg');
  bg.src = window.ASSETS.bg;
  bg.alt = '';
  field.appendChild(bg);
  const tint = tintVar('forest');
  const filter = tint ? 'url(#mv-tint-forest)' : '';
  const heroZone = h('div', 'hero-zone');
  const wrap = h('div', 'sprite-wrap');
  const heroSprite = h('div', 'sprite hero-box');
  const heroArt = h('div', 'hero-art');
  heroArt.style.filter = filter;
  heroSprite.appendChild(heroArt);
  wrap.appendChild(heroSprite);
  heroZone.appendChild(wrap);
  field.appendChild(heroZone);
  const mobs = new Map<number, HTMLElement>();
  for (const m of MOBS) {
    const z = h('div', 'enemy');
    z.dataset.uid = String(m.uid);
    const w = h('div', 'sprite-wrap');
    const s = h('div', 'sprite mob');
    s.style.cssText = `--sheet:url(${m.sheet.url});--w:${m.sheet.w}px;--h:${m.sheet.h}px;--cols:${m.sheet.idle};--n:${m.sheet.idle};--row:0;--dur:${3000 / SPEED}ms;filter:${filter}`;
    w.appendChild(s);
    z.appendChild(w);
    z.style.left = `${m.cx - m.sheet.w / 2}px`;
    z.style.top = `${GROUND - (m.idle.h - m.idle.foot) * m.idle.d}px`;
    field.appendChild(z);
    mobs.set(m.uid, s);
  }
  const st: Stage = { root, field, heroZone, heroSprite, heroArt, mobs };
  if (side === 'old') field.appendChild(h('div', 'fx-layer'));
  else {
    const c = h('canvas', 'pxfx');
    c.width = 480;
    c.height = 160;
    field.appendChild(c);
    st.layer = new PxLayer(c, st);
  }
  host.appendChild(root);
  const fit = () => {
    const k = host.clientWidth / 960;
    field.style.transform = `scale(${k})`;
    root.style.height = `${320 * k}px`;
  };
  new ResizeObserver(fit).observe(host);
  fit();
  return st;
}

function setHero(st: Stage, id: HeroId): void {
  const H = HEROES[id];
  const k = H.box / H.body;
  const cell = H.cell * k;
  st.heroSprite.style.cssText = `width:${H.box}px;height:${H.box}px`;
  st.heroZone.style.left = `${HERO_X - H.box / 2}px`;
  st.heroZone.style.top = `${GROUND - H.box}px`;
  st.heroArt.style.cssText += `;--cell:${cell}px;--sheet:url(${window.ASSETS.heroes[id]});--dur:${1600 / SPEED}ms`;
}

function hurtMob(st: Stage, uid: number): void {
  clipMob(st, uid, 'hurt');
}

/** Клип врага-лепки: урон (ряд 1) или удар (ряд 2, контакт на 333 мс). */
function clipMob(st: Stage, uid: number, clip: 'hurt' | 'attack'): void {
  const el = st.mobs.get(uid);
  const m = MOBS.find((x) => x.uid === uid);
  if (!el || !m) return;
  const n = clip === 'hurt' ? m.sheet.hurt : m.sheet.attack;
  el.classList.remove('once');
  el.style.setProperty('--row', clip === 'hurt' ? '1' : '2');
  el.style.setProperty('--n', String(n));
  el.style.setProperty('--dur', `${(n / 12) * 1000 / SPEED}ms`);
  void el.offsetWidth;
  el.classList.add('once');
  const back = () => {
    el.classList.remove('once');
    el.style.setProperty('--row', '0');
    el.style.setProperty('--n', String(m.sheet.idle));
    el.style.setProperty('--dur', `${3000 / SPEED}ms`);
  };
  el.addEventListener('animationend', back, { once: true });
}

function lunge(st: Stage): void {
  st.heroZone.classList.remove('acting');
  void st.heroZone.offsetWidth;
  st.heroZone.classList.add('acting');
}

// ─── Холст лепки ────────────────────────────────────────────────────────────

type Track = { start: number; end: number; draw: (ctx: CanvasRenderingContext2D, t: number) => void };

class PxLayer implements FX.Layer {
  private tracks: Track[] = [];
  private events: Array<{ t: number; fn: () => void }> = [];
  private vt = 0;
  private last = performance.now();
  private ctx: CanvasRenderingContext2D;
  /** Какие клипы сыграл последний приём — для ленты кадров. */
  used: FX.Frame[][] = [];

  constructor(canvas: HTMLCanvasElement, private st: Stage) {
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    const tick = (now: number) => {
      this.frame(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  reset(): void {
    this.tracks = [];
    this.events = [];
    this.used = [];
  }

  private q(t: number): number {
    return STEPPED ? Math.floor(t / (1000 / 12)) * (1000 / 12) : t;
  }

  private note(frames: FX.Frame[]): void {
    if (!this.used.includes(frames)) this.used.push(frames);
  }

  sprite(frames: FX.Frame[] | ((t: number) => FX.Frame[]), o: { at: number; fps?: number; dur?: number; loop?: boolean; pos: (t: number) => [number, number]; frameAt?: (t: number) => number }): void {
    const fps = o.fps ?? 12;
    const get = typeof frames === 'function' ? frames : () => frames;
    if (typeof frames === 'function') { for (const t of [0, 200, 400, 600, 800, 1e9]) this.note(frames(t)); } else this.note(frames);
    const n0 = get(0).length;
    const dur = o.dur ?? (n0 * 1000) / fps;
    this.tracks.push({
      start: this.vt + o.at, end: this.vt + o.at + dur,
      draw: (ctx, t) => {
        const list = get(t);
        let i = o.frameAt ? o.frameAt(t) : Math.floor((t * fps) / 1000);
        if (i < 0) return;
        i = o.loop ? i % list.length : Math.min(list.length - 1, i);
        const f = list[i];
        const [x, y] = o.pos(this.q(t));
        ctx.drawImage(f.c, Math.round(x) - f.ax, Math.round(y) - f.ay);
      },
    });
  }

  cells(o: { at: number; dur: number; draw: (put: FX.Put, t: number) => void }): void {
    this.tracks.push({
      start: this.vt + o.at, end: this.vt + o.at + o.dur,
      draw: (ctx, t) => {
        o.draw((x, y, color, a = 1) => {
          if (a <= 0) return;
          ctx.globalAlpha = Math.min(1, a);
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        }, this.q(t));
        ctx.globalAlpha = 1;
      },
    });
  }

  at(ms: number, fn: () => void): void {
    this.events.push({ t: this.vt + ms, fn });
  }

  flash(who: 'hero' | number, color: string, ms: number, at: number): void {
    this.at(at, () => {
      const el = who === 'hero' ? this.st.heroArt : this.st.mobs.get(MOBS[who]?.uid ?? -1);
      if (!el) return;
      // Осветление без размытия: пиксели остаются резкими, ореол рисует сам эффект.
      el.animate([{ filter: `${el.style.filter} brightness(1)` }, { filter: `${el.style.filter} brightness(1.7) saturate(1.3)`, offset: 0.3 }, { filter: `${el.style.filter} brightness(1)` }], { duration: ms });
      void color;
    });
  }

  shake(ms: number, at: number): void {
    this.at(at, () => {
      const k = ['2px 0', '-2px 0', '2px -2px', '-2px 0', '0 2px', '0 0'];
      this.st.field.animate(k.map((translate) => ({ translate, easing: 'steps(1, end)' })), { duration: ms });
    });
  }

  private frame(now: number): void {
    this.vt += (now - this.last) * SPEED;
    this.last = now;
    const due = this.events.filter((e) => e.t <= this.vt);
    this.events = this.events.filter((e) => e.t > this.vt);
    for (const e of due) e.fn();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 480, 160);
    this.tracks = this.tracks.filter((tr) => tr.end > this.vt);
    for (const tr of this.tracks) if (this.vt >= tr.start) tr.draw(ctx, this.vt - tr.start);
  }
}

// ─── Силуэт героя ───────────────────────────────────────────────────────────

/** Маски восьми кадров покоя в сетке 2 px: по ним варианты рисуют контур, латы и жар по фигуре. */
const MASKS: Partial<Record<HeroId, FX.Mask[]>> = {};

async function buildMasks(id: HeroId): Promise<void> {
  const H = HEROES[id];
  const img = new Image();
  img.src = window.ASSETS.heroes[id];
  await img.decode();
  const A = (H.cell * H.box) / H.body;
  const n = Math.round(A / 2);
  const x0 = Math.round((HERO_X - A / 2) / 2), y0 = Math.round((GROUND - H.box / 2 - A / 2) / 2);
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  MASKS[id] = Array.from({ length: 8 }, (_, f) => {
    ctx.clearRect(0, 0, n, n);
    ctx.drawImage(img, f * H.cell, 0, H.cell, H.cell, 0, 0, n, n);
    const d = ctx.getImageData(0, 0, n, n).data;
    const m = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++) m[k] = d[k * 4 + 3] > 120 ? 1 : 0;
    return { x0, y0, w: n, h: n, m };
  });
}

/** Маски кадров покоя врагов: лепка уже лежит в сетке 2 px, клетка листа — клетка холста. */
const MOB_MASKS: FX.Mask[][] = [];

function buildMobMasks(): void {
  MOBS.forEach((m, i) => {
    const s = m.idle;
    const x0 = Math.round((m.cx - m.sheet.w / 2) / 2), y0 = Math.round((GROUND - (s.h - s.foot) * s.d) / 2);
    MOB_MASKS[i] = s.frames.map((f) => {
      const mm = new Uint8Array(s.w * s.h);
      for (let k = 0; k < mm.length; k++) mm[k] = f[k * 4 + 3] === 255 ? 1 : 0;
      return { x0, y0, w: s.w, h: s.h, m: mm };
    });
  });
}

/** Кадр, который боец показывает сейчас: по времени его CSS-анимации покоя. */
function maskNow(st: Stage, id: HeroId, who: 'hero' | number = 'hero'): FX.Mask | null {
  const list = who === 'hero' ? MASKS[id] : MOB_MASKS[who];
  const el = who === 'hero' ? st.heroArt : st.mobs.get(MOBS[who]?.uid ?? -1);
  if (!list || !el) return null;
  const a = el.getAnimations()[0];
  const n = list.length;
  // Во время клипа урона или удара ряд другой — берём первый кадр покоя.
  if (who !== 'hero' && el.classList.contains('once')) return list[0];
  const dur = Number(a?.effect?.getComputedTiming().duration) || (who === 'hero' ? 1600 : 3000);
  const t = Number(a?.currentTime ?? 0);
  return list[Math.floor(((t % dur) / dur) * n) % n];
}

// ─── Тела в клетках холста ──────────────────────────────────────────────────

function heroBody(id: HeroId): FX.Body {
  const H = HEROES[id];
  const w = H.box * 0.5;
  return { cx: HERO_X / 2, cy: (GROUND - H.box / 2) / 2, top: (GROUND - H.box) / 2, bottom: GROUND / 2, w: w / 2, h: H.box / 2 };
}

function mobBody(m: Mob): FX.Body {
  const s = m.idle;
  const d = s.d;
  const left = m.cx - m.sheet.w / 2 + s.left * d;
  const right = m.cx + m.sheet.w / 2 - s.right * d;
  const frameTop = GROUND - (s.h - s.foot) * d;
  const top = frameTop + s.top * d;
  return { cx: (left + right) / 4, cy: (top + GROUND) / 4, top: top / 2, bottom: GROUND / 2, w: (right - left) / 2, h: (GROUND - top) / 2 };
}

// ─── Приёмы ─────────────────────────────────────────────────────────────────

interface Demo {
  id: string;
  name: string;
  hero: HeroId;
  /** Индексы врагов: по кому бьёт. */
  hit: number[];
  melee?: boolean;
  now: string;
  next: string;
  old: () => { shots: Array<Omit<Shot, 'from' | 'delay'> & { delay?: number; to: number }>; after: Array<{ kind: 'glow' | 'cloud' | 'shield' | 'drink'; color: string; target: 'hero' | number }> };
  neu: (S: FX.Scene) => number;
  /** Гоблин бьёт героя через `at` мс (проверка блока): клип удара в обоих полях. */
  enemyAt?: number;
  /** Сколько длится показ, мс (автопоказ ждёт). */
  dur?: number;
}

const SC = STATUS_COLORS;
const DEMOS: Demo[] = [
  {
    id: 'attack', name: 'Атака мечом', hero: 'warrior', hit: [0], melee: true,
    now: 'Клинок 7×16 в пикселях по 4 px проворачивается над целью, в момент удара — CSS-полоса с размытием.',
    next: 'Мазок клинка по дуге в сетке 2 px: пять кадров по 12 в секунду, полная дуга с белым ядром — ровно в кадр попадания. Вспышка-крест и искры клетками.',
    old: () => ({ shots: [{ kind: 'melee', color: '#ffffff', blade: '#dcdcdc', to: 1 }], after: [] }),
    neu: (S) => FX.slash(S, { edge: '#aeb9c8', hitEdge: '#ffffff' }),
  },
  {
    id: 'bleed', name: 'Кровопускание', hero: 'warrior', hit: [0], melee: true,
    now: 'Тот же клинок, росчерк красный; кровотечение — облако из четырёх красных клубов.',
    next: 'Мазок с красной кромкой. Кровотечение — капли: брызгают из раны от героя, падают на пол и лежат брызгом.',
    old: () => ({ shots: [{ kind: 'melee', color: '#e63946', blade: '#dcdcdc', to: 1 }], after: [{ kind: 'cloud', color: SC.bleed, target: 1 }] }),
    neu: (S) => FX.slash(S, { edge: '#e63946', seed: 4, after: (at) => FX.bloodDrops(S, at) }),
  },
  {
    id: 'stun', name: 'Оглушающий удар', hero: 'warrior', hit: [0], melee: true,
    now: 'Клинок с жёлтым росчерком; оглушение — серое облако, то же, что у слабости или яда, только другого цвета.',
    next: 'Мазок с золотой кромкой. Оглушение — три звезды кружат над головой: ближняя крупнее и светлее, дальняя темнее, круг за восемь кадров.',
    old: () => ({ shots: [{ kind: 'melee', color: '#ffd166', blade: '#dcdcdc', to: 1 }], after: [{ kind: 'cloud', color: SC.stun, target: 1 }] }),
    neu: (S) => FX.slash(S, { edge: '#ffd166', seed: 6, after: (at) => FX.stunStars(S, at + 60) }),
  },
  {
    id: 'arrow', name: 'Выстрел из лука', hero: 'archer', hit: [2],
    now: 'Стрела 14×5 плоскими цветами, пиксель 3 px; у цели гаснет прозрачностью.',
    next: 'Лепленая стрела: древко, стальной наконечник с фаской, оперение цветом лука; угол полёта запечён в кадры. В цели застревает и дрожит, потом растворяется по клеткам.',
    old: () => ({ shots: [{ kind: 'arrow', color: '#e9c46a', blade: '#e9c46a', to: 3 }], after: [] }),
    neu: (S) => FX.arrow(S, { feather: '#e9c46a' }),
  },
  {
    id: 'fireball', name: 'Огненный шар', hero: 'mage', hit: [1],
    now: 'Шар 7×7 с CSS-свечением летит и раздувается прозрачностью; горение — оранжевое облако.',
    next: 'Огонь из Пещер (три слоя FLAME): шар мерцает, за ним угли остывают от жёлтого к бурому. Взрыв — языки во все стороны, потом клубы дыма. Горение — три языка пламени у ног цели.',
    old: () => ({ shots: [{ kind: 'orb', color: '#ff7b00', blade: '#c9a227', to: 2 }], after: [{ kind: 'cloud', color: SC.burn, target: 2 }] }),
    neu: (S) => FX.fireball(S, { burn: true }),
  },
  {
    id: 'ice', name: 'Ледяной осколок', hero: 'mage', hit: [2],
    now: 'Тот же шар, голубой. Холод на рядовом враге сейчас не виден совсем: не входит в список дебафов, а свечение рисуется только элите и боссам.',
    next: 'Кристалл с гранями и бликом, за ним иней. В цели разбивается на осколки, которые падают; лучи инея расходятся. Холод — снежинки на цель и иней, нарастающий у ног.',
    old: () => ({ shots: [{ kind: 'orb', color: '#7fd7ff', blade: '#c9a227', to: 3 }], after: [] }),
    neu: (S) => FX.iceShard(S),
  },
  {
    id: 'chain', name: 'Цепная молния', hero: 'mage', hit: [0, 1, 2],
    now: 'Три жёлтых шара по очереди, каждый 330 мс летит к своей цели.',
    next: 'Дуга от руки к первому врагу и дальше по ряду: излом меняется каждые 50 мс, отросток с середины, ореол клетками. Удар мгновенный, в каждой цели — вспышка лучей.',
    old: () => ({ shots: [0, 1, 2].map((i) => ({ kind: 'orb' as const, color: '#ffe45c', blade: '#c9a227', to: i + 1, delay: i * 70 })), after: [] }),
    neu: (S) => FX.chainLightning(S),
  },
  {
    id: 'poison', name: 'Флакон яда', hero: 'assassin', hit: [1],
    now: 'Склянка 7×9 кувыркается по дуге (CSS-поворот размывает пиксели) и разбивается четырьмя клубами.',
    next: 'Лепленая склянка: стекло с бликом, светящаяся жидкость, пробка; восемь кадров кувырка запечены, пиксели не плывут. Брызги и осколки стекла, потом ядовитая туча одной поверхностью, в ней лопаются пузыри.',
    old: () => ({ shots: [{ kind: 'flask', color: '#7ddc5a', blade: '#8d99ae', to: 2 }], after: [] }),
    neu: (S) => FX.flask(S, { liquid: '#7ddc5a', cloud: '#9fcf66' }),
  },
  {
    id: 'block', name: 'Защититься', hero: 'warrior', hit: [],
    now: 'Щит 11×13 плоскими цветами (пиксель 4 px), CSS-масштаб и размытое свечение героя.',
    next: 'Латы (выбрано): сталь ложится по контуру Воина от ступней к макушке, пробегает блик, дальше держится тонким стальным контуром. Удар гоблина звенит вспышкой всего контура и сбивает пластины со стороны врага; в начале хода латы тают.',
    old: () => ({ shots: [], after: [{ kind: 'shield', color: '#8ecae6', target: 'hero' }] }),
    neu: (S) => FX.blockPlates(S, { color: '#8ecae6', hitAt: 1033, endAt: 1900 }),
    enemyAt: 700, dur: 2700,
  },
  {
    id: 'heal', name: 'Лечение', hero: 'mage', hit: [],
    now: 'Свечение героя. Цвет — пурпурный: «Лечение» магическое, и его свечение перебивает зелёное свечение самого лечения.',
    next: 'Зелёный круг света у ног, вверх поднимаются искры и крестики, мерцают и гаснут; герой коротко светлеет.',
    old: () => ({ shots: [], after: [{ kind: 'glow', color: '#b388ff', target: 'hero' }] }),
    neu: (S) => FX.heal(S, { color: '#80ed99' }),
  },
  {
    id: 'warcry', name: 'Боевой клич', hero: 'warrior', hit: [],
    now: 'Свечение героя жёлтым и четыре искры 3×3 вверх — так же выглядят Адреналин, Эхо удара, Верный глаз и ещё 11 приёмов на себя.',
    next: 'Рёв (выбрано): от лица к врагам расходятся волны крика, у ног взметается пыль, поле вздрагивает.',
    old: () => ({ shots: [], after: [{ kind: 'glow', color: '#ffd166', target: 'hero' }] }),
    neu: (S) => FX.cryRoar(S),
  },
];

// ─── Розыгрыш ───────────────────────────────────────────────────────────────

let OLD: Stage;
let NEW: Stage;
let current = DEMOS[0];
let heroNow: HeroId | null = null;

function ensureHero(id: HeroId): void {
  if (heroNow === id) return;
  heroNow = id;
  setHero(OLD, id);
  setHero(NEW, id);
}

function playOld(d: Demo): void {
  const spec = d.old();
  const shots: Shot[] = spec.shots.map((s) => ({ ...s, from: 'hero', delay: s.delay ?? 0 }));
  const FLIGHT: Record<string, number> = { melee: 260, arrow: 260, orb: 330, flask: 440 };
  const plan: FxPlan = { shots, impact: Math.max(0, ...shots.map((s) => s.delay + FLIGHT[s.kind])), after: [], lunged: new Set() };
  const impact = playShots(OLD.root, plan);
  if (d.enemyAt !== undefined) later(d.enemyAt, () => clipMob(OLD, 1, 'attack'));
  later(impact, () => {
    for (const s of shots) later(s.delay + FLIGHT[s.kind] - impact, () => hurtMob(OLD, s.to as number));
    for (const a of spec.after) playAfter(OLD.root, { kind: a.kind, color: a.color, target: a.target as never });
  });
}

function runOn(st: Stage, hero: HeroId, hit: number[], fn: (S: FX.Scene) => number, o: { melee?: boolean; enemyAt?: number } = {}): FX.Frame[][] {
  const L = st.layer!;
  L.reset();
  if (o.melee) lunge(st);
  if (o.enemyAt !== undefined) later(o.enemyAt, () => clipMob(st, 1, 'attack'));
  const targets = hit.length ? hit.map((i) => mobBody(MOBS[i])) : [mobBody(MOBS[0])];
  const scene: FX.Scene = {
    layer: L, hero: heroBody(hero), targets, all: MOBS.map(mobBody),
    hurt: (i) => { const idx = hit[i]; if (idx !== undefined) hurtMob(st, MOBS[idx].uid); },
    mask: (who = 'hero') => maskNow(st, hero, who),
  };
  fn(scene);
  return L.used;
}

function playNew(d: Demo): FX.Frame[][] {
  return runOn(NEW, d.hero, d.hit, d.neu, { melee: d.melee, enemyAt: d.enemyAt });
}

function play(d: Demo): void {
  current = d;
  ensureHero(d.hero);
  playOld(d);
  const used = playNew(d);
  renderCaption(d);
  renderStrip(used, 'strip');
  document.querySelectorAll<HTMLButtonElement>('#skills .skill').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === d.id)));
}

function renderCaption(d: Demo): void {
  const c = document.getElementById('cap')!;
  c.querySelector('.cap-name')!.textContent = d.name;
  c.querySelector('.cap-now')!.textContent = d.now;
  c.querySelector('.cap-next')!.textContent = d.next;
}

function renderStrip(used: FX.Frame[][], id: string): void {
  const host = document.getElementById(id)!;
  host.textContent = '';
  if (!used.length) {
    const p = h('p', 'note');
    p.textContent = 'Этот вариант рисуется клетками прямо на холсте, без запечённых кадров: форма считается каждый кадр от силуэта бойца и времени.';
    host.appendChild(p);
    return;
  }
  const Z = 3;
  for (const frames of used) {
    const row = h('div', 'strip-row');
    const c = h('canvas', 'strip-canvas');
    const W = frames[0].W, H = frames[0].H;
    c.width = frames.length * (W + 2) * Z;
    c.height = H * Z;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    frames.forEach((f, i) => {
      ctx.fillStyle = i % 2 ? '#1c1a22' : '#211f28';
      ctx.fillRect(i * (W + 2) * Z, 0, W * Z, H * Z);
      ctx.drawImage(f.c, i * (W + 2) * Z, 0, W * Z, H * Z);
    });
    const label = h('span', 'strip-label');
    label.textContent = `${frames.length} ${frames.length === 1 ? 'кадр' : frames.length < 5 ? 'кадра' : 'кадров'} · ${W}×${H} пикс.`;
    row.append(label, c);
    host.appendChild(row);
  }
}

// ─── Автопоказ и кнопки ─────────────────────────────────────────────────────

let auto = true;
let autoTimer = 0;
function scheduleAuto(): void {
  window.clearTimeout(autoTimer);
  if (!auto) return;
  autoTimer = origSetTimeout(() => {
    const i = (DEMOS.indexOf(current) + 1) % DEMOS.length;
    play(DEMOS[i]);
    scheduleAuto();
  }, (current.dur ?? 2600) / SPEED);
}

// ─── Варианты клича и блока ─────────────────────────────────────────────────

interface Variant { id: string; group: 'cry' | 'block'; letter: string; name: string; rec?: boolean; text: string; run: (S: FX.Scene) => number; enemyAt?: number; strikeAt?: number; dur: number }
const BLOCK = { color: '#8ecae6', hitAt: 1033, endAt: 1900 };
const VARIANTS: Variant[] = [
  {
    id: 'cry-a', group: 'cry', letter: 'А', name: 'Рёв', rec: true, dur: 2000,
    text: 'Клич — это крик, эффект показывает само действие. От лица героя к врагам расходятся три волны, дальние рвутся на куски; у ног взметается пыль и подскакивают камешки, поле вздрагивает на 2 px. Что герой получил Силу, видно по иконке над головой.',
    run: (S) => FX.cryRoar(S),
  },
  {
    id: 'cry-b', group: 'cry', letter: 'Б', name: 'Жар в жилах', dur: 2000,
    text: 'Эффект по силуэту героя: край фигуры наливается багровым, контур дважды вспыхивает и расходится кольцом, с плеч валит красный пар. Показывает результат: герой набрал Силу. Больше подходит Ярости, где Сила берётся ценой HP.',
    run: (S) => FX.cryVeins(S),
  },
  {
    id: 'cry-c', group: 'cry', letter: 'В', name: 'Знак силы', dur: 2000,
    text: 'Над героем встаёт крупная стрелка Силы, та же, что потом висит иконкой над головой. Она бьёт кольцом лучей и уменьшается до размера иконки, по бокам поднимаются шевроны. Такой язык годится любому статусу, у которого нет своего рисунка.',
    run: (S) => FX.crySigil(S),
  },
  {
    id: 'block-a', group: 'block', letter: 'А', name: 'Барьер', dur: 2800, enemyAt: 700,
    text: 'Блок — это стена со стороны врагов. Она вырастает из земли пластинами в две клетки, по ней пробегает блик, дальше она стоит тусклой, пока держится блок. Удар гоблина вспыхивает в точке попадания и расходится волной вверх и вниз, откалывая куски. В начале хода барьер осыпается. Высоту или яркость можно привязать к числу блока; у врагов барьер стоит перед ними, зеркально.',
    run: (S) => FX.blockBarrier(S, BLOCK),
  },
  {
    id: 'block-b', group: 'block', letter: 'Б', name: 'Латы', rec: true, dur: 2800, enemyAt: 700,
    text: 'Сталь ложится по контуру самого бойца, от ступней к макушке, со швами пластин и светом сверху слева; по готовым латам пробегает блик. Держится тонким стальным контуром. От удара звенит вспышкой весь контур, и со стороны врага слетают пластины; в начале хода латы тают. Работает у любого бойца, потому что строится по его силуэту.',
    run: (S) => FX.blockPlates(S, BLOCK),
  },
  {
    id: 'block-foe', group: 'block', letter: 'Б', name: 'Латы на враге', rec: true, dur: 2800, strikeAt: 773,
    text: 'Те же латы у врага: блок есть у 44 врагов из 69, и латы строятся по силуэту их лепки без отдельного рисунка. Гоблин ставит блок, Воин бьёт по нему. Удар звенит по контуру, пластины слетают со стороны героя, клипа урона нет, потому что удар целиком ушёл в блок. В начале хода латы тают.',
    run: (S) => {
      FX.blockPlates(S, { ...BLOCK, who: 0 });
      S.layer.at(773, () => FX.slash({ ...S, hurt: () => {} }, { edge: '#aeb9c8', hitEdge: '#ffffff' }));
      return 0;
    },
  },
  {
    id: 'block-c', group: 'block', letter: 'В', name: 'Купол', dur: 2800, enemyAt: 700,
    text: 'Над бойцом от земли вырастает полусфера с треугольной решёткой, по ней проходит блик; потом видны только тусклые край и решётка. Удар расходится кругом по решётке от точки попадания; в начале хода купол рассыпается. Больше подходит Магическому щиту, чем обычной защите.',
    run: (S) => FX.blockDome(S, BLOCK),
  },
];

let VAR: Stage;
let varCurrent = VARIANTS[0];
let varAuto = true;
let varTimer = 0;

function playVariant(v: Variant): void {
  varCurrent = v;
  const used = runOn(VAR, 'warrior', [], v.run, { enemyAt: v.enemyAt });
  if (v.strikeAt !== undefined) later(v.strikeAt, () => lunge(VAR));
  const cap = document.getElementById('var-cap')!;
  cap.querySelector('.cap-name')!.textContent = `${v.group === 'cry' ? 'Боевой клич' : 'Блок'} ${v.letter} · ${v.name}`;
  cap.querySelector('.var-text')!.textContent = v.text;
  document.getElementById('var-note')!.textContent = v.id === 'block-foe' ? 'Воин бьёт гоблина на 1,0 с, следующий ход — на 1,9 с' : v.group === 'block' ? 'гоблин бьёт на 1,0 с, следующий ход — на 1,9 с' : 'Воин, приём на себя';
  renderStrip(used, 'var-strip');
  document.querySelectorAll<HTMLButtonElement>('.variant').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === v.id)));
}

function scheduleVar(): void {
  window.clearTimeout(varTimer);
  if (!varAuto) return;
  varTimer = origSetTimeout(() => {
    playVariant(VARIANTS[(VARIANTS.indexOf(varCurrent) + 1) % VARIANTS.length]);
    scheduleVar();
  }, varCurrent.dur / SPEED);
}

async function boot(): Promise<void> {
  MOBS = FOES.map((f, i) => {
    const b = bakeMob(f.id);
    return { id: f.id, uid: i + 1, cx: f.cx, sheet: b, idle: b.idleSheet };
  });
  OLD = buildStage(document.getElementById('stage-old')!, 'old');
  NEW = buildStage(document.getElementById('stage-new')!, 'new');
  VAR = buildStage(document.getElementById('stage-var')!, 'new');
  setHero(VAR, 'warrior');
  await Promise.all((Object.keys(HEROES) as HeroId[]).map((id) => buildMasks(id).catch(() => undefined)));
  buildMobMasks();
  for (const v of VARIANTS) {
    const b = h('button', 'skill variant');
    b.type = 'button';
    b.dataset.id = v.id;
    b.textContent = `${v.letter} · ${v.name}`;
    if (v.rec) b.classList.add('rec');
    b.addEventListener('click', () => {
      setVarAuto(false);
      playVariant(v);
    });
    document.getElementById(v.group === 'cry' ? 'var-cry' : 'var-block')!.appendChild(b);
  }
  const varAutoBtn = document.getElementById('var-auto') as HTMLButtonElement;
  const setVarAuto = (on: boolean) => {
    varAuto = on;
    varAutoBtn.setAttribute('aria-pressed', String(on));
    scheduleVar();
  };
  varAutoBtn.addEventListener('click', () => setVarAuto(!varAuto));
  document.getElementById('var-replay')!.addEventListener('click', () => playVariant(varCurrent));
  const list = document.getElementById('skills')!;
  for (const d of DEMOS) {
    const b = h('button', 'skill');
    b.type = 'button';
    b.dataset.id = d.id;
    b.textContent = d.name;
    b.addEventListener('click', () => {
      setAuto(false);
      play(d);
    });
    list.appendChild(b);
  }
  const autoBtn = document.getElementById('auto') as HTMLButtonElement;
  const setAuto = (on: boolean) => {
    auto = on;
    autoBtn.setAttribute('aria-pressed', String(on));
    scheduleAuto();
  };
  autoBtn.addEventListener('click', () => setAuto(!auto));
  document.getElementById('replay')!.addEventListener('click', () => play(current));
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    SPEED = Number(b.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.documentElement.style.setProperty('--spd', String(SPEED));
    for (const st of [OLD, NEW, VAR]) {
      st.heroArt.style.setProperty('--dur', `${1600 / SPEED}ms`);
      st.mobs.forEach((el) => { if (!el.classList.contains('once')) el.style.setProperty('--dur', `${3000 / SPEED}ms`); });
    }
    play(current);
    scheduleAuto();
    playVariant(varCurrent);
    scheduleVar();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => {
    STEPPED = b.dataset.step === '1';
    document.querySelectorAll('[data-step]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    play(current);
    playVariant(varCurrent);
  }));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setAuto(false); setVarAuto(false); }
  play(DEMOS[0]);
  scheduleAuto();
  playVariant(VARIANTS[0]);
  scheduleVar();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => void boot());
else void boot();
